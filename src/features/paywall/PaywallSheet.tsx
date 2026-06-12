// Port of PaywallView (ContentView.swift:697-1264), presented as a full-screen cover
// (ContentView.swift:105-107). Context-aware copy (Swift 786-829), plan rows (974-1068),
// and the bottom bar with the purchase CTA plus the "Not now" dismiss that only appears
// after a 5 second delay (Swift 735-740, 1212-1240). Prices come exclusively from
// planPrices (live RevenueCat offerings) — plans without an entry render with no price.

import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  FREE_REQUEST_LIMIT,
  PAYWALL_FEATURES,
  PAYWALL_PLANS,
  remainingFreeRequests,
  timingLabel,
  timingValue,
  useSubscriptionStore,
  type PaywallContext,
  type PaywallPlan,
  type PlanKind,
  type PlanPrice,
  type SubscriptionState,
} from "../../state/subscriptionStore";
import LegalSheet from "../settings/LegalSheet";
import { palette } from "../../theme";

// Text stand-ins for the SF Symbols used by the Swift paywall feature list
// (PAYWALL_FEATURES carries Ionicons-style names; the project bundles no icon font).
const FEATURE_GLYPHS: Record<string, string> = {
  chatbubbles: "💬",
  infinite: "∞",
  "trending-up": "↗",
  flash: "⚡",
};

function heroHighlights(state: SubscriptionState): string[] {
  switch (state.kind) {
    case "neverSubscribed":
      return [
        "Unlimited questions once you upgrade",
        "Cleaner chat without promo cards",
        "Sharper MoneyLine-backed market context",
      ];
    case "activeTrial":
      return [
        "Unlimited questions are already unlocked",
        "The ad-free experience is active",
        "You can manage billing details from your account",
      ];
    case "activeSubscriber":
      return [
        "Your premium access is already live",
        "Unlimited questions stay unlocked",
        "Premium settings live in Account Settings",
      ];
  }
}

function paywallEyebrow(state: SubscriptionState, context: PaywallContext): string {
  if (context === "requestLimitReached") {
    return "Free Limit Reached";
  }
  switch (state.kind) {
    case "neverSubscribed":
      return "SportsGPT Pro";
    case "activeTrial":
      return "Trial Active";
    case "activeSubscriber":
      return "Pro Active";
  }
}

function paywallTitle(state: SubscriptionState, context: PaywallContext): string {
  if (context === "requestLimitReached") {
    return "You’ve used all 10 free asks";
  }
  switch (state.kind) {
    case "neverSubscribed":
      return "Unlock SportsGPT Pro";
    case "activeTrial":
      return "Your Pro trial is active";
    case "activeSubscriber":
      return "You already have Pro";
  }
}

function paywallDescription(state: SubscriptionState, context: PaywallContext): string {
  if (context === "requestLimitReached") {
    return "You used your free starter access. Pick a plan to keep the chat open, remove the ad cards, and keep working through betting questions without the cap.";
  }
  switch (state.kind) {
    case "neverSubscribed":
      return "Go beyond the free starter experience with unlimited questions, cleaner chat, and the strongest version of the SportsGPT workflow.";
    case "activeTrial":
      return "You already have premium access right now. Use this view to understand what Pro includes and manage what happens next.";
    case "activeSubscriber":
      return "Your premium access is active. Keep using Pro and jump into Account Settings whenever you want to manage details.";
  }
}

function benefitsTitle(state: SubscriptionState): string {
  switch (state.kind) {
    case "neverSubscribed":
      return "What Pro unlocks";
    case "activeTrial":
      return "What stays unlocked during your trial";
    case "activeSubscriber":
      return "Included with Pro";
  }
}

function planWithPrice(plan: PaywallPlan, price: PlanPrice | undefined): string {
  return price ? `${plan.title} • ${price.price}` : plan.title;
}

