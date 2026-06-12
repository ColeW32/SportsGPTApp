// Port of PromotionCardView (ContentView.swift:2888-2939) — the Rebet affiliate
// promotion card shown under assistant replies.

import { Linking, Pressable, StyleSheet, Text, View } from "react-native";

import { palette } from "../../theme";

const REBET_URL = "https://mlapi.bet/track/rebet?source=d63ef966-3e38-45f3-8e3e-aff7b9f0e65d";

export default function PromotionCard() {
  return (
    <View style={styles.card}>
      <Text style={styles.eyebrow}>Recommended Place To Bet</Text>

      <Text style={styles.title}>Rebet</Text>

      <Text style={styles.promotion}>Current promotion: 100% bonus on deposit up to $100.</Text>

      <Text style={styles.detail}>
        {"With a promotion like this, even if you lose, you win. If you deposit $50, that extra bonus meaningfully cushions the downside and gives you more room to work with."}
      </Text>

      <Pressable
        style={({ pressed }) => [styles.linkButton, pressed && styles.pressed]}
        onPress={() => void Linking.openURL(REBET_URL)}
        accessibilityRole="link"
      >
        <Text style={styles.linkButtonText}>Open Rebet</Text>
        <Text style={styles.linkButtonArrow}>↗</Text>
      </Pressable>

      <Text style={styles.disclaimer}>Must be 21+ and use 1-800-GAMBLER.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 14,
    borderRadius: 20,
    backgroundColor: palette.panel,
    borderWidth: 1,
    borderColor: palette.border,
    alignSelf: "stretch",
    gap: 10,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: "900",
    color: palette.mutedInk,
  },
  title: {
    fontSize: 18,
    fontWeight: "900",
    color: palette.ink,
  },
  promotion: {
    fontSize: 14,
    fontWeight: "700",
    color: palette.ink,
  },
  detail: {
    fontSize: 13,
    fontWeight: "500",
    color: palette.mutedInk,
    lineHeight: 18,
  },
  linkButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: palette.lime,
  },
  linkButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: palette.ink,
  },
  linkButtonArrow: {
    fontSize: 11,
    fontWeight: "700",
    color: palette.ink,
  },
  pressed: {
    opacity: 0.82,
  },
  disclaimer: {
    fontSize: 11,
    fontWeight: "700",
    color: palette.mutedInk,
  },
});
