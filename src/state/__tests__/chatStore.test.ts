jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

jest.mock("../../api/moneylineService", () => ({
  sendMessages: jest.fn(),
  fetchSuggestedPromptSeed: jest.fn(),
}));

import AsyncStorage from "@react-native-async-storage/async-storage";
import { FreeLimitReachedError, ServerError } from "../../api/errors";
import { fetchSuggestedPromptSeed, sendMessages } from "../../api/moneylineService";
import {
  WELCOME_TEXT,
  canSend,
  shouldShowSuggestedPromptLoading,
  shouldShowSuggestedPrompts,
  sportsbookSummary,
  useChatStore,
  type Conversation,
} from "../chatStore";

const mockSendMessages = sendMessages as jest.Mock;
const mockFetchSeed = fetchSuggestedPromptSeed as jest.Mock;

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  useChatStore.setState({
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
  });
});

describe("loadWelcomeState", () => {
  it("seeds the welcome message excluded from API requests", () => {
    useChatStore.getState().loadWelcomeState();
    const messages = useChatStore.getState().messages;
    expect(messages).toHaveLength(1);
    expect(messages[0].text).toBe(WELCOME_TEXT);
    expect(messages[0].includeInAPIRequest).toBe(false);
  });
});

describe("sendMessage", () => {
  it("appends the user message and the assistant response", async () => {
    mockSendMessages.mockResolvedValue({
      answer: "Celtics look good.",
      presentation: { summary: "Celtics moneyline.", headline: "h" },
    });
    useChatStore.getState().loadWelcomeState();
    useChatStore.getState().setInput("  who wins tonight?  ");

    const result = await useChatStore.getState().sendMessage();

    expect(result).toBe("sent");
    const messages = useChatStore.getState().messages;
    expect(messages).toHaveLength(3);
    expect(messages[1].role).toBe("user");
    expect(messages[1].text).toBe("who wins tonight?");
    expect(messages[2].role).toBe("assistant");
    expect(messages[2].text).toBe("Celtics moneyline.");
    expect(messages[2].assistantPresentation).toBeDefined();
    expect(useChatStore.getState().input).toBe("");
    expect(useChatStore.getState().isLoading).toBe(false);
  });

  it("returns noop for empty input or while loading", async () => {
    useChatStore.getState().setInput("   ");
    expect(await useChatStore.getState().sendMessage()).toBe("noop");
    useChatStore.setState({ input: "q", isLoading: true });
    expect(await useChatStore.getState().sendMessage()).toBe("noop");
  });

  it("rolls back the user message and restores input on the free-limit error", async () => {
    mockSendMessages.mockRejectedValue(new FreeLimitReachedError());
    useChatStore.getState().loadWelcomeState();
    useChatStore.getState().setInput("question eleven");

    const result = await useChatStore.getState().sendMessage();

    expect(result).toBe("limit");
    expect(useChatStore.getState().messages).toHaveLength(1);
    expect(useChatStore.getState().input).toBe("question eleven");
    expect(useChatStore.getState().errorMessage).toBeUndefined();
  });

  it("keeps the user message and sets errorMessage on other errors", async () => {
    mockSendMessages.mockRejectedValue(new ServerError("upstream broke"));
    useChatStore.getState().setInput("question");

    const result = await useChatStore.getState().sendMessage();

    expect(result).toBe("error");
    expect(useChatStore.getState().messages).toHaveLength(1);
    expect(useChatStore.getState().errorMessage).toBe("upstream broke");
  });

  it("passes sorted selected sportsbooks and cached events to the service", async () => {
    mockSendMessages.mockResolvedValue({ answer: "ok" });
    const events = [{ eventId: "e1", markets: [] }];
    useChatStore.setState({ selectedSportsbookIds: ["fanduel", "draftkings"], suggestedBestBetEvents: events });
    useChatStore.getState().setInput("q");

    await useChatStore.getState().sendMessage();

    const [, books, passedEvents] = mockSendMessages.mock.calls[0];
    expect(books.map((b: { id: string }) => b.id)).toEqual(["draftkings", "fanduel"]);
    expect(passedEvents).toBe(events);
  });
});

