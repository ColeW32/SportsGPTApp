// DELETABLE MODULE: client-side compensation for MoneyLine AI event-resolution gaps,
// ported as-is from MoneyLineService.swift. Once the MoneyLine API ships machine-readable
// resolution statuses (see the design spec's follow-up contract), delete this file and the
// call sites in moneylineService.ts — nothing else depends on it.

import { EmptyResponseError } from "./errors";
import { cardFriendlyTitle, cleanedTeamName, formatAmericanOdds } from "./format";
import type {
  BestBetEvent,
  ChatMessage,
  EventMatchup,
  MoneyLineAIData,
  PresentationInfo,
  RecommendationInfo,
} from "./types";

export function deriveMatchup(event: BestBetEvent): EventMatchup | undefined {
  const market = event.markets.find((m) => m.marketType === "moneyline") ?? event.markets[0];
  if (!market) {
    return undefined;
  }

  const teamNames: string[] = [];
  for (const outcome of market.outcomes) {
    const name = cleanedTeamName(outcome.name);
    if (name && !teamNames.includes(name)) {
      teamNames.push(name);
    }
  }

  const primaryTeam = teamNames[0];
  if (!primaryTeam) {
    return undefined;
  }

  return {
    primaryTeam,
    opponentTeam: teamNames[1] ?? "their opponent",
    sport: event.sport ?? undefined,
    leagueId: event.leagueId ?? undefined,
  };
}

function sportDisplayName(matchup: EventMatchup): string | undefined {
  return matchup.sport?.toLowerCase();
}

export function matchupShortLabel(matchup: EventMatchup): string {
  return `${matchup.primaryTeam} vs ${matchup.opponentTeam}`;
}

export function matchupShortPromptText(matchup: EventMatchup): string {
  const sportText = sportDisplayName(matchup);
  if (sportText) {
    return `${matchup.primaryTeam} vs ${matchup.opponentTeam} ${sportText} game`;
  }
  return `${matchup.primaryTeam} vs ${matchup.opponentTeam} game`;
}

export function resolutionHint(matchup: EventMatchup): string {
  const parts: string[] = [];
  if (matchup.leagueId) {
    parts.push(matchup.leagueId.toUpperCase());
  }
  const sportText = sportDisplayName(matchup);
  if (sportText) {
    parts.push(sportText);
  }
  parts.push(`${matchup.primaryTeam} vs ${matchup.opponentTeam}`);
  return parts.join(" ");
}

export function resolveEvent(query: string, events: BestBetEvent[]): BestBetEvent | undefined {
  const normalizedQuery = query.toLowerCase();

  const ranked = events
    .map((event): [number, BestBetEvent] | undefined => {
      const matchup = deriveMatchup(event);
      if (!matchup) {
        return undefined;
      }
      const teamNames = [matchup.primaryTeam, matchup.opponentTeam];
      let score = 0;
      for (const team of teamNames) {
        const normalizedTeam = team.toLowerCase();
        if (normalizedQuery.includes(normalizedTeam)) {
          score += Math.max(2, normalizedTeam.split(" ").filter(Boolean).length * 3);
        } else {
          const tokens = normalizedTeam.split(" ").filter((t) => t.length >= 4);
          if (tokens.some((t) => normalizedQuery.includes(t))) {
            score += 2;
          }
        }
      }
      return score > 0 ? [score, event] : undefined;
    })
    .filter((entry): entry is [number, BestBetEvent] => Boolean(entry))
    .sort((a, b) => b[0] - a[0]);

  return ranked[0]?.[1];
}

export function resolveMatchup(query: string, events: BestBetEvent[]): EventMatchup | undefined {
  const event = resolveEvent(query, events);
  return event ? deriveMatchup(event) : undefined;
}

function lastUserIndex(messages: ChatMessage[]): number {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role === "user") {
      return i;
    }
  }
  return -1;
}

export function enrichMessages(messages: ChatMessage[], events: BestBetEvent[]): ChatMessage[] {
  const index = lastUserIndex(messages);
  if (index < 0) {
    return messages;
  }

  const matchup = resolveMatchup(messages[index].text, events);
  if (!matchup) {
    return messages;
  }

  const updated = [...messages];
  updated[index] = {
    ...messages[index],
    text: `${messages[index].text} For event resolution, this refers to the ${resolutionHint(matchup)} game.`,
  };
  return updated;
}

export function eventResolutionMessages(
  messages: ChatMessage[],
  events: BestBetEvent[]
): ChatMessage[] | undefined {
  const index = lastUserIndex(messages);
  if (index < 0) {
    return undefined;
  }

  const matchup = resolveMatchup(messages[index].text, events);
  if (!matchup) {
    return undefined;
  }

  const updated = [...messages];
  updated[index] = {
    ...messages[index],
    text: `${messages[index].text} This is specifically the ${resolutionHint(matchup)} game.`,
  };
  return updated;
}

function responseAnswerLowered(response: MoneyLineAIData): string {
  return (response.answer ?? response.analysis?.summary ?? "").toLowerCase();
}

export function shouldRetryAsEventRecommendation(
  response: MoneyLineAIData,
  latestMessage: string | undefined
): boolean {
  if (!latestMessage) {
    return false;
  }
  const loweredAnswer = responseAnswerLowered(response);
  const looksLikeMissingData =
    loweredAnswer.includes("don't see") || loweredAnswer.includes("do not see") || loweredAnswer.includes("need");
  const lowered = latestMessage.toLowerCase();
  const asksAboutGame = lowered.includes(" game") || lowered.includes("tonight");
  return looksLikeMissingData && asksAboutGame;
}

