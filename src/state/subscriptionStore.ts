// Port of the Swift SubscriptionStore/SubscriptionState (SportsGPTModels.swift:320-740),
// with one deliberate change from the spec: paywall prices come from RevenueCat
// offerings (live), never from hardcoded strings.

import AsyncStorage from "@react-native-async-storage/async-storage";
import Purchases, { PACKAGE_TYPE, type CustomerInfo, type PurchasesPackage } from "react-native-purchases";
import { create } from "zustand";
import { ENTITLEMENT_ID, PRODUCT_IDS } from "../api/constants";

export type PlanKind = "yearly" | "lifetime" | "monthly";

export type SubscriptionState =
  | { kind: "neverSubscribed" }
  | { kind: "activeTrial"; renewalDate?: Date }
  | { kind: "activeSubscriber"; renewalDate?: Date };

export type PaywallContext = "standard" | "requestLimitReached";

export interface PaywallFeature {
  icon: string;
  title: string;
  detail: string;
}

export interface PaywallPlan {
  kind: PlanKind;
  title: string;
  cadence: string;
  badge?: string;
  detail: string;
}

export interface PlanPrice {
  price: string;
  footnote?: string;
}

export const PAYWALL_FEATURES: PaywallFeature[] = [
  {
    icon: "chatbubbles",
    title: "Ad-free chat",
    detail: "Keep every answer focused without promotional interruptions under the conversation.",
  },
  {
    icon: "infinite",
    title: "Unlimited questions",
    detail: "Go beyond the 10 free asks so you can keep comparing books, lines, and follow-up angles.",
  },
  {
    icon: "trending-up",
    title: "Sharper betting context",
    detail: "Get the cleanest SportsGPT experience with deeper MoneyLine-backed market coverage.",
  },
  {
    icon: "flash",
    title: "Stay in flow",
    detail: "Work through more ideas without hitting the free cap right when the chat gets useful.",
  },
];

export const PAYWALL_PLANS: PaywallPlan[] = [
  {
    kind: "yearly",
    title: "Yearly",
    cadence: "per year",
    badge: "Most Popular",
    detail: "Lowest effective monthly price if SportsGPT becomes part of your regular workflow.",
  },
  {
    kind: "lifetime",
    title: "Lifetime",
    cadence: "one-time",
    badge: "Pay Once",
    detail: "One purchase, then keep Pro access without a recurring bill.",
  },
  {
    kind: "monthly",
    title: "Monthly",
    cadence: "per month",
    detail: "Best if you want flexibility or only need Pro month to month.",
  },
];

export const FREE_REQUEST_LIMIT = 10;

const STORAGE_KEYS = {
  areChatAdsEnabled: "areChatAdsEnabled",
  freeRequestCount: "freeRequestCount",
} as const;

const PACKAGE_TYPE_BY_PLAN: Record<PlanKind, string> = {
  yearly: PACKAGE_TYPE.ANNUAL,
  lifetime: PACKAGE_TYPE.LIFETIME,
  monthly: PACKAGE_TYPE.MONTHLY,
};

function shortMonthDay(date: Date): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);
}

export function isPremium(state: SubscriptionState): boolean {
  return state.kind === "activeTrial" || state.kind === "activeSubscriber";
}

export function statusTitle(state: SubscriptionState): string {
  switch (state.kind) {
    case "neverSubscribed":
      return "Free Plan";
    case "activeTrial":
      return "Trial Active";
    case "activeSubscriber":
      return "SportsGPT Pro";
  }
}

export function statusDetail(state: SubscriptionState): string {
  switch (state.kind) {
    case "neverSubscribed":
      return "Upgrade to unlock the full SportsGPT experience.";
    case "activeTrial":
      return state.renewalDate
        ? `Your free trial is active through ${shortMonthDay(state.renewalDate)}.`
        : "Your free trial is active.";
    case "activeSubscriber":
      return state.renewalDate
        ? `Your subscription is active and renews on ${shortMonthDay(state.renewalDate)}.`
        : "Your subscription is active.";
  }
}

export function ctaTitle(state: SubscriptionState): string {
  return state.kind === "neverSubscribed" ? "Upgrade" : "Manage Account";
}

export function accountBadgeTitle(state: SubscriptionState): string {
  switch (state.kind) {
    case "neverSubscribed":
      return "Free";
    case "activeTrial":
      return "Trial";
    case "activeSubscriber":
      return "Pro";
  }
}

export function planName(state: SubscriptionState): string {
  switch (state.kind) {
    case "neverSubscribed":
      return "SportsGPT Free";
    case "activeTrial":
      return "SportsGPT Pro Trial";
    case "activeSubscriber":
      return "SportsGPT Pro";
  }
}

export function billingStatus(state: SubscriptionState): string {
  switch (state.kind) {
    case "neverSubscribed":
      return "No active subscription";
    case "activeTrial":
      return "Trial in progress";
    case "activeSubscriber":
      return "Paid and active";
  }
}

