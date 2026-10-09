// The one client for Juiced backend endpoints SportsGPT calls (support chat, slip check). Auth is
// the Firebase ID token, not a Juiced session: both apps share one Firebase project.
import auth from "@react-native-firebase/auth";

import { JUICED_API_BASE } from "./constants";

export class JuicedHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** The backend's own plain-English message, when it sent one. */
    readonly serverMessage?: string
  ) {
    super(message);
    this.name = "JuicedHttpError";
  }
}

async function readServerMessage(res: Response): Promise<string | undefined> {
  try {
    const body = (await res.json()) as { message?: unknown };
    return typeof body?.message === "string" && body.message.trim() ? body.message.trim() : undefined;
  } catch {
    return undefined; // Non-JSON error bodies (nginx pages) carry nothing to show.
  }
}

export async function juicedRequest<T>(path: string, init: RequestInit = {}, timeoutMs = 15_000): Promise<T> {
  const user = auth().currentUser;
  if (!user) throw new Error("Not signed in yet.");
  const token = await user.getIdToken();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${JUICED_API_BASE}${path}`, {
      ...init,
      headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new JuicedHttpError(`${init.method ?? "GET"} ${path} failed: HTTP ${res.status}`, res.status, await readServerMessage(res));
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}
