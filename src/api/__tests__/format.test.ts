import {
  cardFriendlyMatchup,
  cardFriendlyOutcome,
  cardFriendlyTitle,
  cleanSentenceSpacing,
  cleanedTeamName,
  easternEventTime,
  formatAmericanOdds,
  hasStandaloneBetSubject,
  moneyText,
  moneyTextWithDollar,
  normalizedBetSelection,
  parseISO8601,
  percentText,
  readableLabel,
  shortISODateTime,
  trimmedOrUndefined,
} from "../format";

describe("formatAmericanOdds", () => {
  it("prefixes positive odds with +", () => {
    expect(formatAmericanOdds(118)).toBe("+118");
    expect(formatAmericanOdds(-145)).toBe("-145");
    expect(formatAmericanOdds(0)).toBe("0");
  });
  it("rounds fractional odds", () => {
    expect(formatAmericanOdds(117.6)).toBe("+118");
  });
});

describe("percentText (Swift: >=1 already percent, else fraction*100, always 2dp)", () => {
  it("treats values >= 1 as already-percent", () => {
    expect(percentText(6.2)).toBe("6.20%");
  });
  it("multiplies fractions by 100", () => {
    expect(percentText(0.062)).toBe("6.20%");
  });
});

describe("moneyText", () => {
  it("renders whole numbers without decimals", () => {
    expect(moneyText(25)).toBe("25");
    expect(moneyText(25.5)).toBe("25.50");
    expect(moneyTextWithDollar(10)).toBe("$10");
  });
});

describe("readableLabel / cardFriendlyTitle", () => {
  it("converts snake/kebab case to Title Case", () => {
    expect(readableLabel("ev_bet")).toBe("Ev Bet");
    expect(readableLabel("best-odds")).toBe("Best Odds");
  });
  it("maps known market types", () => {
    expect(cardFriendlyTitle("moneyline")).toBe("Moneyline");
    expect(cardFriendlyTitle("player_points")).toBe("Player Points");
    expect(cardFriendlyTitle("player points q1")).toBe("1Q Player Points");
    expect(cardFriendlyTitle("spread")).toBe("Spread");
  });
});

describe("cardFriendlyOutcome / cardFriendlyMatchup", () => {
  it("replaces vs with or in outcomes", () => {
    expect(cardFriendlyOutcome("Celtics vs Knicks")).toBe("Celtics or Knicks");
  });
  it("cleans underscores in matchups", () => {
    expect(cardFriendlyMatchup("Celtics_vs_Knicks")).toBe("Celtics vs Knicks");
  });
});

describe("cleanSentenceSpacing", () => {
  it("inserts a space between lowercase and uppercase runs", () => {
    expect(cleanSentenceSpacing("oddsAre good.Now")).toBe("odds Are good. Now");
  });
  it("collapses repeated whitespace", () => {
    expect(cleanSentenceSpacing("a  b")).toBe("a b");
  });
});

describe("cleanedTeamName (Swift removes 'space slash' sequences)", () => {
  it("removes the space-slash pair entirely", () => {
    expect(cleanedTeamName("Team A /Team B")).toBe("Team ATeam B");
  });
});

describe("normalizedBetSelection", () => {
  it("appends Moneyline when missing for moneyline markets", () => {
    expect(normalizedBetSelection("Celtics", "Moneyline")).toBe("Celtics Moneyline");
    expect(normalizedBetSelection("Celtics Moneyline", "Moneyline")).toBe("Celtics Moneyline");
  });
  it("appends market noun to over/under selections", () => {
    expect(normalizedBetSelection("Over 7.5", "Points")).toBe("Over 7.5 Points");
  });
  it("dedupes a trailing repeated number", () => {
    expect(normalizedBetSelection("Over 7.5 7.5", "Points")).toBe("Over 7.5 Points");
  });
});

describe("hasStandaloneBetSubject", () => {
  it("is true when two non-market words remain", () => {
    expect(hasStandaloneBetSubject("Jayson Tatum Over 30.5 Points", "Player Points")).toBe(true);
  });
  it("is false for bare over/under selections", () => {
    expect(hasStandaloneBetSubject("Over 7.5", "Total")).toBe(false);
  });
  it("treats single-word moneyline subjects as standalone", () => {
    expect(hasStandaloneBetSubject("Celtics Moneyline", "Moneyline")).toBe(true);
  });
});

describe("dates", () => {
  it("parses ISO8601 with and without fractional seconds", () => {
    expect(parseISO8601("2026-06-12T23:00:00Z")).toBeInstanceOf(Date);
    expect(parseISO8601("2026-06-12T23:00:00.000Z")).toBeInstanceOf(Date);
    expect(parseISO8601("not a date")).toBeUndefined();
  });
  it("formats eastern event time", () => {
    expect(easternEventTime(new Date("2026-06-12T23:00:00Z"))).toBe("Fri, Jun 12 at 7:00 PM ET");
  });
  it("formats short ISO date-times and passes through unparseable strings", () => {
    expect(shortISODateTime("2026-06-12T23:00:00Z")).toMatch(/Jun 1[23], \d{1,2}:\d{2} [AP]M/);
    expect(shortISODateTime("tbd")).toBe("tbd");
  });
});

describe("trimmedOrUndefined", () => {
  it("returns undefined for blank strings", () => {
    expect(trimmedOrUndefined("  ")).toBeUndefined();
    expect(trimmedOrUndefined(" x ")).toBe("x");
    expect(trimmedOrUndefined(null)).toBeUndefined();
    expect(trimmedOrUndefined(undefined)).toBeUndefined();
  });
});
