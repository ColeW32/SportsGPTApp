// Port of SportsGPTViewModel (SportsGPTModels.swift:15-131). One behavior change per the
// spec: the free-message limit is now enforced server-side, so sendMessage can return
// "limit" when the proxy rejects with free-limit-reached — the UI maps that to the paywall.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { FreeLimitReachedError } from "../api/errors";
import { fetchSuggestedPromptSeed, sendMessages } from "../api/moneylineService";
import { formattedAnswer, toAssistantPresentation } from "../api/presentation";
import { SPORTSBOOKS, type Sportsbook } from "../api/sportsbooks";
import type { BestBetEvent, ChatMessage, SuggestedPrompt } from "../api/types";

export type SendResult = "sent" | "limit" | "error" | "noop";

export const WELCOME_TEXT = "Ask me anything betting related!";

export const MAX_CONVERSATIONS = 5;
const CONVERSATIONS_STORAGE_KEY = "conversations";

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

let nextMessageId = 0;
function messageId(): string {
  nextMessageId += 1;
  // Date.now() keeps ids unique across restarts; a bare counter would collide
  // with `msg-N` ids restored from a persisted conversation on the next launch.
  return `msg-${Date.now()}-${nextMessageId}`;
}

let conversationSeq = 0;
function newConversationId(): string {
  conversationSeq += 1;
  // Date.now() keeps ids unique across restarts; a bare counter would collide
  // with ids already persisted from a previous session.
  return `conv-${Date.now()}-${conversationSeq}`;
}

export function conversationTitle(text: string): string {
  const clean = text.trim().replace(/\s+/g, " ");
  return clean.length > 40 ? `${clean.slice(0, 40)}…` : clean;
}

export function recentConversations(conversations: Conversation[]): Conversation[] {
  return [...conversations].sort((a, b) => b.updatedAt - a.updatedAt);
}

function persistConversations(conversations: Conversation[]): void {
  void AsyncStorage.setItem(CONVERSATIONS_STORAGE_KEY, JSON.stringify(conversations));
}

// Guards against out-of-order prompt-seed responses when the sportsbook
// selection changes faster than requests resolve.
let promptSeedRequestId = 0;

interface ChatStore {
  messages: ChatMessage[];
  input: string;
  isLoading: boolean;
  isLoadingSuggestedPrompts: boolean;
  errorMessage?: string;
  selectedSportsbookIds: string[];
  suggestedPrompts: SuggestedPrompt[];
  suggestedBestBetEvents: BestBetEvent[];
  conversations: Conversation[];
  activeConversationId: string | null;

  setInput: (input: string) => void;
  loadWelcomeState: () => void;
  loadSuggestedPrompts: () => Promise<void>;
  setSelectedSportsbookIds: (ids: string[]) => void;
  sendMessage: () => Promise<SendResult>;
  sendSuggestedPrompt: (prompt: SuggestedPrompt) => Promise<SendResult>;
  dismissError: () => void;
  hydrate: () => Promise<void>;
  newConversation: () => void;
  selectConversation: (id: string) => void;
  deleteConversation: (id: string) => void;
}

export function selectedSportsbooks(ids: string[]): Sportsbook[] {
  return SPORTSBOOKS.filter((book) => ids.includes(book.id)).sort((a, b) =>
    a.name.localeCompare(b.name)
  );
}

export function sportsbookSummary(ids: string[]): string {
  if (ids.length === 0) {
    return "All books";
  }
  if (ids.length === 1) {
    return selectedSportsbooks(ids)[0]?.name ?? "1 book";
  }
  return `${ids.length} books`;
}

export function canSend(input: string): boolean {
  return input.trim().length > 0;
}

export function shouldShowSuggestedPrompts(store: Pick<ChatStore, "messages" | "suggestedPrompts">): boolean {
  return store.messages.length <= 1 && store.suggestedPrompts.length > 0;
}

export function shouldShowSuggestedPromptLoading(
  store: Pick<ChatStore, "messages" | "suggestedPrompts" | "isLoadingSuggestedPrompts">
): boolean {
  return store.messages.length <= 1 && store.isLoadingSuggestedPrompts && store.suggestedPrompts.length === 0;
}

