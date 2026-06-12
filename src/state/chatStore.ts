// Port of SportsGPTViewModel (SportsGPTModels.swift:15-131). One behavior change per the
// spec: the free-message limit is now enforced server-side, so sendMessage can return
// "limit" when the proxy rejects with free-limit-reached — the UI maps that to the paywall.

import { create } from "zustand";
import { FreeLimitReachedError } from "../api/errors";
import { fetchSuggestedPromptSeed, sendMessages } from "../api/moneylineService";
import { formattedAnswer, toAssistantPresentation } from "../api/presentation";
import { SPORTSBOOKS, type Sportsbook } from "../api/sportsbooks";
import type { BestBetEvent, ChatMessage, SuggestedPrompt } from "../api/types";

export type SendResult = "sent" | "limit" | "error" | "noop";

export const WELCOME_TEXT = "Ask me anything betting related!";

let nextMessageId = 0;
function messageId(): string {
  nextMessageId += 1;
  return `msg-${nextMessageId}`;
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

  setInput: (input: string) => void;
  loadWelcomeState: () => void;
  loadSuggestedPrompts: () => Promise<void>;
  setSelectedSportsbookIds: (ids: string[]) => void;
  sendMessage: () => Promise<SendResult>;
  sendSuggestedPrompt: (prompt: SuggestedPrompt) => Promise<SendResult>;
  dismissError: () => void;
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

export const useChatStore = create<ChatStore>((set, get) => ({
  messages: [],
  input: "",
  isLoading: false,
  isLoadingSuggestedPrompts: false,
  errorMessage: undefined,
  selectedSportsbookIds: [],
  suggestedPrompts: [],
  suggestedBestBetEvents: [],

  setInput: (input) => set({ input }),

  loadWelcomeState: () =>
    set({
      messages: [
        { id: messageId(), role: "assistant", text: WELCOME_TEXT, includeInAPIRequest: false },
      ],
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

    set({
      errorMessage: undefined,
      input: "",
      messages: [...get().messages, userMessage],
      isLoading: true,
    });

    try {
      const response = await sendMessages(
        get().messages,
        selectedSportsbooks(get().selectedSportsbookIds),
        get().suggestedBestBetEvents
      );
      const assistantMessage: ChatMessage = {
        id: messageId(),
        role: "assistant",
        text: formattedAnswer(response),
        includeInAPIRequest: true,
        assistantPresentation: toAssistantPresentation(response),
      };
      set({ messages: [...get().messages, assistantMessage], isLoading: false });
      return "sent";
    } catch (error) {
      if (error instanceof FreeLimitReachedError) {
        // Roll the optimistic user message back and restore the input so the
        // question survives the paywall round-trip.
        set({
          messages: get().messages.filter((m) => m.id !== userMessage.id),
          input: trimmedInput,
          isLoading: false,
        });
        return "limit";
      }

      set({
        isLoading: false,
        errorMessage: error instanceof Error ? error.message : "Something went wrong.",
      });
      return "error";
    }
  },

  sendSuggestedPrompt: async (prompt) => {
    set({ input: prompt.text });
    return get().sendMessage();
  },

  dismissError: () => set({ errorMessage: undefined }),
}));
