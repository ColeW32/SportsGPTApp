// Port of the Swift String/Double/Date display extensions (SportsGPTModels.swift:1736-2001).

export function trimmed(value: string): string {
  return value.trim();
}

export function trimmedOrUndefined(value: string | null | undefined): string | undefined {
  const t = value?.trim();
  return t ? t : undefined;
}

export function caseInsensitiveTrimmed(value: string): string {
  return value.trim().toLowerCase();
}

export function equalsIgnoringCase(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

export function cleanSentenceSpacing(value: string): string {
  return value
    .replace(/([a-z0-9%.])([A-Z])/g, "$1 $2")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function readableLabel(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/-/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

const CARD_TITLE_MAPPINGS: [string, string][] = [
  ["moneyline", "Moneyline"],
  ["batter hits", "Batter Hits"],
  ["player points q1", "1Q Player Points"],
  ["player assists q1", "1Q Player Assists"],
  ["player rebounds q1", "1Q Player Rebounds"],
  ["player points", "Player Points"],
  ["player assists", "Player Assists"],
  ["player rebounds", "Player Rebounds"],
];

export function cardFriendlyTitle(value: string): string {
  const normalized = value.replace(/_/g, " ").replace(/-/g, " ").trim();
  const mapped = CARD_TITLE_MAPPINGS.find(([key]) => key.toLowerCase() === normalized.toLowerCase());
  if (mapped) {
    return mapped[1];
  }
  return readableLabel(normalized);
}

export function cardFriendlyOutcome(value: string): string {
  return value.replace(/ vs /g, " or ").replace(/\s{2,}/g, " ").trim();
}

export function cardFriendlyMatchup(value: string): string {
  return value.replace(/_/g, " ").replace(/\s{2,}/g, " ").trim();
}

export function cleanedTeamName(value: string): string {
  return value.replace(/ \//g, "").trim();
}

export function normalizedBetSelection(value: string, marketNoun: string): string {
  let result = value
    .replace(/(\b\d+(?:\.\d+)?)\s+\1$/, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();

  if (marketNoun === "Moneyline") {
    if (!result.toLowerCase().includes("moneyline")) {
      result += " Moneyline";
    }
    return cleanSentenceSpacing(result);
  }

  if (!result.toLowerCase().includes(marketNoun.toLowerCase()) && /\bover\b|\bunder\b/i.test(result)) {
    result += ` ${marketNoun}`;
  }

  return cleanSentenceSpacing(result);
}

export function hasStandaloneBetSubject(value: string, market: string | null | undefined): boolean {
  const stripped = value
    .replace(/[+-]?\d+(?:\.\d+)?/g, " ")
    .replace(
      /\b(over|under|moneyline|spread|total|player|assists?|rebounds?|points?|hits?|threes?|steals?|blocks?|turnovers?|first|quarter|half|game|line|alternate|alt)\b/gi,
      " "
    )
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

  if (stripped.split(/\s+/).filter(Boolean).length >= 2) {
    return true;
  }

  if (!market) {
    return false;
  }
  if (!market.toLowerCase().includes("moneyline")) {
    return false;
  }
  return stripped.length > 0;
}

export function formatAmericanOdds(value: number): string {
  const intValue = Math.round(value);
  return intValue > 0 ? `+${intValue}` : `${intValue}`;
}

export function percentText(value: number): string {
  const percent = value >= 1 ? value : value * 100;
  return `${percent.toFixed(2)}%`;
}

export function moneyText(value: number): string {
  if (Math.round(value) === value) {
    return String(Math.trunc(value));
  }
  return value.toFixed(2);
}

export function moneyTextWithDollar(value: number): string {
  return `$${moneyText(value)}`;
}

export function parseISO8601(value: string): Date | undefined {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export function shortISODateTime(value: string): string {
  const date = parseISO8601(value);
  if (!date) {
    return value;
  }
  const formatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  // Intl renders "Jun 12, 7:00 PM"; normalize the narrow no-break space some ICU builds emit.
  return formatter.format(date).replace(/ /g, " ");
}

export function easternEventTime(date: Date): string {
  const dayFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const timeFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  const day = dayFormatter.format(date).replace(/ /g, " ");
  const time = timeFormatter.format(date).replace(/ /g, " ");
  return `${day} at ${time} ET`;
}

export function numericSubstring(value: string): number | undefined {
  const match = value.match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : undefined;
}