export const useChatStore = create<ChatStore>((set, get) => {
  // Mirror the live `messages` buffer into the active conversation, bump its
  // timestamp, and persist. No-op while the active thread is an unsaved draft.
  const syncActiveConversation = () => {
    const { activeConversationId, messages, conversations } = get();
    if (!activeConversationId) {
      return;
    }
    const next = conversations.map((c) =>
      c.id === activeConversationId
        ? { ...c, messages: [...messages], updatedAt: Date.now() }
        : c
    );
    set({ conversations: next });
    persistConversations(next);
  };

  // Append a message straight to a stored conversation by id, without touching
  // the live buffer. Used when a response resolves after the user has switched
  // threads, so the reply lands in the thread it was sent from.
  const appendToConversation = (id: string, message: ChatMessage) => {
    const next = get().conversations.map((c) =>
      c.id === id
        ? { ...c, messages: [...c.messages, message], updatedAt: Date.now() }
        : c
    );
    set({ conversations: next });
    persistConversations(next);
  };

  return {
  messages: [],
  input: "",
  isLoading: false,
  isLoadingSuggestedPrompts: false,
  errorMessage: undefined,
  selectedSportsbookIds: [],
  suggestedPrompts: [],
  suggestedBestBetEvents: [],
  conversations: [],
  activeConversationId: null,

  setInput: (input) => set({ input }),

  loadWelcomeState: () =>
    set({
      messages: [
        { id: messageId(), role: "assistant", text: WELCOME_TEXT, includeInAPIRequest: false },
      ],
      activeConversationId: null,
    }),

  loadSuggestedPrompts: async () => {
    promptSeedRequestId += 1;
    const requestId = promptSeedRequestId;
    set({ isLoadingSuggestedPrompts: true });
    try {
      const seed = await fetchSuggestedPromptSeed(selectedSportsbooks(get().selectedSportsbookIds));
      if (requestId === promptSeedRequestId) {
        set({ suggestedPrompts: seed.prompts, suggestedBestBetEvents: seed.events });
      }
    } catch {
      if (requestId === promptSeedRequestId) {
        set({ suggestedPrompts: [], suggestedBestBetEvents: [] });
      }
    } finally {
      if (requestId === promptSeedRequestId) {
        set({ isLoadingSuggestedPrompts: false });
      }
    }
  },

  setSelectedSportsbookIds: (ids) => {
    set({ selectedSportsbookIds: ids });
    void get().loadSuggestedPrompts();
  },

  sendMessage: async () => {
    const trimmedInput = get().input.trim();
    if (!trimmedInput || get().isLoading) {
      return "noop";
    }

    const userMessage: ChatMessage = {
      id: messageId(),
      role: "user",
      text: trimmedInput,
      includeInAPIRequest: true,
    };

    const wasDraft = get().activeConversationId === null;

    set({
      errorMessage: undefined,
      input: "",
      messages: [...get().messages, userMessage],
      isLoading: true,
    });

    // The first user message turns a draft into a saved, titled thread; later
    // messages just mirror into the existing conversation.
    if (wasDraft) {
      const now = Date.now();
      const conversation: Conversation = {
        id: newConversationId(),
        title: conversationTitle(trimmedInput),
        messages: [...get().messages],
        createdAt: now,
        updatedAt: now,
      };
      const conversations = recentConversations([conversation, ...get().conversations]).slice(
        0,
        MAX_CONVERSATIONS
      );
      set({ activeConversationId: conversation.id, conversations });
      persistConversations(conversations);
    } else {
      syncActiveConversation();
    }

    // The thread this request belongs to. If the user switches threads while the
    // reply is in flight, results land here rather than on whatever is active now.
    const sentConversationId = get().activeConversationId as string;
    const stillActive = () => get().activeConversationId === sentConversationId;

    // Echo the most recent surfaced pick's betRef so a follow-up like "other
    // books for this same bet?" can line-shop that exact selection.
    const referencedBet = [...get().messages]
      .reverse()
      .find((m) => m.role === "assistant" && m.assistantPresentation?.primaryPick?.betRef)
      ?.assistantPresentation?.primaryPick?.betRef;

    try {
      const response = await sendMessages(
        get().messages,
        selectedSportsbooks(get().selectedSportsbookIds),
        get().suggestedBestBetEvents,
        referencedBet
      );
      const assistantMessage: ChatMessage = {
        id: messageId(),
        role: "assistant",
        text: formattedAnswer(response),
        includeInAPIRequest: true,
        assistantPresentation: toAssistantPresentation(response),
      };
      if (stillActive()) {
        set({ messages: [...get().messages, assistantMessage], isLoading: false });
        syncActiveConversation();
      } else {
        // User moved to another thread mid-flight — deliver to the origin thread.
        set({ isLoading: false });
        appendToConversation(sentConversationId, assistantMessage);
      }
      return "sent";
    } catch (error) {
      if (error instanceof FreeLimitReachedError) {
        if (stillActive()) {
          // Roll the optimistic user message back and restore the input so the
          // question survives the paywall round-trip.
          set({
            messages: get().messages.filter((m) => m.id !== userMessage.id),
            input: trimmedInput,
            isLoading: false,
          });
          if (wasDraft) {
            // The thread was created only for this rejected ask — discard it.
            const activeId = get().activeConversationId;
            const conversations = get().conversations.filter((c) => c.id !== activeId);
            set({ conversations, activeConversationId: null });
            persistConversations(conversations);
          } else {
            syncActiveConversation();
          }
        } else {
          set({ isLoading: false });
        }
        return "limit";
      }

      if (stillActive()) {
        set({
          isLoading: false,
          errorMessage: error instanceof Error ? error.message : "Something went wrong.",
        });
        syncActiveConversation();
      } else {
        set({ isLoading: false });
      }
      return "error";
    }
  },

  sendSuggestedPrompt: async (prompt) => {
    set({ input: prompt.text });
    return get().sendMessage();
  },

  dismissError: () => set({ errorMessage: undefined }),

  hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(CONVERSATIONS_STORAGE_KEY);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return;
      }
      const conversations = recentConversations(parsed as Conversation[]).slice(
        0,
        MAX_CONVERSATIONS
      );
      set({ conversations });
    } catch {
      // Corrupt or absent store: start with no history.
    }
  },

  newConversation: () => {
    get().loadWelcomeState();
    set({ input: "", errorMessage: undefined });
  },

  selectConversation: (id) => {
    const conv = get().conversations.find((c) => c.id === id);
    if (!conv) {
      return;
    }
    set({
      messages: [...conv.messages],
      activeConversationId: id,
      input: "",
      errorMessage: undefined,
    });
  },

  deleteConversation: (id) => {
    const next = get().conversations.filter((c) => c.id !== id);
    set({ conversations: next });
    persistConversations(next);
    if (get().activeConversationId === id) {
      get().newConversation();
    }
  },
  };
});
