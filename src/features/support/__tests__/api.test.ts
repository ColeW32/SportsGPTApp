jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
jest.mock("@react-native-firebase/auth", () => {
  const user = { getIdToken: jest.fn(async () => "id-token") };
  return { __esModule: true, default: () => ({ currentUser: user }) };
});
jest.mock("react-native-purchases", () => ({
  __esModule: true,
  default: { getAppUserID: jest.fn(async () => "rc-user") },
  PACKAGE_TYPE: { ANNUAL: "ANNUAL", LIFETIME: "LIFETIME", MONTHLY: "MONTHLY" },
}));
jest.mock("expo-updates", () => ({ updateId: "update-1" }));

import { buildClientContext, fetchConversation, sendSupportMessage } from "../api";

const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => data });

describe("support api", () => {
  beforeEach(() => {
    (globalThis as any).fetch = jest.fn();
  });

  it("GETs the sportsgpt thread with the Firebase bearer token and reads the bare body", async () => {
    const convo = { conversationId: "c1", status: "open", unread: true, messages: [] };
    (globalThis as any).fetch.mockResolvedValue(ok(convo));

    await expect(fetchConversation()).resolves.toEqual(convo);
    const [url, init] = (globalThis as any).fetch.mock.calls[0];
    expect(url).toBe("https://api.juicedbets.io/v1/support/conversation?app=sportsgpt");
    expect(init.headers.Authorization).toBe("Bearer id-token");
  });

  it("POSTs messages as multipart with app, text and JSON context", async () => {
    const msg = { id: "m1", sender: "user", text: "hi", images: [], createdAt: "2026-09-21T00:00:00Z" };
    (globalThis as any).fetch.mockResolvedValue(ok(msg));

    await expect(sendSupportMessage("hi", { isPro: false, screen: "s" })).resolves.toEqual(msg);
    const [, init] = (globalThis as any).fetch.mock.calls[0];
    expect(init.method).toBe("POST");
    expect(init.body).toBeInstanceOf(FormData);
    expect(init.headers["Content-Type"]).toBeUndefined(); // boundary must come from fetch
  });

  it("throws on a non-2xx so the UI can offer retry", async () => {
    (globalThis as any).fetch.mockResolvedValue({ ok: false, status: 401, json: async () => ({}) });
    await expect(fetchConversation()).rejects.toThrow("HTTP 401");
  });

  it("builds client context from the installed build", async () => {
    const ctx = await buildClientContext("account_settings");
    expect(ctx).toMatchObject({ updateId: "update-1", rcAppUserId: "rc-user", isPro: false, screen: "account_settings" });
    expect(ctx.os).toMatch(/^ios|^android/);
  });
});