export function timingLabel(state: SubscriptionState): string {
  switch (state.kind) {
    case "neverSubscribed":
      return "Next Step";
    case "activeTrial":
      return "Trial Ends";
    case "activeSubscriber":
      return "Renews";
  }
}

export function timingValue(state: SubscriptionState): string {
  switch (state.kind) {
    case "neverSubscribed":
      return "Upgrade whenever you’re ready";
    case "activeTrial":
      return state.renewalDate ? shortMonthDay(state.renewalDate) : "Trial timing will appear here";
    case "activeSubscriber":
      return state.renewalDate ? shortMonthDay(state.renewalDate) : "Renewal timing will appear here";
  }
}

export function accountSettingsDescription(state: SubscriptionState): string {
  switch (state.kind) {
    case "neverSubscribed":
      return "You’re currently on the free plan. This is where you’ll review pricing, subscription access, and account controls.";
    case "activeTrial":
      return "Your Pro trial is active. This screen is where you’ll review trial timing, conversion details, and billing information.";
    case "activeSubscriber":
      return "Your paid subscription is active. This is where renewal details, billing management, and premium-only settings live.";
  }
}

export function manageButtonTitle(state: SubscriptionState): string {
  switch (state.kind) {
    case "neverSubscribed":
      return "See Upgrade Options";
    case "activeTrial":
      return "Review Trial Details";
    case "activeSubscriber":
      return "Manage Subscription";
  }
}

export function managementNote(state: SubscriptionState): string {
  switch (state.kind) {
    case "neverSubscribed":
      return "Free users see upgrade options here.";
    case "activeTrial":
      return "Trial users can review conversion timing and billing here.";
    case "activeSubscriber":
      return "Paid users can review renewals and premium settings here.";
  }
}

function weeklyFootnote(amount: number, perWeeks: number): string {
  return `$${(amount / perWeeks).toFixed(2)} Weekly`;
}

function planPriceFromPackage(kind: PlanKind, pkg: PurchasesPackage): PlanPrice {
  const price = pkg.product.priceString;
  switch (kind) {
    case "yearly":
      return { price, footnote: weeklyFootnote(pkg.product.price, 52) };
    case "monthly":
      return { price, footnote: weeklyFootnote(pkg.product.price * 12, 52) };
    case "lifetime":
      return { price, footnote: "Own Pro Forever" };
  }
}

interface SubscriptionStore {
  state: SubscriptionState;
  isPaywallPresented: boolean;
  isAdPreferencesPresented: boolean;
  isAccountSettingsPresented: boolean;
  areChatAdsEnabled: boolean;
  paywallContext: PaywallContext;
  freeRequestCount: number;
  isSubscriptionOperationInProgress: boolean;
  subscriptionErrorMessage?: string;
  managementURL?: string;
  planPrices: Partial<Record<PlanKind, PlanPrice>>;

  hydrate: () => Promise<void>;
  refresh: () => Promise<void>;
  loadOfferings: () => Promise<void>;
  purchase: (kind: PlanKind) => Promise<boolean>;
  restorePurchases: () => Promise<boolean>;
  presentPaywall: (context?: PaywallContext) => void;
  dismissPaywall: () => void;
  presentAdPreferences: () => void;
  dismissAdPreferences: () => void;
  presentAccountSettings: () => void;
  dismissAccountSettings: () => void;
  setChatAdsEnabled: (enabled: boolean) => void;
  recordLocalAsk: () => void;
  clearSubscriptionError: () => void;
  updateFromCustomerInfo: (info: CustomerInfo) => void;
}

