jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

import AsyncStorage from "@react-native-async-storage/async-storage";

import { resolvePromotionLink } from "../PromotionCard";
import { __resetSportsbookLinksForTest, loadSportsbookLinks } from "../../../api/sportsbookLinks";

describe("resolvePromotionLink", () => {
  beforeEach(async () => {
    __resetSportsbookLinksForTest();
    await AsyncStorage.clear();
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        { bookmakerId: "draftkings", brand: "DraftKings", url: "https://dk", logoUrl: null, badge: "LIVE" },
        { bookmakerId: "rebet", brand: "Rebet", url: "https://rebet", logoUrl: null, badge: "LIVE" },
      ],
    });
  });

  it("returns the recommended book's link when mapped", async () => {
    await loadSportsbookLinks();
    expect(resolvePromotionLink("draftkings").url).toBe("https://dk");
  });

  it("returns the Rebet fallback for an unmapped book or no recommendation", async () => {
    await loadSportsbookLinks();
    expect(resolvePromotionLink("betmgm").url).toBe("https://rebet");
    expect(resolvePromotionLink(undefined).url).toBe("https://rebet");
  });
});
