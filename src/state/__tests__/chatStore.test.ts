jest.mock("../../api/moneylineService", () => ({
  sendMessages: jest.fn(),
  fetchSuggestedPromptSeed: jest.fn(),
}));

import { FreeLimitReachedError, ServerError } from "../../api/errors";
import { fetchSuggestedPromptSeed, sendMessages } from "../../api/moneylineService";
import {
  WELCOME_TEXT,
  canSend,
  shouldShowSuggestedPromptLoading,
  shouldShowSuggestedPrompts,
  sportsbookSummary,
  useChatStore,
} from "../chatStore";

const mockSendMessages = sendMessages as jest.Mock;
const mockFetchSeed = fetchSuggestedPromptSeed as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  useChatStore.setState({
    messages: [],
    input: "",
    isLoading: false,
    isLoadingSuggestedPrompts: false,
    errorMessage: undefined,
    selectedSportsbookIds: [],
    suggestedPrompts: [],
    suggestedBestBetEvents: [],
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