export const useSubscriptionStore = create<SubscriptionStore>((set, get) => ({
  state: { kind: "neverSubscribed" },
  isPaywallPresented: false,
  isAdPreferencesPresented: false,
  isAccountSettingsPresented: false,
  areChatAdsEnabled: true,
  paywallContext: "standard",
  freeRequestCount: 0,
  isSubscriptionOperationInProgress: false,
  subscriptionErrorMessage: undefined,
  managementURL: undefined,
  planPrices: {},

  hydrate: async () => {
    const [ads, count] = await Promise.all([
      AsyncStorage.getItem(STORAGE_KEYS.areChatAdsEnabled),
      AsyncStorage.getItem(STORAGE_KEYS.freeRequestCount),
    ]);
    set({
      areChatAdsEnabled: ads == null ? true : ads === "true",
      freeRequestCount: count == null ? 0 : Number(count) || 0,
    });
  },

  refresh: async () => {
    try {
      const info = await Purchases.getCustomerInfo();
      get().updateFromCustomerInfo(info);
    } catch {
      // Mirrors the Swift store: refresh failures are silent.
    }
  },

  loadOfferings: async () => {
    try {
      const offerings = await Purchases.getOfferings();
      const packages = offerings.current?.availablePackages ?? [];
      const planPrices: Partial<Record<PlanKind, PlanPrice>> = {};
      for (const plan of PAYWALL_PLANS) {
        const pkg = packages.find((p) => p.packageType === PACKAGE_TYPE_BY_PLAN[plan.kind]);
        if (pkg) {
          planPrices[plan.kind] = planPriceFromPackage(plan.kind, pkg);
        }
      }
      set({ planPrices });
    } catch {
      set({ planPrices: {} });
    }
  },

  purchase: async (kind) => {
    set({ subscriptionErrorMessage: undefined, isSubscriptionOperationInProgress: true });
    try {
      const pkg = await findPackage(kind);
      const result = pkg
        ? await Purchases.purchasePackage(pkg)
        : await purchaseDirectProduct(kind);
      get().updateFromCustomerInfo(result.customerInfo);
      const active = Boolean(result.customerInfo.entitlements.active[ENTITLEMENT_ID]);
      if (active) {
        get().dismissPaywall();
      }
      return active;
    } catch (e) {
      const err = e as { userCancelled?: boolean; message?: string };
      if (!err?.userCancelled) {
        set({ subscriptionErrorMessage: err?.message ?? "The purchase could not be completed." });
      }
      return false;
    } finally {
      set({ isSubscriptionOperationInProgress: false });
    }
  },

  restorePurchases: async () => {
    set({ subscriptionErrorMessage: undefined, isSubscriptionOperationInProgress: true });
    try {
      const info = await Purchases.restorePurchases();
      get().updateFromCustomerInfo(info);
      const active = Boolean(info.entitlements.active[ENTITLEMENT_ID]);
      if (!active) {
        set({ subscriptionErrorMessage: "No active purchases were found to restore." });
      } else {
        get().dismissPaywall();
      }
      return active;
    } catch (e) {
      const err = e as { message?: string };
      set({ subscriptionErrorMessage: err?.message ?? "Restore failed." });
      return false;
    } finally {
      set({ isSubscriptionOperationInProgress: false });
    }
  },

  presentPaywall: (context = "standard") => set({ paywallContext: context, isPaywallPresented: true }),
  dismissPaywall: () => set({ isPaywallPresented: false, paywallContext: "standard" }),
  presentAdPreferences: () => set({ isAdPreferencesPresented: true }),
  dismissAdPreferences: () => set({ isAdPreferencesPresented: false }),
  presentAccountSettings: () => set({ isAccountSettingsPresented: true }),
  dismissAccountSettings: () => set({ isAccountSettingsPresented: false }),

  setChatAdsEnabled: (enabled) => {
    set({ areChatAdsEnabled: enabled });
    void AsyncStorage.setItem(STORAGE_KEYS.areChatAdsEnabled, String(enabled));
  },

  recordLocalAsk: () => {
    if (isPremium(get().state)) {
      return;
    }
    const freeRequestCount = get().freeRequestCount + 1;
    set({ freeRequestCount });
    void AsyncStorage.setItem(STORAGE_KEYS.freeRequestCount, String(freeRequestCount));
  },

  clearSubscriptionError: () => set({ subscriptionErrorMessage: undefined }),

  updateFromCustomerInfo: (info) => {
    const entitlement = info.entitlements.active[ENTITLEMENT_ID];
    const renewalDate = entitlement?.expirationDate ? new Date(entitlement.expirationDate) : undefined;
    if (entitlement && entitlement.periodType === "TRIAL") {
      set({ state: { kind: "activeTrial", renewalDate } });
    } else if (entitlement) {
      set({ state: { kind: "activeSubscriber", renewalDate } });
    } else {
      set({ state: { kind: "neverSubscribed" }, areChatAdsEnabled: true });
      void AsyncStorage.setItem(STORAGE_KEYS.areChatAdsEnabled, "true");
    }
    set({ managementURL: info.managementURL ?? undefined });
  },
}));

async function findPackage(kind: PlanKind): Promise<PurchasesPackage | undefined> {
  try {
    const offerings = await Purchases.getOfferings();
    return offerings.current?.availablePackages.find(
      (p) => p.packageType === PACKAGE_TYPE_BY_PLAN[kind]
    );
  } catch {
    return undefined;
  }
}

async function purchaseDirectProduct(kind: PlanKind) {
  const products = await Purchases.getProducts([PRODUCT_IDS[kind]]);
  const product = products.find((p) => p.identifier === PRODUCT_IDS[kind]) ?? products[0];
  if (!product) {
    throw new Error(`SportsGPT could not load the App Store product for the ${kind} plan.`);
  }
  return Purchases.purchaseStoreProduct(product);
}

export function remainingFreeRequests(store: Pick<SubscriptionStore, "freeRequestCount">): number {
  return Math.max(0, FREE_REQUEST_LIMIT - store.freeRequestCount);
}
