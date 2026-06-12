// Port of RightSideMenu (ContentView.swift:518-695): the dropdown card opened by the
// header hamburger button.

import { Pressable, StyleSheet, Text, View } from "react-native";
import { SymbolView } from "expo-symbols";

import {
  billingStatus,
  ctaTitle,
  isPremium,
  planName,
  statusDetail,
  statusTitle,
  useSubscriptionStore,
} from "../../state/subscriptionStore";
import { palette } from "../../theme";

interface Props {
  onClose: () => void;
  onOpenLegal: () => void;
}

export default function RightSideMenu({ onClose, onOpenLegal }: Props) {
  const state = useSubscriptionStore((s) => s.state);
  const areChatAdsEnabled = useSubscriptionStore((s) => s.areChatAdsEnabled);
  const canManageAds = state.kind === "activeSubscriber";

  const handleCta = () => {
    onClose();
    const subscription = useSubscriptionStore.getState();
    if (isPremium(subscription.state)) {
      subscription.presentAccountSettings();
    } else {
      subscription.presentPaywall();
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.headerLabel}>Account</Text>
        <Pressable style={styles.closeButton} onPress={onClose} hitSlop={6}>
          <SymbolView name="xmark" size={12} weight="black" tintColor={palette.headerText} />
        </Pressable>
      </View>

      <View style={styles.statusBlock}>
        <Text style={styles.statusTitle}>{statusTitle(state)}</Text>
        <Text style={styles.statusDetail}>{statusDetail(state)}</Text>
      </View>

      <View style={styles.actions}>
        <Pressable style={styles.ctaRow} onPress={handleCta}>
          <Text style={styles.ctaText}>{ctaTitle(state)}</Text>
          <SymbolView name="arrow.right" size={14} weight="black" tintColor={palette.ink} />
        </Pressable>

        <Text style={styles.eyebrow}>ACCOUNT SETTINGS</Text>

        <MenuRow
          title="Manage Account"
          subtitle={`${planName(state)} • ${billingStatus(state)}`}
          onPress={() => {
            onClose();
            useSubscriptionStore.getState().presentAccountSettings();
          }}
        />

        <MenuRow
          title="Terms & Privacy"
          subtitle="Review legal terms, privacy disclosures, and responsible betting guidance."
          onPress={() => {
            onClose();
            onOpenLegal();
          }}
        />

        {canManageAds ? (
          <MenuRow
            title="Ad Preferences"
            subtitle={areChatAdsEnabled ? "Chat ads are currently on." : "Chat ads are currently off."}
            onPress={() => {
              onClose();
              useSubscriptionStore.getState().presentAdPreferences();
            }}
          />
        ) : null}
      </View>
    </View>
  );
}

function MenuRow({ title, subtitle, onPress }: { title: string; subtitle: string; onPress: () => void }) {
  return (
    <Pressable style={styles.menuRow} onPress={onPress}>
      <View style={styles.menuTexts}>
        <Text style={styles.menuTitle}>{title}</Text>
        <Text style={styles.menuSubtitle}>{subtitle}</Text>
      </View>
      <SymbolView
        name="chevron.right"
        size={12}
        weight="black"
        tintColor="rgba(240, 235, 224, 0.72)"
        style={styles.menuChevron}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 290,
    padding: 18,
    gap: 18,
    borderRadius: 26,
    backgroundColor: palette.headerBar,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
    shadowColor: "#000000",
    shadowOpacity: 0.18,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerLabel: {
    fontSize: 14,
    fontWeight: "900",
    color: palette.headerText,
  },
  closeButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
  statusBlock: {
    gap: 8,
  },
  statusTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: palette.headerText,
  },
  statusDetail: {
    fontSize: 13,
    fontWeight: "500",
    lineHeight: 17,
    color: "rgba(240, 235, 224, 0.78)",
  },
  actions: {
    gap: 10,
  },
  ctaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderRadius: 18,
    backgroundColor: palette.lime,
  },
  ctaText: {
    fontSize: 14,
    fontWeight: "900",
    color: palette.ink,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: "900",
    color: "rgba(240, 235, 224, 0.56)",
  },
  menuRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderRadius: 18,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
  },
  menuTexts: {
    flex: 1,
    gap: 4,
  },
  menuTitle: {
    fontSize: 14,
    fontWeight: "900",
    color: palette.headerText,
  },
  menuSubtitle: {
    fontSize: 12,
    fontWeight: "500",
    color: "rgba(240, 235, 224, 0.72)",
  },
  menuChevron: {
    marginTop: 2,
  },
});
