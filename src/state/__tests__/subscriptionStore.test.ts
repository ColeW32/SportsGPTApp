jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

const mockGetCustomerInfo = jest.fn();
const mockGetOfferings = jest.fn();
const mockPurchasePackage = jest.fn();
const mockRestorePurchases = jest.fn();
const mockGetProducts = jest.fn();
const mockPurchaseStoreProduct = jest.fn();

jest.mock("react-native-purchases", () => ({
  __esModule: true,
  PACKAGE_TYPE: { ANNUAL: "ANNUAL", LIFETIME: "LIFETIME", MONTHLY: "MONTHLY" },
  default: {
    getCustomerInfo: (...args: unknown[]) => mockGetCustomerInfo(...args),
    getOfferings: (...args: unknown[]) => mockGetOfferings(...args),
    purchasePackage: (...args: unknown[]) => mockPurchasePackage(...args),
    restorePurchases: (...args: unknown[]) => mockRestorePurchases(...args),
    getProducts: (...args: unknown[]) => mockGetProducts(...args),
    purchaseStoreProduct: (...args: unknown[]) => mockPurchaseStoreProduct(...args),
  },
}));

import {
  FREE_REQUEST_LIMIT,
  isPremium,
  remainingFreeRequests,
  statusTitle,
  useSubscriptionStore,
} from "../subscriptionStore";

function customerInfo(opts: { active?: boolean; trial?: boolean; expiration?: string } = {}) {
  return {
    entitlements: {
      active: opts.active
        ? {
            "SportsGPT Pro": {
              periodType: opts.trial ? "TRIAL" : "NORMAL",
              expirationDate: opts.expiration ?? null,
            },
          }
        : {},
    },
    managementURL: opts.active ? "https://apps.apple.com/account/subscriptions" : null,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  useSubscriptionStore.setState({
    state: { kind: "neverSubscribed" },
    isPaywallPresented: false,
    paywallContext: "standard",
    areChatAdsEnabled: true,
    freeRequestCount: 0,
    planPrices: {},
    subscriptionErrorMessage: undefined,
  });
});

describe("updateFromCustomerInfo", () => {
  it("maps active trial entitlements", () => {
    useSubscriptionStore.getState().updateFromCustomerInfo(
      customerInfo({ active: true, trial: true, expiration: "2026-07-01T00:00:00Z" }) as never
    );
    const state = useSubscriptionStore.getState().state;
    expect(state.kind).toBe("activeTrial");
    expect(isPremium(state)).toBe(true);
    expect(statusTitle(state)).toBe("Trial Active");
  });

  it("maps active paid entitlements", () => {
    useSubscriptionStore.getState().updateFromCustomerInfo(customerInfo({ active: true }) as never);
    expect(useSubscriptionStore.getState().state.kind).toBe("activeSubscriber");
  });

  it("maps inactive entitlements and re-enables ads", () => {
    useSubscriptionStore.setState({ areChatAdsEnabled: false });
    useSubscriptionStore.getState().updateFromCustomerInfo(customerInfo() as never);
    expect(useSubscriptionStore.getState().state.kind).toBe("neverSubscribed");
    expect(useSubscriptionStore.getState().areChatAdsEnabled).toBe(true);
  });
});

describe("loadOfferings", () => {
  it("maps live package prices and computes weekly footnotes", async () => {
    mockGetOfferings.mockResolvedValue({
      current: {
        availablePackages: [
          { packageType: "ANNUAL", product: { priceString: "$29.99", price: 29.99 } },
          { packageType: "LIFETIME", product: { priceString: "$49.99", price: 49.99 } },
          { packageType: "MONTHLY", product: { priceString: "$9.99", price: 9.99 } },
        ],
      },
    });
    await useSubscriptionStore.getState().loadOfferings();
    const prices = useSubscriptionStore.getState().planPrices;
    expect(prices.yearly).toEqual({ price: "$29.99", footnote: "$0.58 Weekly" });
    expect(prices.monthly).toEqual({ price: "$9.99", footnote: "$2.31 Weekly" });
    expect(prices.lifetime).toEqual({ price: "$49.99", footnote: "Own Pro Forever" });
  });

  it("leaves prices empty when offerings fail (never shows stale prices)", async () => {
    mockGetOfferings.mockRejectedValue(new Error("offline"));
    await useSubscriptionStore.getState().loadOfferings();
    expect(useSubscriptionStore.getState().planPrices).toEqual({});
  });
});