describe("suggested prompts", () => {
  it("loads prompts and caches events", async () => {
    mockFetchSeed.mockResolvedValue({
      prompts: [{ id: "p1", text: "t", shortLabel: "s" }],
      events: [{ eventId: "e1", markets: [] }],
    });
    await useChatStore.getState().loadSuggestedPrompts();
    expect(useChatStore.getState().suggestedPrompts).toHaveLength(1);
    expect(useChatStore.getState().suggestedBestBetEvents).toHaveLength(1);
  });

  it("clears prompts on failure", async () => {
    mockFetchSeed.mockRejectedValue(new Error("offline"));
    await useChatStore.getState().loadSuggestedPrompts();
    expect(useChatStore.getState().suggestedPrompts).toEqual([]);
  });

  it("re-seeds prompts when the sportsbook selection changes", async () => {
    mockFetchSeed.mockResolvedValue({ prompts: [], events: [] });
    useChatStore.getState().setSelectedSportsbookIds(["draftkings"]);
    expect(useChatStore.getState().selectedSportsbookIds).toEqual(["draftkings"]);
    expect(mockFetchSeed).toHaveBeenCalledTimes(1);
  });

  it("sendSuggestedPrompt fills the input then sends", async () => {
    mockSendMessages.mockResolvedValue({ answer: "ok" });
    const result = await useChatStore.getState().sendSuggestedPrompt({ id: "p", text: "best bet?", shortLabel: "b" });
    expect(result).toBe("sent");
    expect(mockSendMessages.mock.calls[0][0][0].text).toBe("best bet?");
  });
});

