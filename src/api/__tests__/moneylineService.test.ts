jest.mock("../moneylineClient", () => ({
  ...jest.requireActual("../errors"),
  sendChat: jest.fn(),
  fetchBestBets: jest.fn(),
  fetchEventBestBets: jest.fn(),
}));

import { fetchBestBets, fetchEventBestBets, sendChat } from "../moneylineClient";
import { FreeLimitReachedError, ServerError } from "../errors";
import { fetchSuggestedPromptSeed, sendMessages } from "../moneylineService";
import { SPORTSBOOKS } from "../sportsbooks";
import type { BestBetEvent, ChatMessage } from "../types";

const mockSendChat = sendChat as jest.Mock;
const mockFetchBestBets = fetchBestBets as jest.Mock;
const mockFetchEventBestBets = fetchEventBestBets as jest.Mock;

const celticsEvent: BestBetEvent = {
  eventId: "ev-celtics",
  leagueId: "nba",
  sport: "basketball",
  startTime: "2026-06-12T23:00:00Z",
  markets: [
    {
      marketType: "moneyline",
      outcomes: [
        { name: "Boston Celtics", bestOdds: 118, bookmakerName: "DraftKings" },
        { name: "New York Knicks", bestOdds: -105, bookmakerName: "FanDuel" },
      ],
    },
  ],
};

function user(text: string): ChatMessage {
  return { id: Math.random().toString(), role: "user", text, includeInAPIRequest: true };
}

function assistant(text: string, includeInAPIRequest = true): ChatMessage {
  return { id: Math.random().toString(), role: "assistant", text, includeInAPIRequest };
}

const goodResponse = { answer: "Celtics moneyline looks strong.", records: [{}] };
const missingDataResponse = { answer: "I don't see that game in my data.", records: [] };

beforeEach(() => {
  mockSendChat.mockReset();
  mockFetchBestBets.mockReset();
  mockFetchEventBestBets.mockReset();
});

