// Port of MoneyLineAIData.formattedAnswer / assistantPresentation and the
// RecommendationInfo → AssistantPresentation.Recommendation transformation
// (SportsGPTModels.swift:1048-1316).

import {
  caseInsensitiveTrimmed,
  cardFriendlyMatchup,
  cardFriendlyTitle,
  cleanSentenceSpacing,
  equalsIgnoringCase,
  hasStandaloneBetSubject,
  moneyTextWithDollar,
  parseISO8601,
  percentText,
  readableLabel,
  trimmedOrUndefined,
} from "./format";
import type {
  AssistantPresentation,
  BetRef,
  Confidence,
  Fact,
  MetricKind,
  MetricSnapshot,
  MoneyLineAIData,
  PresentationInfo,
  Recommendation,
  RecommendationInfo,
} from "./types";

interface ResolvedEvent {
  matchup?: string;
  startTime?: Date;
}

type RecordObject = Record<string, unknown>;

export function formattedAnswer(data: MoneyLineAIData): string {
  if (data.presentation) {
    return (
      data.presentation.summary ?? data.presentation.headline ?? data.answer ?? data.analysis?.summary ?? ""
    );
  }

  if (data.answer != null) {
    return formatPlainAnswer(data.answer);
  }

  return data.analysis?.summary ?? "";
}

// Port of SportsGPTAnswerFormatter.format — markdown-looking answers pass through untouched.
function formatPlainAnswer(rawAnswer: string): string {
  const normalized = rawAnswer.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (normalized.includes("**") || normalized.includes("\n- ") || /\n\d+\./.test(normalized)) {
    return normalized;
  }
  return cleanSentenceSpacing(normalized);
}

export function toAssistantPresentation(data: MoneyLineAIData): AssistantPresentation | undefined {
  const presentation = data.presentation;
  if (!presentation) {
    return undefined;
  }

  const recordObjects = (data.records ?? []).map((r) =>
    r && typeof r === "object" && !Array.isArray(r) ? (r as RecordObject) : undefined
  );
  const resolvedEvent = resolvedPresentationEvent(presentation);

  const primaryPick = presentation.primaryPick
    ? toRecommendation(presentation.primaryPick, recordAt(recordObjects, presentation.primaryPick.recordIndex), resolvedEvent, false)
    : undefined;
  const alternativePick = presentation.alternativePick
    ? toRecommendation(presentation.alternativePick, recordAt(recordObjects, presentation.alternativePick.recordIndex), resolvedEvent, false)
    : undefined;

  // Line comparison: every card is the SAME selection at a DIFFERENT book, so the
  // normal selection-based dedup (and hiding cards that match the primary pick)
  // would collapse them all to one. Keep one card per book instead.
  if (presentation.responseType === "line_comparison") {
    const primaryBook = primaryPick?.bookmakerName;
    const seenBooks = new Set<string>();
    const bookCards = (presentation.cards ?? [])
      .map((card) => toRecommendation(card, recordAt(recordObjects, card.recordIndex), resolvedEvent, false))
      .filter((card): card is Recommendation => Boolean(card))
      .filter((card) => {
        const book = card.bookmakerName;
        if (!book || book === primaryBook) {
          return false;
        }
        if (seenBooks.has(book)) {
          return false;
        }
        seenBooks.add(book);
        return true;
      });

    return {
      headline: trimmedOrUndefined(presentation.headline),
      summary: trimmedOrUndefined(presentation.summary),
      sourceLabel: trimmedOrUndefined(presentation.sourceLabel),
      confidence: confidenceFrom(presentation.confidence),
      entityMatchup: resolvedEvent?.matchup,
      primaryPick,
      alternativePick: undefined,
      cards: bookCards,
      expandedExplanation: expandedExplanation(data),
      lineComparison: true,
    };
  }

  const hiddenKeys = new Set(
    [primaryPick, alternativePick].filter((p): p is Recommendation => Boolean(p)).map(displayDedupKey)
  );

  const seenKeys = new Set<string>();
  const supportingCards = (presentation.cards ?? [])
    .map((card) => toRecommendation(card, recordAt(recordObjects, card.recordIndex), resolvedEvent, true))
    .filter((card): card is Recommendation => Boolean(card))
    .filter((card) => !hiddenKeys.has(displayDedupKey(card)))
    .filter((card) => {
      const key = displayDedupKey(card);
      if (seenKeys.has(key)) {
        return false;
      }
      seenKeys.add(key);
      return true;
    });

  return {
    headline: trimmedOrUndefined(presentation.headline),
    summary: trimmedOrUndefined(presentation.summary),
    sourceLabel: trimmedOrUndefined(presentation.sourceLabel),
    confidence: confidenceFrom(presentation.confidence),
    entityMatchup: resolvedEvent?.matchup,
    primaryPick,
    alternativePick,
    cards: supportingCards,
    expandedExplanation: expandedExplanation(data),
  };
}

function recordAt(records: (RecordObject | undefined)[], index: number | null | undefined): RecordObject | undefined {
  if (index == null || index < 0 || index >= records.length) {
    return undefined;
  }
  return records[index];
}

