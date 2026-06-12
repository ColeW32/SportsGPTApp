// Port of AccountSettingsView (ContentView.swift:1331-1533), presented as a
// full-screen cover (ContentView.swift:113-115). Adds the Legal row (copy from
// RightSideMenu, ContentView.swift:619-648) and a Restore Purchases action per the
// RN port contract; manage-subscription opens managementURL like
// SubscriptionStore.openManageSubscriptions (SportsGPTModels.swift:681-687).

import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  accountBadgeTitle,
  accountSettingsDescription,
  billingStatus,
  manageButtonTitle,
  managementNote,
  planName,
  statusDetail,
  statusTitle,
  timingLabel,
  timingValue,
  useSubscriptionStore,
} from "../../state/subscriptionStore";
import { palette } from "../../theme";
import LegalSheet from "./LegalSheet";

const APPLE_SUBSCRIPTIONS_URL = "https://apps.apple.com/account/subscriptions";

export default function AccountSettingsSheet() {
  const insets = useSafeAreaInsets();
  const isPresented = useSubscriptionStore((s) => s.isAccountSettingsPresented);
  const dismissAccountSettings = useSubscriptionStore((s) => s.dismissAccountSettings);
  const state = useSubscriptionStore((s) => s.state);
  const areChatAdsEnabled = useSubscriptionStore((s) => s.areChatAdsEnabled);
  const managementURL = useSubscriptionStore((s) => s.managementURL);
  const isOperationInProgress = useSubscriptionStore((s) => s.isSubscriptionOperationInProgress);
  const subscriptionErrorMessage = useSubscriptionStore((s) => s.subscriptionErrorMessage);
  const isPaywallPresented = useSubscriptionStore((s) => s.isPaywallPresented);
  const [isLegalVisible, setLegalVisible] = useState(false);

  // Mirrors SubscriptionStore.canManageAds (SportsGPTModels.swift:689-694).
  const canManageAds = state.kind === "activeSubscriber";

  useEffect(() => {
    if (isPresented && !isPaywallPresented && subscriptionErrorMessage) {
      Alert.alert("Subscription Issue", subscriptionErrorMessage, [
        { text: "OK", onPress: () => useSubscriptionStore.getState().clearSubscriptionError() },
      ]);
    }
  }, [isPresented, isPaywallPresented, subscriptionErrorMessage]);

  const handleAccountAction = () => {
    if (state.kind === "neverSubscribed") {
      dismissAccountSettings();
      useSubscriptionStore.getState().presentPaywall();
    } else {
      void Linking.openURL(managementURL ?? APPLE_SUBSCRIPTIONS_URL);
    }
  };

  const handleAdPreferences = () => {
    dismissAccountSettings();
    useSubscriptionStore.getState().presentAdPreferences();
  };

  return (
    <Modal
      visible={isPresented}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={dismissAccountSettings}
    >
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.topBar}>
          <Pressable onPress={dismissAccountSettings} hitSlop={10} accessibilityRole="button">
            <Text style={styles.doneText}>Done</Text>
          </Pressable>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          <View style={styles.headerBlock}>
            <Text style={styles.title}>Account Settings</Text>
            <Text style={styles.subtitle}>
              {"Manage your SportsGPT account, subscription, and premium controls from one place."}
            </Text>
          </View>

          <View style={styles.card}>
            <View style={styles.statusHeaderRow}>
              <Text style={styles.cardLabel}>CURRENT STATUS</Text>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{accountBadgeTitle(state)}</Text>
              </View>
            </View>

            <Text style={styles.statusTitle}>{statusTitle(state)}</Text>
            <Text style={styles.statusDetail}>{statusDetail(state)}</Text>
            <Text style={styles.statusDescription}>{accountSettingsDescription(state)}</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardLabel}>SUBSCRIPTION SETTINGS</Text>

            <SettingsRow title="Plan" value={planName(state)} />
            <SettingsRow title="Billing" value={billingStatus(state)} />
            <SettingsRow title={timingLabel(state)} value={timingValue(state)} />
            <SettingsRow title="Subscription Access" value={managementNote(state)} />

            <Pressable
              style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
              onPress={handleAccountAction}
              accessibilityRole="button"
            >
              <Text style={styles.primaryButtonText}>{manageButtonTitle(state)}</Text>
              <Text style={styles.primaryButtonArrow}>→</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.restoreButton, pressed && styles.pressed]}
              onPress={() => void useSubscriptionStore.getState().restorePurchases()}
              disabled={isOperationInProgress}
              accessibilityRole="button"
            >
              {isOperationInProgress ? (
                <ActivityIndicator size="small" color={palette.ink} />
              ) : null}
              <Text style={styles.restoreButtonText}>
                {isOperationInProgress ? "Working..." : "Restore Purchases"}
              </Text>
            </Pressable>
          </View>

          {canManageAds ? (
            <View style={styles.card}>
              <Text style={styles.cardLabel}>PREMIUM CONTROLS</Text>

              <Pressable
                style={({ pressed }) => [styles.rowButton, pressed && styles.pressed]}
                onPress={handleAdPreferences}
                accessibilityRole="button"
              >
                <View style={styles.rowButtonTextBlock}>
                  <Text style={styles.rowButtonTitle}>Ad Preferences</Text>
                  <Text style={styles.rowButtonDetail}>
                    {areChatAdsEnabled ? "Chat ads are currently on." : "Chat ads are currently off."}
                  </Text>
                </View>
                <Text style={styles.rowButtonChevron}>›</Text>
              </Pressable>
            </View>
          ) : null}

          <View style={styles.card}>
            <Text style={styles.cardLabel}>LEGAL</Text>

            <Pressable
              style={({ pressed }) => [styles.rowButton, pressed && styles.pressed]}
              onPress={() => setLegalVisible(true)}
              accessibilityRole="button"
            >
              <View style={styles.rowButtonTextBlock}>
                <Text style={styles.rowButtonTitle}>Terms & Privacy</Text>
                <Text style={styles.rowButtonDetail}>
                  {"Review legal terms, privacy disclosures, and responsible betting guidance."}
                </Text>
              </View>
              <Text style={styles.rowButtonChevron}>›</Text>
            </Pressable>
          </View>
        </ScrollView>

        <LegalSheet visible={isLegalVisible} onClose={() => setLegalVisible(false)} />
      </View>
    </Modal>
  );
}

