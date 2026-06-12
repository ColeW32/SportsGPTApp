// Port of AdPreferencesView (ContentView.swift:1273-1329). Presented as a sheet bound to
// the subscription store. Swift only ever shows this view to users with canManageAds
// (active subscribers — SportsGPTModels.swift:689-694); here the toggle is additionally
// disabled (with a note) for non-subscribers in case the sheet is reachable.

import { Modal, Pressable, StyleSheet, Switch, Text, View } from "react-native";

import { palette } from "../../theme";
import { useSubscriptionStore } from "../../state/subscriptionStore";

export default function AdPreferencesSheet() {
  const isPresented = useSubscriptionStore((s) => s.isAdPreferencesPresented);
  const dismissAdPreferences = useSubscriptionStore((s) => s.dismissAdPreferences);
  const areChatAdsEnabled = useSubscriptionStore((s) => s.areChatAdsEnabled);
  const setChatAdsEnabled = useSubscriptionStore((s) => s.setChatAdsEnabled);
  const state = useSubscriptionStore((s) => s.state);

  // Mirrors SubscriptionStore.canManageAds: only active subscribers can toggle ads.
  const canManageAds = state.kind === "activeSubscriber";

  return (
    <Modal
      visible={isPresented}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={dismissAdPreferences}
    >
      <View style={styles.container}>
        <View style={styles.topBar}>
          <Pressable onPress={dismissAdPreferences} hitSlop={10} accessibilityRole="button">
            <Text style={styles.doneText}>Done</Text>
          </Pressable>
        </View>

        <View style={styles.content}>
          <View style={styles.headerBlock}>
            <Text style={styles.title}>Ad Preferences</Text>
            <Text style={styles.subtitle}>
              {"As a paid subscriber, you can choose whether SportsGPT shows chat ad cards in your conversation."}
            </Text>
          </View>

          <View style={styles.toggleCard}>
            <View style={styles.toggleTextBlock}>
              <Text style={styles.toggleTitle}>Show Ads In Chat</Text>
              <Text style={styles.toggleDetail}>
                {"Turn off promotional ad cards that appear beneath assistant replies."}
              </Text>
            </View>

            <Switch
              value={areChatAdsEnabled}
              onValueChange={setChatAdsEnabled}
              disabled={!canManageAds}
              trackColor={{ true: palette.lime }}
              accessibilityLabel="Show Ads In Chat"
            />
          </View>

          {!canManageAds ? (
            <Text style={styles.lockedNote}>
              {"Ad controls are available to active subscribers. Upgrade to SportsGPT Pro to turn off chat ad cards."}
            </Text>
          ) : null}
        </View>
      </View>
    </Modal>
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
    gap: 20,
  },
  headerBlock: {
    gap: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: "900",
    color: palette.ink,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: "500",
    color: palette.mutedInk,
    lineHeight: 20,
  },
  toggleCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    borderRadius: 20,
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.border,
  },
  toggleTextBlock: {
    flex: 1,
    gap: 4,
  },
  toggleTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: palette.ink,
  },
  toggleDetail: {
    fontSize: 13,
    fontWeight: "500",
    color: palette.mutedInk,
  },
  lockedNote: {
    fontSize: 13,
    fontWeight: "500",
    color: palette.mutedInk,
    lineHeight: 18,
  },
});