export default function PaywallSheet() {
  const insets = useSafeAreaInsets();
  const isPaywallPresented = useSubscriptionStore((s) => s.isPaywallPresented);
  const paywallContext = useSubscriptionStore((s) => s.paywallContext);
  const state = useSubscriptionStore((s) => s.state);
  const planPrices = useSubscriptionStore((s) => s.planPrices);
  const freeRequestCount = useSubscriptionStore((s) => s.freeRequestCount);
  const isOperationInProgress = useSubscriptionStore((s) => s.isSubscriptionOperationInProgress);
  const subscriptionErrorMessage = useSubscriptionStore((s) => s.subscriptionErrorMessage);
  const dismissPaywall = useSubscriptionStore((s) => s.dismissPaywall);

  const [selectedKind, setSelectedKind] = useState<PlanKind>("yearly");
  const [isDismissVisible, setDismissVisible] = useState(false);
  const [legalVisible, setLegalVisible] = useState(false);

  const selectedPlan = PAYWALL_PLANS.find((plan) => plan.kind === selectedKind) ?? PAYWALL_PLANS[0];
  const selectedPrice = planPrices[selectedPlan.kind];
  const shouldShowPlans = state.kind === "neverSubscribed";

  useEffect(() => {
    if (!isPaywallPresented) {
      return;
    }
    setSelectedKind("yearly");
    setDismissVisible(false);
    setLegalVisible(false);
    void useSubscriptionStore.getState().refresh();
    void useSubscriptionStore.getState().loadOfferings();
    const timer = setTimeout(() => setDismissVisible(true), 5000);
    return () => clearTimeout(timer);
  }, [isPaywallPresented]);

  useEffect(() => {
    if (isPaywallPresented && subscriptionErrorMessage) {
      Alert.alert("Subscription Issue", subscriptionErrorMessage, [
        { text: "OK", onPress: () => useSubscriptionStore.getState().clearSubscriptionError() },
      ]);
    }
  }, [isPaywallPresented, subscriptionErrorMessage]);

  const heroLeadingMetric = (): { label: string; value: string } => {
    switch (state.kind) {
      case "neverSubscribed":
        if (paywallContext === "requestLimitReached") {
          return { label: "Free asks used", value: `${FREE_REQUEST_LIMIT} / ${FREE_REQUEST_LIMIT}` };
        }
        return { label: "Free asks left", value: String(remainingFreeRequests({ freeRequestCount })) };
      case "activeTrial":
        return { label: timingLabel(state), value: timingValue(state) };
      case "activeSubscriber":
        return { label: "Status", value: "Pro active" };
    }
  };

  const heroTrailingMetric = (): { label: string; value: string } => {
    switch (state.kind) {
      case "neverSubscribed":
        return { label: "Selected plan", value: planWithPrice(selectedPlan, selectedPrice) };
      case "activeTrial":
        return { label: "Plan", value: "Pro trial" };
      case "activeSubscriber":
        return { label: timingLabel(state), value: timingValue(state) };
    }
  };

  const finePrint = (): string => {
    switch (state.kind) {
      case "neverSubscribed": {
        const parts = [`${selectedPlan.title} selected.`];
        if (selectedPrice?.footnote) {
          parts.push(selectedPrice.footnote);
        }
        if (paywallContext === "requestLimitReached") {
          parts.push("Premium removes the free cap right away.");
        }
        return parts.join(" ");
      }
      case "activeTrial":
        return "Your trial keeps premium features available now. Use Account Settings to review timing and renewal details.";
      case "activeSubscriber":
        return "Premium controls and billing details live in Account Settings.";
    }
  };

  const primaryButtonTitle = (): string => {
    if (state.kind === "neverSubscribed") {
      return paywallContext === "requestLimitReached"
        ? `Unlock With ${selectedPlan.title}`
        : `Continue With ${selectedPlan.title}`;
    }
    return "Open Account Settings";
  };

  const primaryButtonSupplement =
    state.kind === "neverSubscribed" ? planWithPrice(selectedPlan, selectedPrice) : undefined;

  const handlePrimaryAction = () => {
    if (state.kind === "neverSubscribed") {
      // The store dismisses the paywall itself once the entitlement is active.
      void useSubscriptionStore.getState().purchase(selectedKind);
    } else {
      dismissPaywall();
      setTimeout(() => useSubscriptionStore.getState().presentAccountSettings(), 250);
    }
  };

  const metricLeading = heroLeadingMetric();
  const metricTrailing = heroTrailingMetric();

  return (
    <Modal
      visible={isPaywallPresented}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={dismissPaywall}
    >
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          <View style={styles.heroCard}>
            <Text style={styles.heroEyebrow}>
              {paywallEyebrow(state, paywallContext).toUpperCase()}
            </Text>

            <View style={styles.heroTitleBlock}>
              <Text style={styles.heroTitle}>{paywallTitle(state, paywallContext)}</Text>
              <Text style={styles.heroDescription}>
                {paywallDescription(state, paywallContext)}
              </Text>
            </View>

            <View style={styles.highlightList}>
              {heroHighlights(state).map((highlight) => (
                <View key={highlight} style={styles.highlightRow}>
                  <Text style={styles.highlightCheck}>✓</Text>
                  <Text style={styles.highlightText}>{highlight}</Text>
                </View>
              ))}
            </View>

            <View style={styles.metricRow}>
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>{metricLeading.label.toUpperCase()}</Text>
                <Text style={styles.metricValue}>{metricLeading.value}</Text>
              </View>
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>{metricTrailing.label.toUpperCase()}</Text>
                <Text style={styles.metricValue}>{metricTrailing.value}</Text>
              </View>
            </View>
          </View>

          {shouldShowPlans ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Choose a plan</Text>
              <Text style={styles.sectionSubtitle}>
                {"All premium plans remove the 10-question cap and keep the chat ad-free."}
              </Text>

              <View style={styles.planList}>
                {PAYWALL_PLANS.map((plan) => {
                  const isSelected = plan.kind === selectedKind;
                  const price = planPrices[plan.kind];
                  return (
                    <Pressable
                      key={plan.kind}
                      style={[styles.planRow, isSelected && styles.planRowSelected]}
                      onPress={() => setSelectedKind(plan.kind)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: isSelected }}
                    >
                      <View style={[styles.radioOuter, isSelected && styles.radioOuterSelected]}>
                        {isSelected ? <View style={styles.radioInner} /> : null}
                      </View>

                      <View style={styles.planTextBlock}>
                        <View style={styles.planTitleRow}>
                          <Text style={styles.planTitle}>{plan.title}</Text>
                          {plan.badge ? (
                            <View style={styles.planBadge}>
                              <Text style={styles.planBadgeText}>{plan.badge}</Text>
                            </View>
                          ) : null}
                        </View>

                        <Text style={styles.planDetail}>{plan.detail}</Text>

                        {price?.footnote ? (
                          <Text style={styles.planFootnote}>{price.footnote}</Text>
                        ) : null}
                      </View>

                      <View style={styles.planPriceBlock}>
                        {price ? <Text style={styles.planPrice}>{price.price}</Text> : null}
                        <Text style={styles.planCadence}>{plan.cadence}</Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{benefitsTitle(state)}</Text>

            <View style={styles.benefitsCard}>
              {PAYWALL_FEATURES.map((feature, index) => (
                <View key={feature.title}>
                  <View style={styles.featureRow}>
                    <View style={styles.featureIconTile}>
                      <Text style={styles.featureIconGlyph}>
                        {FEATURE_GLYPHS[feature.icon] ?? "✓"}
                      </Text>
                    </View>

                    <View style={styles.featureTextBlock}>
                      <Text style={styles.featureTitle}>{feature.title}</Text>
                      <Text style={styles.featureDetail}>{feature.detail}</Text>
                    </View>
                  </View>

                  {index < PAYWALL_FEATURES.length - 1 ? <View style={styles.divider} /> : null}
                </View>
              ))}
            </View>
          </View>

          <Text style={styles.finePrint}>{finePrint()}</Text>

          <View style={styles.linksRow}>
            <Pressable onPress={() => setLegalVisible(true)} disabled={isOperationInProgress}>
              <Text style={styles.linkText}>Terms</Text>
            </Pressable>
            <Pressable onPress={() => setLegalVisible(true)} disabled={isOperationInProgress}>
              <Text style={styles.linkText}>Privacy</Text>
            </Pressable>
            <Pressable
              onPress={() => void useSubscriptionStore.getState().restorePurchases()}
              disabled={isOperationInProgress}
            >
              <Text style={styles.linkText}>Restore</Text>
            </Pressable>
          </View>
        </ScrollView>

        <View style={[styles.bottomBar, { paddingBottom: 12 + insets.bottom }]}>
          <Pressable
            style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
            onPress={handlePrimaryAction}
            disabled={isOperationInProgress}
            accessibilityRole="button"
          >
            {isOperationInProgress ? (
              <ActivityIndicator size="small" color={palette.ink} />
            ) : null}

            <Text style={styles.primaryButtonText}>
              {isOperationInProgress ? "Working..." : primaryButtonTitle()}
            </Text>

            <View style={styles.primaryButtonSpacer} />

            {primaryButtonSupplement && !isOperationInProgress ? (
              <View style={styles.supplementCapsule}>
                <Text style={styles.supplementText}>{primaryButtonSupplement}</Text>
              </View>
            ) : (
              <Text style={styles.primaryButtonArrow}>→</Text>
            )}
          </Pressable>

          <Pressable
            style={[styles.dismissButton, !isDismissVisible && styles.dismissHidden]}
            onPress={() => dismissPaywall()}
            disabled={!isDismissVisible || isOperationInProgress}
            accessibilityRole="button"
          >
            <Text style={styles.dismissText}>Not now</Text>
          </Pressable>
        </View>

        <LegalSheet visible={legalVisible} onClose={() => setLegalVisible(false)} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.background,
  },
  content: {
    padding: 20,
    paddingBottom: 24,
    gap: 18,
  },
  heroCard: {
    padding: 22,
    borderRadius: 28,
    backgroundColor: palette.headerBar,
    borderWidth: 1,
    borderColor: "#D1F24F47", // lime at 0.28
    gap: 18,
  },
  heroEyebrow: {
    fontSize: 12,
    fontWeight: "600",
    color: palette.lime,
    letterSpacing: 0.5,
  },
  heroTitleBlock: {
    gap: 10,
  },
  heroTitle: {
    fontSize: 32,
    fontWeight: "600",
    color: palette.card,
  },
  heroDescription: {
    fontSize: 15,
    color: "#F7F2E8C7", // card at 0.78
    lineHeight: 21,
  },
  highlightList: {
    gap: 10,
  },
  highlightRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  highlightCheck: {
    fontSize: 14,
    fontWeight: "600",
    color: palette.lime,
    paddingTop: 1,
  },
  highlightText: {
    flex: 1,
    fontSize: 14,
    color: "#F7F2E8EB", // card at 0.92
  },
  metricRow: {
    flexDirection: "row",
    gap: 12,
  },
  metricCard: {
    flex: 1,
    padding: 14,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.07)",
    gap: 6,
  },
  metricLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#F7F2E89E", // card at 0.62
  },
  metricValue: {
    fontSize: 17,
    fontWeight: "600",
    color: palette.card,
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: "600",
    color: palette.ink,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: palette.mutedInk,
    lineHeight: 19,
  },
  planList: {
    gap: 12,
  },
  planRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
    padding: 18,
    borderRadius: 24,
    backgroundColor: palette.panel,
    borderWidth: 1,
    borderColor: palette.border,
  },
  planRowSelected: {
    backgroundColor: palette.card,
    borderWidth: 2,
    borderColor: palette.lime,
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: palette.border,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  radioOuterSelected: {
    borderColor: palette.lime,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: palette.lime,
  },
  planTextBlock: {
    flex: 1,
    gap: 8,
  },
  planTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  planTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: palette.ink,
  },
  planBadge: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "#D1F24FD9", // lime at 0.85
  },
  planBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: palette.ink,
  },
  planDetail: {
    fontSize: 14,
    color: palette.mutedInk,
  },
  planFootnote: {
    fontSize: 13,
    fontWeight: "500",
    color: "#141412B8", // ink at 0.72
  },
  planPriceBlock: {
    alignItems: "flex-end",
    gap: 4,
  },
  planPrice: {
    fontSize: 24,
    fontWeight: "600",
    color: palette.ink,
  },
  planCadence: {
    fontSize: 12,
    fontWeight: "500",
    color: palette.mutedInk,
    textAlign: "right",
  },
  benefitsCard: {
    borderRadius: 24,
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.border,
    overflow: "hidden",
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    padding: 16,
  },
  featureIconTile: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "#D1F24FD1", // lime at 0.82
    alignItems: "center",
    justifyContent: "center",
  },
  featureIconGlyph: {
    fontSize: 14,
    fontWeight: "700",
    color: palette.ink,
  },
  featureTextBlock: {
    flex: 1,
    gap: 4,
  },
  featureTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: palette.ink,
  },
  featureDetail: {
    fontSize: 14,
    color: palette.mutedInk,
    lineHeight: 19,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: palette.border,
    marginLeft: 64,
  },
  finePrint: {
    fontSize: 12,
    color: palette.mutedInk,
    lineHeight: 17,
  },
  linksRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 18,
  },
  linkText: {
    fontSize: 13,
    fontWeight: "600",
    color: palette.mutedInk,
  },
  bottomBar: {
    paddingHorizontal: 20,
    paddingTop: 14,
    gap: 10,
    backgroundColor: palette.background,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: -8 },
    elevation: 12,
  },
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderRadius: 22,
    backgroundColor: palette.lime,
    shadowColor: palette.lime,
    shadowOpacity: 0.28,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: palette.ink,
  },
  primaryButtonSpacer: {
    flex: 1,
  },
  supplementCapsule: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "#1A1A17E0", // headerBar at 0.88
  },
  supplementText: {
    fontSize: 13,
    fontWeight: "600",
    color: palette.card,
  },
  primaryButtonArrow: {
    fontSize: 14,
    fontWeight: "700",
    color: palette.ink,
  },
  dismissButton: {
    alignItems: "center",
    paddingTop: 2,
    paddingVertical: 6,
  },
  dismissHidden: {
    opacity: 0,
  },
  dismissText: {
    fontSize: 15,
    fontWeight: "500",
    color: palette.mutedInk,
  },
  pressed: {
    opacity: 0.82,
  },
});
