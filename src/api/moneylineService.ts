// Port of MoneyLineService.swift — orchestrates the chat call with the
// event-resolution enrichment/retry/fallback heuristics (see moneylineFallbacks.ts).

import { FreeLimitReachedError, ServerError } from "./errors";
import { fetchBestBets, fetchEventBestBets, sendChat } from "./moneylineClient";
import {
  buildFallbackResponse,
  deriveMatchup,
  enrichMessages,
  eventResolutionMessages,
  isEventResolutionServerError,
  matchupShortLabel,
  matchupShortPromptText,
  resolveEvent,
  shouldFallbackToEventBestBets,
  shouldRetryAsEventRecommendation,
} from "./moneylineFallbacks";
import type { Sportsbook } from "./sportsbooks";
import type {
  BestBetEvent,
  ChatMessage,
  MoneyLineAIData,
  MoneyLineChatRequest,
  SuggestedPrompt,
  SuggestedPromptSeed,
} from "./types";

const EVENT_BEST_AVAILABLE_BET_CONTEXT = "event_best_available_bet";

export const BEST_BET_TODAY_PROMPT: SuggestedPrompt = {
  id: "best-bet-today",
  text: "What's the best bet today?",
  shortLabel: "Best Bet Today",
};

function toWirePayload(
  context: string | undefined,
  selectedBookmakers: Sportsbook[],
  messages: ChatMessage[]
): MoneyLineChatRequest {
  return {
    context,
    scope: "large",
    responseFormat: "hybrid",
    filters: selectedBookmakers.length > 0 ? { bookmakers: selectedBookmakers.map((b) => b.apiValue) } : undefined,
    messages: messages.map((m) => ({ role: m.role, content: m.text })),
  };
}

function onlyBookmaker(selectedBookmakers: Sportsbook[]): string | undefined {
  return selectedBookmakers.length === 1 ? selectedBookmakers[0].apiValue : undefined;
}

async function fallbackEventResponse(
  event: BestBetEvent,
  selectedBookmakers: Sportsbook[]
): Promise<MoneyLineAIData> {
  const eventData = await fetchEventBestBets(event.eventId, onlyBookmaker(selectedBookmakers));
  return buildFallbackResponse(eventData);
}

export async function sendMessages(
  messages: ChatMessage[],
  selectedBookmakers: Sportsbook[],
  bestBetEvents: BestBetEvent[]
): Promise<MoneyLineAIData> {
  const baseMessages = messages.filter((m) => m.includeInAPIRequest).slice(-6);
  const enriched = enrichMessages(baseMessages, bestBetEvents);
  const latestText = enriched[enriched.length - 1]?.text ?? "";

  const primaryResponse = await sendChat(toWirePayload(undefined, selectedBookmakers, enriched));

  const resolvedEvent = resolveEvent(latestText, bestBetEvents);

  if (shouldRetryAsEventRecommendation(primaryResponse, enriched[enriched.length - 1]?.text)) {
    const retryMessages = eventResolutionMessages(enriched, bestBetEvents);
    if (retryMessages) {
      try {
        const retryResponse = await sendChat(
          toWirePayload(EVENT_BEST_AVAILABLE_BET_CONTEXT, selectedBookmakers, retryMessages)
        );
        if (shouldFallbackToEventBestBets(retryResponse) && resolvedEvent) {
          return fallbackEventResponse(resolvedEvent, selectedBookmakers);
        }
        return retryResponse;
      } catch (error) {
        // The retry consumes a second server-side ask; if it trips the free limit,
        // the answer already in hand beats sending the user to the paywall.
        if (error instanceof FreeLimitReachedError) {
          return primaryResponse;
        }
        if (error instanceof ServerError && isEventResolutionServerError(error.message)) {
          if (resolvedEvent) {
            return fallbackEventResponse(resolvedEvent, selectedBookmakers);
          }
          return primaryResponse;
        }
        throw error;
      }
    }
  }

  if (shouldFallbackToEventBestBets(primaryResponse) && resolvedEvent) {
    return fallbackEventResponse(resolvedEvent, selectedBookmakers);
  }

  return primaryResponse;
}

function promptFromBestBet(event: BestBetEvent): SuggestedPrompt | undefined {
  const matchup = deriveMatchup(event);
  if (!matchup) {
    return undefined;
  }
  return {
    id: event.eventId,
    text: `What are the best bets for the ${matchupShortPromptText(matchup)}?`,
    shortLabel: matchupShortLabel(matchup),
  };
}

function dedupeByText(prompts: SuggestedPrompt[]): SuggestedPrompt[] {
  const seen = new Set<string>();
  return prompts.filter((p) => {
    if (seen.has(p.text)) {
      return false;
    }
    seen.add(p.text);
    return true;
  });
}

export async function fetchSuggestedPromptSeed(selectedBookmakers: Sportsbook[]): Promise<SuggestedPromptSeed> {
  const events = await fetchBestBets(8, onlyBookmaker(selectedBookmakers));
  const dynamicPrompts = dedupeByText(
    events.map(promptFromBestBet).filter((p): p is SuggestedPrompt => Boolean(p))
  ).slice(0, 4);

  const prompts = dedupeByText([BEST_BET_TODAY_PROMPT, ...dynamicPrompts]);

  return { prompts, events };
}