function resolvedPresentationEvent(presentation: PresentationInfo): ResolvedEvent | undefined {
  const candidates = [presentation.primaryPick?.event, presentation.cards?.[0]?.event];
  for (const event of candidates) {
    if (!event) {
      continue;
    }
    const matchup = event.matchup ? trimmedOrUndefined(cardFriendlyMatchup(event.matchup)) : undefined;
    const startTime = event.startTime ? parseISO8601(event.startTime) : undefined;
    if (matchup || startTime) {
      return { matchup, startTime };
    }
  }
  return undefined;
}

function confidenceFrom(raw: string | null | undefined): Confidence | undefined {
  const lowered = raw?.toLowerCase();
  return lowered === "high" || lowered === "medium" || lowered === "low" ? lowered : undefined;
}

function toRecommendation(
  info: RecommendationInfo,
  record: RecordObject | undefined,
  presentationEvent: ResolvedEvent | undefined,
  requiresReadableContext: boolean
): Recommendation | undefined {
  const primarySelection = sanitizeOverUnderSelection(
    trimmedOrUndefined(info.selection) ?? normalizedSelectionFromOutcome(info)
  );
  if (!primarySelection) {
    return undefined;
  }

  const preferredMarketLabel =
    trimmedOrUndefined(info.marketLabel) ?? (info.market ? trimmedOrUndefined(cardFriendlyTitle(info.market)) : undefined);
  const renderedSelection = displaySelection(primarySelection, preferredMarketLabel, record);
  const readableContext = presentationEvent?.matchup
    ? trimmedOrUndefined(cardFriendlyMatchup(presentationEvent.matchup))
    : undefined;
  const hasStandaloneSubject = hasStandaloneBetSubject(renderedSelection, preferredMarketLabel);
  const contextLabel = readableContext;

  if (requiresReadableContext && !hasStandaloneSubject && !contextLabel) {
    return undefined;
  }

  return {
    signalLabel: trimmedOrUndefined(info.signalLabel),
    selection: renderedSelection,
    contextLabel,
    eventStartTime: presentationEvent?.startTime,
    marketLabel: preferredMarketLabel,
    oddsDisplay: displayOdds(info),
    bookmakerName: trimmedOrUndefined(info.bookmakerName),
    bookmakerId: trimmedOrUndefined(info.bookmakerId)?.toLowerCase(),
    sourceType: info.sourceType ? trimmedOrUndefined(readableLabel(info.sourceType)) : undefined,
    confidence: confidenceFrom(info.confidence),
    rationale: trimmedOrUndefined(info.rationale ?? info.reason),
    betRef: toBetRef(info.betRef),
    facts: recommendationFacts(info),
    metricSnapshot: recommendationMetricSnapshot(info),
  };
}

function toBetRef(raw: RecommendationInfo["betRef"]): BetRef | undefined {
  if (!raw || typeof raw !== "object") {
    return undefined;
  }
  if (typeof raw.eventId !== "string" || typeof raw.market !== "string") {
    return undefined;
  }
  return {
    eventId: raw.eventId,
    market: raw.market,
    ...(typeof raw.outcome === "string" ? { outcome: raw.outcome } : {}),
    ...(typeof raw.point === "number" ? { point: raw.point } : {}),
    ...(typeof raw.side === "string" ? { side: raw.side } : {}),
    ...(typeof raw.playerId === "string" ? { playerId: raw.playerId } : {}),
    ...(typeof raw.playerName === "string" ? { playerName: raw.playerName } : {}),
  };
}

function displayOdds(info: RecommendationInfo): string | undefined {
  const display = trimmedOrUndefined(info.oddsDisplay);
  if (display) {
    return display;
  }
  if (info.odds == null) {
    return undefined;
  }
  const intValue = Math.round(info.odds);
  return intValue > 0 ? `+${intValue}` : `${intValue}`;
}

function pointDisplay(point: unknown): string | undefined {
  // Mirrors JSONValue.displayValue(for: "line") — line values render via stringValue.
  if (typeof point === "number") {
    return Math.round(point) === point ? String(Math.trunc(point)) : point.toFixed(2);
  }
  if (typeof point === "string") {
    return trimmedOrUndefined(point);
  }
  return undefined;
}

// The upstream sometimes appends a spread-style handicap to a totals selection
// that already carries its line, e.g. "Over 8.5 +8.5" (the `outcome` field stays
// clean as "Over 8.5"). A totals bet has no handicap, so drop a trailing signed
// number that follows an Over/Under line. Spreads (e.g. "+3.5", "Boston -1.5")
// don't start with Over/Under, so they're untouched.
function sanitizeOverUnderSelection(selection: string | undefined): string | undefined {
  if (!selection) {
    return selection;
  }
  return selection
    .replace(/^((?:over|under)\s+\d+(?:\.\d+)?)\s+[+-]\d+(?:\.\d+)?$/i, "$1")
    .trim();
}

