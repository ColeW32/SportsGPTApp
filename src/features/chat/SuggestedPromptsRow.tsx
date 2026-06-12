// Port of SuggestedPromptsRow + SuggestedPromptsLoadingRow
// (ContentView.swift:2941-3051; the loading skeleton is static, no shimmer).

import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import type { SuggestedPrompt } from "../../api/types";
import { palette } from "../../theme";

interface Props {
  prompts: SuggestedPrompt[];
  onSelect: (prompt: SuggestedPrompt) => void;
}

export function SuggestedPromptsRow({ prompts, onSelect }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.header}>Suggested</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.row}>
          {prompts.map((prompt) => (
            <Pressable key={prompt.id} style={styles.card} onPress={() => onSelect(prompt)}>
              <Text style={styles.shortLabel}>{prompt.shortLabel}</Text>
              <Text style={styles.promptText} numberOfLines={3}>
                {prompt.text}
              </Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

export function SuggestedPromptsLoadingRow() {
  return (
    <View style={styles.container}>
      <Text style={styles.header}>Suggested</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.row}>
          {[0, 1, 2].map((index) => (
            <View key={index} style={styles.skeletonCard}>
              <View style={[styles.skeletonBar, { width: 72, opacity: 0.34 }]} />
              <View style={[styles.skeletonBar, { width: 148, opacity: 0.28 }]} />
              <View style={[styles.skeletonBar, { width: 126, opacity: 0.22 }]} />
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 10,
  },
  header: {
    fontSize: 12,
    fontWeight: "900",
    color: palette.mutedInk,
  },
  row: {
    flexDirection: "row",
    gap: 10,
    paddingVertical: 2,
  },
  card: {
    width: 196,
    height: 92,
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 20,
    backgroundColor: palette.panel,
    borderWidth: 1,
    borderColor: palette.border,
  },
  shortLabel: {
    fontSize: 13,
    fontWeight: "900",
    color: palette.ink,
  },
  promptText: {
    fontSize: 12,
    fontWeight: "500",
    color: palette.mutedInk,
  },
  skeletonCard: {
    width: 196,
    height: 84,
    gap: 8,
    paddingHorizontal: 14,
    justifyContent: "center",
    borderRadius: 20,
    backgroundColor: palette.panel,
  },
  skeletonBar: {
    height: 12,
    borderRadius: 7,
    backgroundColor: "#FFFFFF",
  },
});