function SettingsRow({ title, value }: { title: string; value: string }) {
  return (
    <View style={styles.settingsRow}>
      <Text style={styles.settingsRowTitle}>{title}</Text>
      <Text style={styles.settingsRowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.background,
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  doneText: {
    fontSize: 15,
    fontWeight: "700",
    color: palette.ink,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
    gap: 20,
  },
  headerBlock: {
    gap: 8,
  },
  title: {
    fontSize: 30,
    fontWeight: "900",
    color: palette.ink,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: "500",
    color: palette.mutedInk,
    lineHeight: 20,
  },
  card: {
    padding: 18,
    borderRadius: 22,
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.border,
    gap: 14,
  },
  cardLabel: {
    fontSize: 12,
    fontWeight: "900",
    color: palette.mutedInk,
  },
  statusHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#D1F24FD1", // lime at 0.82
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "900",
    color: palette.ink,
  },
  statusTitle: {
    fontSize: 22,
    fontWeight: "900",
    color: palette.ink,
  },
  statusDetail: {
    fontSize: 14,
    fontWeight: "500",
    color: palette.mutedInk,
    lineHeight: 20,
  },
  statusDescription: {
    fontSize: 13,
    fontWeight: "500",
    color: "#575247EB", // mutedInk at 0.92
    lineHeight: 18,
  },
  settingsRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  settingsRowTitle: {
    width: 108,
    fontSize: 12,
    fontWeight: "900",
    color: palette.mutedInk,
  },
  settingsRowValue: {
    flex: 1,
    fontSize: 14,
    fontWeight: "500",
    color: palette.ink,
    lineHeight: 20,
  },
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 18,
    backgroundColor: palette.lime,
  },
  primaryButtonText: {
    fontSize: 14,
    fontWeight: "900",
    color: palette.ink,
  },
  primaryButtonArrow: {
    fontSize: 14,
    fontWeight: "900",
    color: palette.ink,
  },
  restoreButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 10,
  },
  restoreButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: palette.mutedInk,
  },
  rowButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 18,
    backgroundColor: palette.panel,
  },
  rowButtonTextBlock: {
    flex: 1,
    gap: 4,
  },
  rowButtonTitle: {
    fontSize: 15,
    fontWeight: "900",
    color: palette.ink,
  },
  rowButtonDetail: {
    fontSize: 13,
    fontWeight: "500",
    color: palette.mutedInk,
  },
  rowButtonChevron: {
    fontSize: 18,
    fontWeight: "900",
    color: palette.mutedInk,
  },
  pressed: {
    opacity: 0.82,
  },
});