export function shouldFallbackToEventBestBets(response: MoneyLineAIData): boolean {
  const loweredAnswer = responseAnswerLowered(response);
  return (
    loweredAnswer.includes("don't see") ||
    loweredAnswer.includes("do not see") ||
    (response.records ?? []).length === 0
  );
}

export function isEventResolutionServerError(message: string): boolean {
  const lowered = message.toLowerCase();
  return lowered.includes("matches multiple games") || lowered.includes("unable to resolve");
}

export function buildFallbackResponse(eventData: BestBetEvent): MoneyLineAIData {
  const matchup = deriveMatchup(eventData);
  const moneyline = eventData.markets.find((m) => m.marketType === "moneyline");
  const preferredOutcome = moneyline?.outcomes[0];

  if (!matchup || !moneyline || !preferredOutcome) {
    throw new EmptyResponseError("MoneyLine AI returned an empty response.");
  }

  const matchupLabel = matchupShortLabel(matchup);
  const bestBook = preferredOutcome.bookmakerName ?? "best available book";
  const bestOdds = preferredOutcome.bestOdds != null ? formatAmericanOdds(preferredOutcome.bestOdds) : "best available odds";

  const opponent = moneyline.outcomes.length > 1 ? moneyline.outcomes[1] : undefined;
  const alternativeSentence = opponent
    ? `${cleanedTeamName(opponent.name)} moneyline is ${
        opponent.bestOdds != null ? formatAmericanOdds(opponent.bestOdds) : "N/A"
      } on ${opponent.bookmakerName ?? "best available book"}.`
    : "";

  const answer = [
    `For the ${matchupLabel} game, the clearest available line right now is ${cleanedTeamName(
      preferredOutcome.name
    )} moneyline at ${bestOdds} on ${bestBook}.`,
    alternativeSentence,
  ]
    .filter((part) => part.length > 0)
    .join(" ");

  const eventInfo = { matchup: matchupLabel, startTime: eventData.startTime ?? undefined };

  const primaryPick: RecommendationInfo = {
    signalType: "fallback",
    signalLabel: "Event Recommendation",
    selection: cleanedTeamName(preferredOutcome.name),
    marketLabel: "Moneyline",
    market: "moneyline",
    outcome: cleanedTeamName(preferredOutcome.name),
    odds: preferredOutcome.bestOdds ?? undefined,
    oddsDisplay: preferredOutcome.bestOdds != null ? formatAmericanOdds(preferredOutcome.bestOdds) : undefined,
    bookmakerName: preferredOutcome.bookmakerName ?? undefined,
    confidence: "medium",
    rationale: "This is the strongest currently available line from the event best-bets feed.",
    event: eventInfo,
  };

  const alternativePick: RecommendationInfo | undefined = opponent
    ? {
        signalType: "fallback",
        signalLabel: "Secondary Option",
        selection: cleanedTeamName(opponent.name),
        marketLabel: "Moneyline",
        market: "moneyline",
        outcome: cleanedTeamName(opponent.name),
        odds: opponent.bestOdds ?? undefined,
        oddsDisplay: opponent.bestOdds != null ? formatAmericanOdds(opponent.bestOdds) : undefined,
        bookmakerName: opponent.bookmakerName ?? undefined,
        confidence: "low",
        rationale: "This is the other currently available moneyline side for the same event.",
        event: eventInfo,
      }
    : undefined;

  const cards: RecommendationInfo[] = eventData.markets.flatMap((market) =>
    market.outcomes.slice(0, 2).map((outcome) => ({
      signalType: "fallback",
      signalLabel: cardFriendlyTitle(market.marketType),
      selection: cleanedTeamName(outcome.name),
      marketLabel: cardFriendlyTitle(market.marketType),
      market: market.marketType,
      outcome: cleanedTeamName(outcome.name),
      odds: outcome.bestOdds ?? undefined,
      oddsDisplay: outcome.bestOdds != null ? formatAmericanOdds(outcome.bestOdds) : undefined,
      bookmakerName: outcome.bookmakerName ?? undefined,
      reason: "Available event line",
      event: eventInfo,
    }))
  );

  const presentation: PresentationInfo = {
    responseType: "event_recommendation",
    headline: matchupLabel,
    summary: `${cleanedTeamName(preferredOutcome.name)} moneyline is the clearest available event recommendation right now.`,
    confidence: "medium",
    entity: { matchup: matchupLabel },
    primaryPick,
    alternativePick,
    cards,
    sourceLabel: "Event Recommendation",
  };

  const records = eventData.markets.flatMap((market) =>
    market.outcomes.map((outcome) => ({
      recordType: "best_bet",
      eventId: eventData.eventId,
      eventName: matchupLabel,
      title: cardFriendlyTitle(market.marketType),
      selection:
        market.marketType === "moneyline"
          ? `${cleanedTeamName(outcome.name)} Moneyline`
          : cleanedTeamName(outcome.name),
      outcome: cleanedTeamName(outcome.name),
      bookmakerName: outcome.bookmakerName ?? "Best Book",
      bestOdds: outcome.bestOdds != null ? formatAmericanOdds(outcome.bestOdds) : "",
      marketType: market.marketType,
      market: market.marketType,
      sport: eventData.sport ?? "",
      league: eventData.leagueId ?? "",
    }))
  );

  return { answer, analysis: undefined, presentation, records, context: undefined, sources: undefined };
}
