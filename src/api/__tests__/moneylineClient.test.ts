const mockCallable = jest.fn();

jest.mock("@react-native-firebase/functions", () => () => ({
  httpsCallable: () => mockCallable,
}));

import {
  EmptyResponseError,
  FreeLimitReachedError,
  ServerError,
  fetchBestBets,
  fetchEventBestBets,
  sendChat,
} from "../moneylineClient";

beforeEach(() => {
  mockCallable.mockReset();
});

describe("sendChat", () => {
  const payload = { scope: "large", responseFormat: "hybrid", messages: [] };

  it("wraps the request as an aiChat operation and unwraps data", async () => {
    mockCallable.mockResolvedValue({ data: { success: true, data: { answer: "hi" } } });
    const data = await sendChat(payload);
    expect(mockCallable).toHaveBeenCalledWith({ operation: "aiChat", body: payload });
    expect(data.answer).toBe("hi");
  });

  it("throws EmptyResponseError when success without data", async () => {
    mockCallable.mockResolvedValue({ data: { success: true } });
    await expect(sendChat(payload)).rejects.toBeInstanceOf(EmptyResponseError);
  });

  it("maps success:false envelopes to ServerError with the message", async () => {
    mockCallable.mockResolvedValue({ data: { success: false, error: { message: "nope" } } });
    await expect(sendChat(payload)).rejects.toThrow("nope");
  });

  it("maps resource-exhausted free-limit details to FreeLimitReachedError", async () => {
    mockCallable.mockRejectedValue(
      Object.assign(new Error("limit"), {
        code: "functions/resource-exhausted",
        details: { code: "free-limit-reached" },
      })
    );
    await expect(sendChat(payload)).rejects.toBeInstanceOf(FreeLimitReachedError);
  });

  it("maps auth/app-check failures to the latest-build message", async () => {
    mockCallable.mockRejectedValue(Object.assign(new Error("denied"), { code: "functions/unauthenticated" }));
    await expect(sendChat(payload)).rejects.toThrow(/latest build/);
  });

  it("preserves upstream server error messages from internal errors", async () => {
    mockCallable.mockRejectedValue(Object.assign(new Error("matches multiple games"), { code: "functions/internal" }));
    await expect(sendChat(payload)).rejects.toThrow("matches multiple games");
  });
});

describe("fetchBestBets", () => {
  it("passes limit and bookmaker, returns data array", async () => {
    mockCallable.mockResolvedValue({ data: { success: true, data: [{ eventId: "e1", markets: [] }] } });
    const events = await fetchBestBets(8, "draftkings");
    expect(mockCallable).toHaveBeenCalledWith({ operation: "bestBets", limit: 8, bookmaker: "draftkings" });
    expect(events).toHaveLength(1);
  });

  it("omits bookmaker when not provided and defaults missing data to []", async () => {
    mockCallable.mockResolvedValue({ data: { success: true } });
    const events = await fetchBestBets(4);
    expect(mockCallable).toHaveBeenCalledWith({ operation: "bestBets", limit: 4 });
    expect(events).toEqual([]);
  });
});

describe("fetchEventBestBets", () => {
  it("passes eventId and unwraps the event", async () => {
    mockCallable.mockResolvedValue({ data: { success: true, data: { eventId: "e1", markets: [] } } });
    const event = await fetchEventBestBets("e1");
    expect(mockCallable).toHaveBeenCalledWith({ operation: "eventBestBets", eventId: "e1" });
    expect(event.eventId).toBe("e1");
  });

  it("throws EmptyResponseError when no event returned", async () => {
    mockCallable.mockResolvedValue({ data: { success: true } });
    await expect(fetchEventBestBets("e1")).rejects.toBeInstanceOf(EmptyResponseError);
  });

  it("ServerError is also a SportsGPT server error for callers matching on message", async () => {
    mockCallable.mockResolvedValue({ data: { success: false, error: { message: "unable to resolve" } } });
    await expect(fetchEventBestBets("e1")).rejects.toBeInstanceOf(ServerError);
  });
});