function normalizedSelectionFromOutcome(info: RecommendationInfo): string | undefined {
  const outcome = trimmedOrUndefined(info.outcome);
  if (!outcome) {
    return undefined;
  }

  const pointText = pointDisplay(info.point);
  if (pointText) {
    if (equalsIgnoringCase(outcome, "Over") || equalsIgnoringCase(outcome, "Under")) {
      return `${capitalize(outcome)} ${pointText}`.trim();
    }
    if (/\bover\b|\bunder\b/i.test(outcome)) {
      return outcome.includes(pointText) ? outcome : `${outcome} ${pointText}`;
    }
  }

  return outcome;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

function recordString(record: RecordObject, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function displaySelection(
  selection: string,
  marketTitle: string | undefined,
  record: RecordObject | undefined
): string {
  if (!marketTitle || !record || hasStandaloneBetSubject(selection, marketTitle)) {
    return selection;
  }

  const playerName = recordString(record, [
    "description",
    "playerName",
    "player",
    "athleteName",
    "participantName",
    "name",
  ]);
  if (playerName) {
    if (equalsIgnoringCase(selection, "Yes")) {
      return cleanSentenceSpacing(playerName);
    }
    if (equalsIgnoringCase(selection, "No")) {
      return cleanSentenceSpacing(`No ${playerName}`);
    }
    if (!caseInsensitiveTrimmed(selection).includes(caseInsensitiveTrimmed(playerName))) {
      return cleanSentenceSpacing(`${playerName} ${selection}`);
    }
  }

  const teamName = recordString(record, ["teamName", "team", "outcome"]);
  if (
    teamName &&
    !caseInsensitiveTrimmed(selection).includes(caseInsensitiveTrimmed(teamName)) &&
    (marketTitle === "Moneyline" || marketTitle === "Spread" || marketTitle === "Total")
  ) {
    return cleanSentenceSpacing(`${teamName} ${selection}`);
  }

  return selection;
}

function recommendationFacts(info: RecommendationInfo): Fact[] {
  const metrics = info.metrics;
  const facts: (Fact | undefined)[] = [
    sourceFact(info),
    fact("Edge", metrics?.edgePct != null ? percentText(metrics.edgePct) : undefined, "edge"),
    fact("EV", metrics?.evPct != null ? percentText(metrics.evPct) : undefined, "ev"),
    fact("Unit EV", metrics?.ev != null ? moneyTextWithDollar(metrics.ev) : undefined),
    fact("Profit", metrics?.profitPct != null ? percentText(metrics.profitPct) : undefined),
    fact("Guaranteed", metrics?.guaranteedProfit != null ? moneyTextWithDollar(metrics.guaranteedProfit) : undefined),
    fact("Implied", metrics?.impliedProb != null ? percentText(metrics.impliedProb) : undefined, "implied"),
    fact("Model", metrics?.modelProb != null ? percentText(metrics.modelProb) : undefined, "model"),
  ];
  return facts.filter((f): f is Fact => Boolean(f));
}

function sourceFact(info: RecommendationInfo): Fact | undefined {
  const label = (info.sourceType ? trimmedOrUndefined(readableLabel(info.sourceType)) : undefined) ?? "Book";
  return fact(label, trimmedOrUndefined(info.bookmakerName));
}

function fact(label: string, value: string | undefined, kind?: MetricKind): Fact | undefined {
  if (!value || !value.trim()) {
    return undefined;
  }
  return { label, value, kind };
}

function recommendationMetricSnapshot(info: RecommendationInfo): MetricSnapshot | undefined {
  const metrics = info.metrics;
  const snapshot: MetricSnapshot = {
    edgePct: metrics?.edgePct ?? undefined,
    evPct: metrics?.evPct ?? undefined,
    impliedProb: metrics?.impliedProb ?? undefined,
    modelProb: metrics?.modelProb ?? undefined,
  };
  if (
    snapshot.edgePct == null &&
    snapshot.evPct == null &&
    snapshot.impliedProb == null &&
    snapshot.modelProb == null
  ) {
    return undefined;
  }
  return snapshot;
}

export function displayDedupKey(rec: Recommendation): string {
  return [
    caseInsensitiveTrimmed(rec.selection),
    rec.marketLabel ? caseInsensitiveTrimmed(rec.marketLabel) : "",
    rec.oddsDisplay ? caseInsensitiveTrimmed(rec.oddsDisplay) : "",
    rec.bookmakerName ? caseInsensitiveTrimmed(rec.bookmakerName) : "",
  ].join("|");
}

function expandedExplanation(data: MoneyLineAIData): string | undefined {
  const summaryKey = data.presentation?.summary ? caseInsensitiveTrimmed(data.presentation.summary) : undefined;

  const answer = trimmedOrUndefined(data.answer);
  if (answer && caseInsensitiveTrimmed(answer) !== summaryKey) {
    return answer;
  }

  const analysisSummary = trimmedOrUndefined(data.analysis?.summary);
  if (analysisSummary && caseInsensitiveTrimmed(analysisSummary) !== summaryKey) {
    return analysisSummary;
  }

  const highlights = data.analysis?.highlights;
  if (highlights && highlights.length > 0) {
    return highlights.join("\n");
  }

  return undefined;
}
