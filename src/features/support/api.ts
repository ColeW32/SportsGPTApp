// Client for the Juiced support-chat user endpoints (contract: Juiced_Backend
// docs/superpowers/specs/2026-09-21-support-chat-design.md). Auth is the Firebase
// ID token, not a Juiced session, so the same thread works for anonymous users.
import Constants from "expo-constants";
import * as Updates from "expo-updates";
import { Platform } from "react-native";
import Purchases from "react-native-purchases";

import { juicedRequest } from "../../api/juicedClient";
import { isPremium, useSubscriptionStore } from "../../state/subscriptionStore";

const APP = "sportsgpt";
const TIMEOUT_MS = 15_000;

export type SupportSender = "user" | "admin" | "ai";

export interface SupportMessage {
  id: string;
  sender: SupportSender;
  text: string;
  images: string[];
  createdAt: string;
}

export interface SupportConversation {
  conversationId: string | null;
  status: "open" | "closed" | null;
  unread: boolean;
  messages: SupportMessage[];
}

export interface ClientContext {
  appVersion?: string;
  buildNumber?: string;
  updateId?: string;
  os?: string;
  device?: string;
  rcAppUserId?: string;
  isPro?: boolean;
  screen?: string;
}

function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  return juicedRequest<T>(path, init, TIMEOUT_MS);
}

export function fetchConversation(): Promise<SupportConversation> {
  return request<SupportConversation>(`/support/conversation?app=${APP}`);
}

export function markConversationRead(): Promise<{ ok: true }> {
  return request(`/support/conversation/read?app=${APP}`, { method: "POST" });
}

export function sendSupportMessage(text: string, context: ClientContext): Promise<SupportMessage> {
  // The endpoint is multipart even without images (screenshots arrive with the next native build).
  const form = new FormData();
  form.append("app", APP);
  form.append("text", text);
  form.append("context", JSON.stringify(context));
  return request<SupportMessage>("/support/messages", { method: "POST", body: form });
}

export async function buildClientContext(screen: string): Promise<ClientContext> {
  let rcAppUserId: string | undefined;
  try {
    rcAppUserId = await Purchases.getAppUserID();
  } catch (e) {
    console.warn("[support] could not read RevenueCat app user id", e);
  }
  return {
    appVersion: Constants.expoConfig?.version,
    buildNumber: Constants.platform?.ios?.buildNumber ?? undefined,
    updateId: Updates.updateId ?? undefined,
    os: `${Platform.OS} ${Platform.Version}`,
    rcAppUserId,
    isPro: isPremium(useSubscriptionStore.getState().state),
    screen,
  };
}
