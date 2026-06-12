import { formattedAnswer, toAssistantPresentation } from "../presentation";
import type { MoneyLineAIData } from "../types";

const fullPayload: MoneyLineAIData = {
  answer: "The Celtics moneyline is the strongest play tonight based on line value.",
  analysis: { summary: "Celtics have the edge.", highlights: ["Line moved 4 points"] },
  presentation: {
    responseType: "best_bet",
    headline: "Celtics Moneyline Stands Out",
    summary: "Boston Celtics moneyline at +118 offers the best value tonight.",
    confidence: "High",
    sourceLabel: "MoneyLine",
    entity: { matchup: "Celtics vs Knicks" },
    primaryPick: {
      recordIndex: 0,
      signalLabel: "Best Bet",
      selection: "Boston Celtics",
      marketLabel: "Moneyline",
      market: "moneyline",
      odds: 118,
      bookmakerName: "DraftKings",
      sourceType: "ev_bet",
      confidence: "high",
      rationale: "Model probability beats implied.",
      metrics: { edgePct: 0.03, evPct: 0.05, impliedProb: 0.46, modelProb: 0.52 },
      event: { matchup: "Celtics vs Knicks", startTime: "2026-06-12T23:00:00Z" },
    },
    alternativePick: {
      signalLabel: "Alternative",
      selection: "New York Knicks",
      marketLabel: "Moneyline",
      oddsDisplay: "-105",
      bookmakerName: "FanDuel",
      confidence: "medium",
    },
    cards: [
      {
        // duplicates the primary pick → must be hidden from supporting cards
        selection: "Boston Celtics",
        marketLabel: "Moneyline",
        odds: 118,
        bookmakerName: "DraftKings",
      },
      {
        selection: "Jayson Tatum Over 30.5",
        marketLabel: "Player Points",
        oddsDisplay: "+102",
        bookmakerName: "BetMGM",
      },
    ],
  },
  records: [{ teamName: "Boston Celtics" }],
};

describe("formattedAnswer", () => {
  it("prefers presentation.summary, then headline, then answer, then analysis.summary", () => {
    expect(formattedAnswer({ answer: "a", presentation: { summary: "s" } })).toBe("s");
    expect(formattedAnswer({ answer: "a", presentation: { headline: "h" } })).toBe("h");
    expect(formattedAnswer({ answer: "plain answer" })).toBe("plain answer");
    expect(formattedAnswer({ analysis: { summary: "as" } })).toBe("as");
    expect(formattedAnswer({})).toBe("");
  });
  it("normalizes CRLF and trims plain answers", () => {
    expect(formattedAnswer({ answer: "  line one\r\nline two  " })).toBe("line one\nline two");
  });
});

describe("toAssistantPresentation", () => {
  const result = toAssistantPresentation(fullPayload)!;

  it("returns undefined when there is no presentation payload", () => {
    expect(toAssistantPresentation({ answer: "plain" })).toBeUndefined();
    expect(toAssistantPresentation({})).toBeUndefined();
  });

  it("maps top-level fields", () => {
    expect(result.headline).toBe("Celtics Moneyline Stands Out");
    expect(result.summary).toBe("Boston Celtics moneyline at +118 offers the best value tonight.");
    expect(result.sourceLabel).toBe("MoneyLine");
    expect(result.confidence).toBe("high");
    expect(result.entityMatchup).toBe("Celtics vs Knicks");
  });

  it("maps the primary pick with odds display, facts, and event context", () => {
    const pick = result.primaryPick!;
    expect(pick.selection).toBe("Boston Celtics");
    expect(pick.oddsDisplay).toBe("+118");
    expect(pick.bookmakerName).toBe("DraftKings");
    expect(pick.contextLabel).toBe("Celtics vs Knicks");
    expect(pick.eventStartTime).toEqual(new Date("2026-06-12T23:00:00Z"));
    expect(pick.confidence).toBe("high");
    expect(pick.sourceType).toBe("Ev Bet");
    const labels = pick.facts.map((f) => f.label);
    expect(labels).toEqual(expect.arrayContaining(["Edge", "EV", "Implied", "Model"]));
    expect(pick.facts.find((f) => f.label === "Edge")!.value).toBe("3.00%");
    expect(pick.metricSnapshot).toEqual({ edgePct: 0.03, evPct: 0.05, impliedProb: 0.46, modelProb: 0.52 });
  });

  it("uses the bookmaker as a source fact with the sourceType label", () => {
    const sourceFact = result.primaryPick!.facts[0];
    expect(sourceFact.label).toBe("Ev Bet");
    expect(sourceFact.value).toBe("DraftKings");
  });

  it("removes supporting cards that duplicate the primary or alternative pick", () => {
    expect(result.cards).toHaveLength(1);
    expect(result.cards[0].selection).toBe("Jayson Tatum Over 30.5");
  });

  it("uses the answer as expanded explanation when it differs from the summary", () => {
    expect(result.expandedExplanation).toBe(
      "The Celtics moneyline is the strongest play tonight based on line value."
    );
  });

  it("builds selection from outcome + point when selection is missing", () => {
    const data: MoneyLineAIData = {
      presentation: {
        primaryPick: {
          outcome: "Over",
          point: 7.5,
          marketLabel: "Total",
          odds: -110,
        },
      },
    };
    const pick = toAssistantPresentation(data)!.primaryPick!;
    // Swift JSONValue.stringValue renders non-integer numbers with two decimals.
    expect(pick.selection).toBe("Over 7.50");
    expect(pick.oddsDisplay).toBe("-110");
  });

  it("prefixes a record team name for selections without a standalone subject", () => {
    const data: MoneyLineAIData = {
      presentation: {
        primaryPick: {
          recordIndex: 0,
          selection: "+3.5",
          marketLabel: "Spread",
        },
      },
      records: [{ teamName: "Boston Celtics" }],
    };
    const pick = toAssistantPresentation(data)!.primaryPick!;
    expect(pick.selection).toBe("Boston Celtics +3.5");
  });

  it("drops context-requiring cards that have no standalone subject and no event context", () => {
    const data: MoneyLineAIData = {
      presentation: {
        cards: [{ selection: "Over 7.5", marketLabel: "Total" }],
      },
    };
    expect(toAssistantPresentation(data)!.cards).toHaveLength(0);
  });

  it("falls back to analysis highlights for the expanded explanation", () => {
    const data: MoneyLineAIData = {
      presentation: { summary: "s" },
      analysis: { summary: "s", highlights: ["one", "two"] },
    };
    expect(toAssistantPresentation(data)!.expandedExplanation).toBe("one\ntwo");
  });
});