describe("purchase", () => {
  it("purchases the matching package, updates state, and dismisses the paywall", async () => {
    useSubscriptionStore.getState().presentPaywall("requestLimitReached");
    const pkg = { packageType: "ANNUAL", product: { priceString: "$29.99", price: 29.99 } };
    mockGetOfferings.mockResolvedValue({ current: { availablePackages: [pkg] } });
    mockPurchasePackage.mockResolvedValue({ customerInfo: customerInfo({ active: true }) });

    const success = await useSubscriptionStore.getState().purchase("yearly");

    expect(success).toBe(true);
    expect(mockPurchasePackage).toHaveBeenCalledWith(pkg);
    expect(useSubscriptionStore.getState().state.kind).toBe("activeSubscriber");
    expect(useSubscriptionStore.getState().isPaywallPresented).toBe(false);
    expect(useSubscriptionStore.getState().paywallContext).toBe("standard");
  });

  it("falls back to direct product purchase when no package matches", async () => {
    mockGetOfferings.mockResolvedValue({ current: { availablePackages: [] } });
    mockGetProducts.mockResolvedValue([{ identifier: "SportsGPT_PRO" }]);
    mockPurchaseStoreProduct.mockResolvedValue({ customerInfo: customerInfo({ active: true }) });

    const success = await useSubscriptionStore.getState().purchase("yearly");

    expect(success).toBe(true);
    expect(mockGetProducts).toHaveBeenCalledWith(["SportsGPT_PRO"]);
  });

  it("is silent on user cancellation and surfaces other errors", async () => {
    mockGetOfferings.mockResolvedValue({ current: { availablePackages: [] } });
    mockGetProducts.mockResolvedValue([{ identifier: "SportsGPT_PRO" }]);
    mockPurchaseStoreProduct.mockRejectedValue(Object.assign(new Error("cancelled"), { userCancelled: true }));
    expect(await useSubscriptionStore.getState().purchase("yearly")).toBe(false);
    expect(useSubscriptionStore.getState().subscriptionErrorMessage).toBeUndefined();

    mockPurchaseStoreProduct.mockRejectedValue(new Error("card declined"));
    expect(await useSubscriptionStore.getState().purchase("yearly")).toBe(false);
    expect(useSubscriptionStore.getState().subscriptionErrorMessage).toBe("card declined");
  });
});

describe("restorePurchases", () => {
  it("reports when nothing was restored", async () => {
    mockRestorePurchases.mockResolvedValue(customerInfo());
    expect(await useSubscriptionStore.getState().restorePurchases()).toBe(false);
    expect(useSubscriptionStore.getState().subscriptionErrorMessage).toBe(
      "No active purchases were found to restore."
    );
  });
});

describe("local free-ask copy counter", () => {
  it("counts asks for free users only", () => {
    useSubscriptionStore.getState().recordLocalAsk();
    useSubscriptionStore.getState().recordLocalAsk();
    expect(useSubscriptionStore.getState().freeRequestCount).toBe(2);
    expect(remainingFreeRequests(useSubscriptionStore.getState())).toBe(FREE_REQUEST_LIMIT - 2);

    useSubscriptionStore.setState({ state: { kind: "activeSubscriber" } });
    useSubscriptionStore.getState().recordLocalAsk();
    expect(useSubscriptionStore.getState().freeRequestCount).toBe(2);
  });
});

describe("paywall presentation", () => {
  it("tracks context through present/dismiss", () => {
    useSubscriptionStore.getState().presentPaywall("requestLimitReached");
    expect(useSubscriptionStore.getState().isPaywallPresented).toBe(true);
    expect(useSubscriptionStore.getState().paywallContext).toBe("requestLimitReached");
    useSubscriptionStore.getState().dismissPaywall();
    expect(useSubscriptionStore.getState().isPaywallPresented).toBe(false);
    expect(useSubscriptionStore.getState().paywallContext).toBe("standard");
  });
});
