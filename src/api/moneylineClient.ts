import functions from "@react-native-firebase/functions";
import { EmptyResponseError, FreeLimitReachedError, ServerError } from "./errors";
import type {
  BestBetEvent,
  BestBetsResponse,
  EventBestBetsResponse,
  MoneyLineAIData,
  MoneyLineAIResponse,
  MoneyLineChatRequest,
} from "./types";

export { EmptyResponseError, FreeLimitReachedError, ServerError };

const PROXY_UNREACHABLE_MESSAGE =
  "SportsGPT couldn't reach the MoneyLine proxy. Please make sure you're on the latest build and try again.";

interface Envelope {
  success: boolean;
  error?: { message?: string } | null;
}

async function call<T extends Envelope>(payload: Record<string, unknown>): Promise<T> {
  let result;
  try {
    result = await functions().httpsCallable("moneylineProxy")(payload);
  } catch (e) {
    throw mapCallableError(e);
  }

  const envelope = result.data as T;
  if (!envelope?.success) {
    throw new ServerError(envelope?.error?.message ?? "The MoneyLine request failed.");
  }
  return envelope;
}

function mapCallableError(e: unknown): Error {
  const err = e as { code?: string; details?: { code?: string }; message?: string };

  if (err?.code === "functions/resource-exhausted" && err?.details?.code === "free-limit-reached") {
    return new FreeLimitReachedError();
  }

  if (
    err?.code === "functions/unauthenticated" ||
    err?.code === "functions/failed-precondition" ||
    err?.code === "functions/permission-denied"
  ) {
    return new ServerError(PROXY_UNREACHABLE_MESSAGE);
  }

  return new ServerError(err?.message ?? "The MoneyLine AI response was invalid.");
}

export async function sendChat(payload: MoneyLineChatRequest): Promise<MoneyLineAIData> {
  const response = await call<MoneyLineAIResponse & Envelope>({ operation: "aiChat", body: payload });
  if (!response.data) {
    throw new EmptyResponseError("MoneyLine AI returned an empty response.");
  }
  return response.data;
}

export async function fetchBestBets(limit: number, bookmaker?: string): Promise<BestBetEvent[]> {
  const response = await call<BestBetsResponse & Envelope>({
    operation: "bestBets",
    limit,
    ...(bookmaker ? { bookmaker } : {}),
  });
  return response.data ?? [];
}

export async function fetchEventBestBets(eventId: string, bookmaker?: string): Promise<BestBetEvent> {
  const response = await call<EventBestBetsResponse & Envelope>({
    operation: "eventBestBets",
    eventId,
    ...(bookmaker ? { bookmaker } : {}),
  });
  if (!response.data) {
    throw new EmptyResponseError("MoneyLine AI returned an empty response.");
  }
  return response.data;
}
