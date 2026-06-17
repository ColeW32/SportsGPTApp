// Sportsbook promotion card shown under assistant replies. Links to the
// recommended book's admin-managed link (from Juiced), falling back to Rebet.

import { Linking, Pressable, StyleSheet, Text, View } from "react-native";

import { getLinkForBook, type SportsbookLink } from "../../api/sportsbookLinks";
import { palette } from "../../theme";

export function resolvePromotionLink(bookmakerId: string | undefined): SportsbookLink {
  return getLinkForBook(bookmakerId);
}

interface Props {
  bookmakerId?: string;
}

export default function PromotionCard({ bookmakerId }: Props) {
  const link = resolvePromotionLink(bookmakerId);

  return (
    <View style={styles.card}>
      <Text style={styles.eyebrow}>Recommended Place To Bet</Text>

      <Text style={styles.title}>{link.brand}</Text>

      <Text style={styles.detail}>
        {"Place this bet with a sportsbook we trust. Must be 21+ and use 1-800-GAMBLER."}
      </Text>

      <Pressable
        style={({ pressed }) => [styles.linkButton, pressed && styles.pressed]}
        onPress={() => void Linking.openURL(link.url)}
        accessibilityRole="link"
      >
        <Text style={styles.linkButtonText}>{`Open ${link.brand}`}</Text>
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
