import functions from "@react-native-firebase/functions";
import { refreshAppCheckToken } from "./appCheck";
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
  "SportsGPT is finishing setup on this device. Please try again in a moment.";

// Callable failures that mean App Check / auth isn't ready yet — transient on a
// cold install while App Attest establishes. Worth one retry after a token refresh.
const TRANSIENT_CODES = new Set(["unauthenticated", "permission-denied", "failed-precondition"]);

interface Envelope {
  success: boolean;
  error?: { message?: string } | null;
}

// RN Firebase returns bare codes ("unauthenticated"); the JS SDK prefixes them
// ("functions/unauthenticated"). Normalize so mapping works on both.
function normalizedCode(code?: string): string {
  return (code ?? "").replace(/^functions\//, "");
}

function isFreeLimit(e: unknown): boolean {
  const err = e as { code?: string; details?: { code?: string } };
  return normalizedCode(err?.code) === "resource-exhausted" && err?.details?.code === "free-limit-reached";
}

function isTransient(e: unknown): boolean {
  if (isFreeLimit(e)) return false;
  return TRANSIENT_CODES.has(normalizedCode((e as { code?: string })?.code));
}

function mapCallableError(e: unknown): Error {
  if (isFreeLimit(e)) return new FreeLimitReachedError();
  if (isTransient(e)) return new ServerError(PROXY_UNREACHABLE_MESSAGE);
  return new ServerError((e as { message?: string })?.message ?? "The MoneyLine AI response was invalid.");
}

async function invoke<T>(payload: Record<string, unknown>): Promise<T> {
  const result = await functions().httpsCallable("moneylineProxy")(payload);
  return result.data as T;
}

async function call<T extends Envelope>(payload: Record<string, unknown>): Promise<T> {
  let envelope: T;
  try {
    envelope = await invoke<T>(payload);
  } catch (e) {
    if (isTransient(e)) {
      // App Attest may still be establishing — refresh the token and retry once.
      await refreshAppCheckToken();
      try {
        envelope = await invoke<T>(payload);
      } catch (retryError) {
        throw mapCallableError(retryError);
      }
    } else {
      throw mapCallableError(e);
    }
  }

  if (!envelope?.success) {
    throw new ServerError(envelope?.error?.message ?? "The MoneyLine request failed.");
  }
  return envelope;
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