describe("sendMessages", () => {
  it("sends only the last 6 includable messages with hybrid/large defaults and no filters when none selected", async () => {
    mockSendChat.mockResolvedValue(goodResponse);
    const messages = [
      assistant("welcome", false),
      ...Array.from({ length: 8 }, (_, i) => user(`question ${i}`)),
    ];
    await sendMessages(messages, [], []);
    const payload = mockSendChat.mock.calls[0][0];
    expect(payload.messages).toHaveLength(6);
    expect(payload.messages[0].content).toBe("question 2");
    expect(payload.scope).toBe("large");
    expect(payload.responseFormat).toBe("hybrid");
    expect(payload.context).toBeUndefined();
    expect(payload.filters).toBeUndefined();
  });

  it("passes selected bookmakers as filters and enriches resolvable questions", async () => {
    mockSendChat.mockResolvedValue(goodResponse);
    const books = SPORTSBOOKS.filter((b) => b.id === "draftkings" || b.id === "fanduel");
    await sendMessages([user("can the celtics cover in the game tonight?")], books, [celticsEvent]);
    const payload = mockSendChat.mock.calls[0][0];
    expect(payload.filters).toEqual({ bookmakers: ["draftkings", "fanduel"] });
    expect(payload.messages[0].content).toContain("For event resolution, this refers to the");
  });

  it("returns the primary response on the happy path", async () => {
    mockSendChat.mockResolvedValue(goodResponse);
    const result = await sendMessages([user("best bets?")], [], []);
    expect(result).toBe(goodResponse);
    expect(mockSendChat).toHaveBeenCalledTimes(1);
  });

  it("retries with event context when the answer looks like missing data", async () => {
    mockSendChat.mockResolvedValueOnce(missingDataResponse).mockResolvedValueOnce(goodResponse);
    const result = await sendMessages([user("who wins the celtics game tonight?")], [], [celticsEvent]);
    expect(mockSendChat).toHaveBeenCalledTimes(2);
    const retryPayload = mockSendChat.mock.calls[1][0];
    expect(retryPayload.context).toBe("event_best_available_bet");
    expect(retryPayload.messages[0].content).toContain("This is specifically the");
    expect(result).toBe(goodResponse);
  });

  it("falls back to event best bets when the retry still looks empty", async () => {
    mockSendChat.mockResolvedValue(missingDataResponse);
    mockFetchEventBestBets.mockResolvedValue(celticsEvent);
    const result = await sendMessages([user("who wins the celtics game tonight?")], [], [celticsEvent]);
    expect(mockFetchEventBestBets).toHaveBeenCalledWith("ev-celtics", undefined);
    expect(result.presentation?.responseType).toBe("event_recommendation");
  });

  it("passes a single selected bookmaker through to the event fallback", async () => {
    mockSendChat.mockResolvedValue(missingDataResponse);
    mockFetchEventBestBets.mockResolvedValue(celticsEvent);
    const dk = SPORTSBOOKS.filter((b) => b.id === "draftkings");
    await sendMessages([user("who wins the celtics game tonight?")], dk, [celticsEvent]);
    expect(mockFetchEventBestBets).toHaveBeenCalledWith("ev-celtics", "draftkings");
  });

  it("falls back when the retry fails with an event-resolution server error", async () => {
    mockSendChat
      .mockResolvedValueOnce(missingDataResponse)
      .mockRejectedValueOnce(new ServerError("Your query matches multiple games."));
    mockFetchEventBestBets.mockResolvedValue(celticsEvent);
    const result = await sendMessages([user("who wins the celtics game tonight?")], [], [celticsEvent]);
    expect(result.presentation?.responseType).toBe("event_recommendation");
  });

  it("returns the primary response when the retry trips the free limit", async () => {
    mockSendChat
      .mockResolvedValueOnce(missingDataResponse)
      .mockRejectedValueOnce(new FreeLimitReachedError());
    const result = await sendMessages([user("who wins the celtics game tonight?")], [], [celticsEvent]);
    expect(result).toBe(missingDataResponse);
  });

  it("rethrows other retry errors", async () => {
    mockSendChat
      .mockResolvedValueOnce(missingDataResponse)
      .mockRejectedValueOnce(new ServerError("upstream exploded"));
    await expect(
      sendMessages([user("who wins the celtics game tonight?")], [], [celticsEvent])
    ).rejects.toThrow("upstream exploded");
  });

  it("falls back directly when the primary response is empty-looking and an event resolves", async () => {
    mockSendChat.mockResolvedValue({ answer: "Here are some thoughts.", records: [] });
    mockFetchEventBestBets.mockResolvedValue(celticsEvent);
    const result = await sendMessages([user("tell me about the celtics matchup")], [], [celticsEvent]);
    expect(result.presentation?.responseType).toBe("event_recommendation");
  });
});

describe("fetchSuggestedPromptSeed", () => {
  it("seeds the static prompt plus deduped dynamic prompts from best bets", async () => {
    mockFetchBestBets.mockResolvedValue([celticsEvent, celticsEvent]);
    const seed = await fetchSuggestedPromptSeed([]);
    expect(mockFetchBestBets).toHaveBeenCalledWith(8, undefined);
    expect(seed.prompts[0].text).toBe("What's the best bet today?");
    expect(seed.prompts).toHaveLength(2);
    expect(seed.prompts[1].text).toBe(
      "What are the best bets for the Boston Celtics vs New York Knicks basketball game?"
    );
    expect(seed.events).toHaveLength(2);
  });

  it("passes a single selected bookmaker to fetchBestBets", async () => {
    mockFetchBestBets.mockResolvedValue([]);
    const dk = SPORTSBOOKS.filter((b) => b.id === "draftkings");
    await fetchSuggestedPromptSeed(dk);
    expect(mockFetchBestBets).toHaveBeenCalledWith(8, "draftkings");
  });
});
