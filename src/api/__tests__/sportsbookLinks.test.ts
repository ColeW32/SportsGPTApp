jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  __resetSportsbookLinksForTest,
  getLinkForBook,
  getFallbackLink,
  loadSportsbookLinks,
  REBET_FALLBACK,
} from "../sportsbookLinks";

describe("sportsbookLinks", () => {
  beforeEach(async () => {
    __resetSportsbookLinksForTest();
    await AsyncStorage.clear();
    (global as any).fetch = jest.fn();
  });

  it("falls back to the bundled Rebet link before any load", () => {
    expect(getFallbackLink()).toEqual(REBET_FALLBACK);
    expect(getLinkForBook("draftkings")).toEqual(REBET_FALLBACK);
  });

  it("returns the mapped book link after a successful load", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => [
        { bookmakerId: "draftkings", brand: "DraftKings", url: "https://dk", logoUrl: null, badge: "LIVE" },
        { bookmakerId: "rebet", brand: "ReBet", url: "https://rebet", logoUrl: null, badge: "LIVE" },
      ],
    });

    await loadSportsbookLinks();

    expect(getLinkForBook("draftkings")?.url).toBe("https://dk");
    expect(getFallbackLink().url).toBe("https://rebet"); // feed Rebet overrides bundled
    expect(getLinkForBook("unmapped_book")?.url).toBe("https://rebet"); // unmapped → fallback
  });

  it("keeps the bundled fallback when the fetch fails", async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error("network"));
    await loadSportsbookLinks();
    expect(getFallbackLink()).toEqual(REBET_FALLBACK);
    expect(getLinkForBook("draftkings")).toEqual(REBET_FALLBACK);
  });
});
