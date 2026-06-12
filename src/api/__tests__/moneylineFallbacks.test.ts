import {
  buildFallbackResponse,
  deriveMatchup,
  enrichMessages,
  eventResolutionMessages,
  resolveEvent,
  resolutionHint,
  shouldFallbackToEventBestBets,
  shouldRetryAsEventRecommendation,
} from "../moneylineFallbacks";
import { EmptyResponseError } from "../errors";
import type { BestBetEvent, ChatMessage } from "../types";

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
    {
      marketType: "spread",
      outcomes: [
        { name: "Boston Celtics -3.5", bestOdds: -110, bookmakerName: "BetMGM" },
        { name: "New York Knicks +3.5", bestOdds: -110, bookmakerName: "BetMGM" },
        { name: "Boston Celtics -4.5", bestOdds: 100, bookmakerName: "Caesars" },
      ],
    },
  ],
};

const lakersEvent: BestBetEvent = {
  eventId: "ev-lakers",
  leagueId: "nba",
  sport: "basketball",
  markets: [
    {
      marketType: "moneyline",
      outcomes: [
        { name: "Los Angeles Lakers", bestOdds: -130, bookmakerName: "DraftKings" },
        { name: "Phoenix Suns", bestOdds: 110, bookmakerName: "FanDuel" },
      ],
    },
  ],
};

const events = [celticsEvent, lakersEvent];

function user(text: string): ChatMessage {
  return { id: "u", role: "user", text, includeInAPIRequest: true };
}

describe("deriveMatchup", () => {
  it("derives teams from the moneyline market", () => {
    const matchup = deriveMatchup(celticsEvent)!;
    expect(matchup.primaryTeam).toBe("Boston Celtics");
    expect(matchup.opponentTeam).toBe("New York Knicks");
  });
  it("returns undefined for events without outcomes", () => {
    expect(deriveMatchup({ eventId: "x", markets: [] })).toBeUndefined();
  });
  it("builds the resolution hint with league and sport", () => {
    expect(resolutionHint(deriveMatchup(celticsEvent)!)).toBe("NBA basketball Boston Celtics vs New York Knicks");
  });
});

describe("resolveEvent", () => {
  it("matches full team names ahead of token matches", () => {
    expect(resolveEvent("are the boston celtics good tonight", events)?.eventId).toBe("ev-celtics");
  });
  it("matches long tokens (>=4 chars) from team names", () => {
    expect(resolveEvent("what about the lakers game", events)?.eventId).toBe("ev-lakers");
  });
  it("returns undefined when nothing matches", () => {
    expect(resolveEvent("who wins the cubs game", events)).toBeUndefined();
  });
});

describe("enrichMessages / eventResolutionMessages", () => {
  it("appends the resolution hint to the last user message", () => {
    const enriched = enrichMessages([user("can the celtics cover tonight?")], events);
    expect(enriched[0].text).toBe(
      "can the celtics cover tonight? For event resolution, this refers to the NBA basketball Boston Celtics vs New York Knicks game."
    );
  });
  it("leaves messages untouched when no matchup resolves", () => {
    const messages = [user("what's a good parlay?")];
    expect(enrichMessages(messages, events)).toBe(messages);
  });
  it("eventResolutionMessages uses the specific phrasing and returns undefined when unresolvable", () => {
    const retry = eventResolutionMessages([user("best bet for the knicks game")], events)!;
    expect(retry[0].text).toContain("This is specifically the NBA basketball Boston Celtics vs New York Knicks game.");
    expect(eventResolutionMessages([user("hello")], events)).toBeUndefined();
  });
});

describe("retry / fallback triggers", () => {
  it("retries when the answer looks like missing data and the question mentions a game", () => {
    expect(
      shouldRetryAsEventRecommendation({ answer: "I don't see that matchup in my data." }, "who wins the celtics game")
    ).toBe(true);
    expect(
      shouldRetryAsEventRecommendation({ answer: "I need more information." }, "best bets tonight")
    ).toBe(true);
  });
  it("does not retry for confident answers or non-game questions", () => {
    expect(shouldRetryAsEventRecommendation({ answer: "Celtics moneyline is great." }, "who wins the celtics game")).toBe(false);
    expect(shouldRetryAsEventRecommendation({ answer: "I don't see it." }, "best parlay?")).toBe(false);
    expect(shouldRetryAsEventRecommendation({ answer: "I don't see it." }, undefined)).toBe(false);
  });
  it("falls back on missing-data answers or empty records", () => {
    expect(shouldFallbackToEventBestBets({ answer: "I do not see that game.", records: [{}] })).toBe(true);
    expect(shouldFallbackToEventBestBets({ answer: "Solid play.", records: [] })).toBe(true);
    expect(shouldFallbackToEventBestBets({ answer: "Solid play.", records: [{}] })).toBe(false);
  });
});

describe("buildFallbackResponse", () => {
  it("synthesizes an event recommendation from the moneyline market", () => {
    const response = buildFallbackResponse(celticsEvent);
    expect(response.answer).toBe(
      "For the Boston Celtics vs New York Knicks game, the clearest available line right now is Boston Celtics moneyline at +118 on DraftKings. New York Knicks moneyline is -105 on FanDuel."
    );
    const presentation = response.presentation!;
    expect(presentation.responseType).toBe("event_recommendation");
    expect(presentation.headline).toBe("Boston Celtics vs New York Knicks");
    expect(presentation.confidence).toBe("medium");
    expect(presentation.primaryPick!.selection).toBe("Boston Celtics");
    expect(presentation.primaryPick!.oddsDisplay).toBe("+118");
    expect(presentation.alternativePick!.selection).toBe("New York Knicks");
    // 2 moneyline outcomes + first 2 of 3 spread outcomes
    expect(presentation.cards).toHaveLength(4);
    expect(response.records).toHaveLength(5);
    const record = response.records![0] as Record<string, string>;
    expect(record.recordType).toBe("best_bet");
    expect(record.selection).toBe("Boston Celtics Moneyline");
  });

  it("throws EmptyResponseError when no moneyline market exists", () => {
    expect(() => buildFallbackResponse({ eventId: "x", markets: [] })).toThrow(EmptyResponseError);
  });
});