describe("conversation history", () => {
  it("saves and titles a thread on the first user message", async () => {
    mockSendMessages.mockResolvedValue({ answer: "ok", presentation: { summary: "ok" } });
    useChatStore.getState().loadWelcomeState();
    useChatStore.getState().setInput("Who wins Lakers vs Celtics tonight?");
    await useChatStore.getState().sendMessage();

    const { conversations, activeConversationId } = useChatStore.getState();
    expect(conversations).toHaveLength(1);
    expect(conversations[0].title).toBe("Who wins Lakers vs Celtics tonight?");
    expect(activeConversationId).toBe(conversations[0].id);
    expect(conversations[0].messages.some((m) => m.role === "assistant" && m.text === "ok")).toBe(true);
  });

  it("starts a separate thread on newConversation", async () => {
    mockSendMessages.mockResolvedValue({ answer: "a", presentation: { summary: "a" } });
    useChatStore.getState().loadWelcomeState();
    useChatStore.getState().setInput("first bet");
    await useChatStore.getState().sendMessage();
    useChatStore.getState().newConversation();
    useChatStore.getState().setInput("second bet");
    await useChatStore.getState().sendMessage();

    expect(useChatStore.getState().conversations).toHaveLength(2);
    expect(useChatStore.getState().messages.find((m) => m.role === "user")?.text).toBe("second bet");
  });

  it("caps history at 5, evicting the oldest", async () => {
    mockSendMessages.mockResolvedValue({ answer: "ok", presentation: { summary: "ok" } });
    for (let i = 0; i < 6; i++) {
      useChatStore.getState().newConversation();
      useChatStore.getState().setInput(`bet ${i}`);
      await useChatStore.getState().sendMessage();
    }
    const titles = useChatStore.getState().conversations.map((c) => c.title);
    expect(useChatStore.getState().conversations).toHaveLength(5);
    expect(titles).not.toContain("bet 0");
    expect(titles).toContain("bet 5");
  });

  it("selectConversation swaps the active messages", async () => {
    mockSendMessages.mockResolvedValue({ answer: "ok", presentation: { summary: "ok" } });
    useChatStore.getState().loadWelcomeState();
    useChatStore.getState().setInput("alpha");
    await useChatStore.getState().sendMessage();
    const first = useChatStore.getState().activeConversationId!;
    useChatStore.getState().newConversation();
    useChatStore.getState().setInput("beta");
    await useChatStore.getState().sendMessage();

    useChatStore.getState().selectConversation(first);
    expect(useChatStore.getState().activeConversationId).toBe(first);
    expect(useChatStore.getState().messages.find((m) => m.role === "user")?.text).toBe("alpha");
  });

  it("deleteConversation removes it and resets when active", async () => {
    mockSendMessages.mockResolvedValue({ answer: "ok", presentation: { summary: "ok" } });
    useChatStore.getState().loadWelcomeState();
    useChatStore.getState().setInput("to delete");
    await useChatStore.getState().sendMessage();
    const id = useChatStore.getState().activeConversationId!;

    useChatStore.getState().deleteConversation(id);
    expect(useChatStore.getState().conversations).toHaveLength(0);
    expect(useChatStore.getState().activeConversationId).toBeNull();
  });

  it("discards a draft thread when the first ask hits the free limit", async () => {
    mockSendMessages.mockRejectedValue(new FreeLimitReachedError());
    useChatStore.getState().loadWelcomeState();
    useChatStore.getState().setInput("limit ask");
    const result = await useChatStore.getState().sendMessage();
    expect(result).toBe("limit");
    expect(useChatStore.getState().conversations).toHaveLength(0);
    expect(useChatStore.getState().activeConversationId).toBeNull();
  });

  it("delivers a reply to its origin thread when the user switches mid-flight", async () => {
    // Seed thread A and let it settle.
    mockSendMessages.mockResolvedValueOnce({ answer: "a-reply", presentation: { summary: "a-reply" } });
    useChatStore.getState().loadWelcomeState();
    useChatStore.getState().setInput("thread A question");
    await useChatStore.getState().sendMessage();
    const threadA = useChatStore.getState().activeConversationId!;

    // Start thread B, fire a request, but switch back to A before it resolves.
    let resolveB: (v: unknown) => void = () => {};
    mockSendMessages.mockReturnValueOnce(new Promise((r) => (resolveB = r)));
    useChatStore.getState().newConversation();
    useChatStore.getState().setInput("thread B question");
    const bSend = useChatStore.getState().sendMessage();
    const threadB = useChatStore.getState().activeConversationId!;

    useChatStore.getState().selectConversation(threadA);
    resolveB({ answer: "b-reply", presentation: { summary: "b-reply" } });
    await bSend;

    const convB = useChatStore.getState().conversations.find((c) => c.id === threadB)!;
    const convA = useChatStore.getState().conversations.find((c) => c.id === threadA)!;
    expect(convB.messages.some((m) => m.text === "b-reply")).toBe(true);
    expect(convA.messages.some((m) => m.text === "b-reply")).toBe(false);
    // The live buffer still shows thread A, untouched by B's late reply.
    expect(useChatStore.getState().activeConversationId).toBe(threadA);
    expect(useChatStore.getState().messages.some((m) => m.text === "b-reply")).toBe(false);
  });

  it("generates message ids that do not collide with restored thread ids", async () => {
    mockSendMessages.mockResolvedValue({ answer: "reply", presentation: { summary: "reply" } });
    // Simulate a thread persisted in a previous session (old counter-style ids).
    await AsyncStorage.setItem(
      "conversations",
      JSON.stringify([
        {
          id: "c1",
          title: "old thread",
          messages: [
            { id: "msg-1", role: "user", text: "old q", includeInAPIRequest: true },
            { id: "msg-2", role: "assistant", text: "old a", includeInAPIRequest: true },
          ],
          createdAt: 1,
          updatedAt: 1,
        },
      ])
    );
    await useChatStore.getState().hydrate();
    useChatStore.getState().selectConversation("c1");
    useChatStore.getState().setInput("new question");
    await useChatStore.getState().sendMessage();

    const ids = useChatStore.getState().messages.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length); // no duplicate ids in the live thread
  });

  it("new chat + suggested prompt stays separate from the prior chat", async () => {
    // Build an "old" chat, then start a new one and tap a suggested prompt.
    mockSendMessages.mockResolvedValueOnce({ answer: "old reply", presentation: { summary: "old reply" } });
    useChatStore.getState().loadWelcomeState();
    useChatStore.getState().setInput("old chat question");
    await useChatStore.getState().sendMessage();
    const oldId = useChatStore.getState().activeConversationId!;

    mockSendMessages.mockResolvedValueOnce({ answer: "value bet", presentation: { summary: "value bet" } });
    useChatStore.getState().newConversation();
    await useChatStore.getState().sendSuggestedPrompt({
      id: "p-value",
      text: "What's the best value bet?",
      shortLabel: "Best value",
    });

    const newId = useChatStore.getState().activeConversationId!;
    const convs = useChatStore.getState().conversations;
    const oldConv = convs.find((c) => c.id === oldId)!;
    const newConv = convs.find((c) => c.id === newId)!;

    expect(newId).not.toBe(oldId);
    expect(convs).toHaveLength(2);
    expect(oldConv.messages.map((m) => m.text)).toEqual([
      WELCOME_TEXT,
      "old chat question",
      "old reply",
    ]);
    expect(newConv.messages.map((m) => m.text)).toEqual([
      WELCOME_TEXT,
      "What's the best value bet?",
      "value bet",
    ]);
  });

  it("hydrate merges stored threads with one created during the boot window", async () => {
    // A thread persisted from a previous session.
    await AsyncStorage.setItem(
      "conversations",
      JSON.stringify([
        { id: "stored", title: "stored thread", messages: [], createdAt: 1, updatedAt: 1 },
      ])
    );
    // Simulate a thread created on boot before the async hydrate read lands.
    useChatStore.setState({
      conversations: [
        { id: "fresh", title: "fresh thread", messages: [], createdAt: 2, updatedAt: 2 },
      ],
    });

    await useChatStore.getState().hydrate();

    const ids = useChatStore.getState().conversations.map((c) => c.id);
    expect(ids).toContain("stored"); // prior thread not clobbered
    expect(ids).toContain("fresh"); // boot-window thread preserved
  });

  it("hydrate loads the most recent 5 from storage", async () => {
    const make = (n: number): Conversation => ({
      id: `c${n}`,
      title: `t${n}`,
      messages: [],
      createdAt: n,
      updatedAt: n,
    });
    await AsyncStorage.setItem(
      "conversations",
      JSON.stringify([make(1), make(2), make(3), make(4), make(5), make(6)])
    );
    await useChatStore.getState().hydrate();
    const convs = useChatStore.getState().conversations;
    expect(convs).toHaveLength(5);
    expect(convs[0].id).toBe("c6"); // newest first
    expect(convs.map((c) => c.id)).not.toContain("c1");
  });
});

describe("derived helpers", () => {
  it("canSend requires non-whitespace input", () => {
    expect(canSend(" ")).toBe(false);
    expect(canSend("q")).toBe(true);
  });

  it("summarizes sportsbook selection", () => {
    expect(sportsbookSummary([])).toBe("All books");
    expect(sportsbookSummary(["draftkings"])).toBe("DraftKings");
    expect(sportsbookSummary(["draftkings", "fanduel"])).toBe("2 books");
  });

  it("controls suggested prompt visibility", () => {
    const base = { messages: [], suggestedPrompts: [], isLoadingSuggestedPrompts: false };
    expect(shouldShowSuggestedPrompts(base)).toBe(false);
    expect(
      shouldShowSuggestedPrompts({ ...base, suggestedPrompts: [{ id: "p", text: "t", shortLabel: "s" }] })
    ).toBe(true);
    expect(shouldShowSuggestedPromptLoading({ ...base, isLoadingSuggestedPrompts: true })).toBe(true);
  });
});
