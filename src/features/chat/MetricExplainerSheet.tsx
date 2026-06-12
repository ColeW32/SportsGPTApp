// Port of MetricExplainerKind + MetricInfoSheetState + MetricInfoSheet
// (ContentView.swift:2526-2886). All explainer copy is verbatim.

import { SymbolView, type SFSymbol } from "expo-symbols";
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { numericSubstring } from "../../api/format";
import type { MetricKind } from "../../api/types";
import { palette } from "../../theme";

export interface MetricExplainerState {
  kind: MetricKind;
  value: string;
  relatedValues: Partial<Record<MetricKind, string>>;
}

const displayFontFamily = Platform.select({ ios: "Avenir Next", default: undefined });

const BADGE_TITLES: Record<MetricKind, string> = {
  edge: "Market edge",
  ev: "Long-run value",
  implied: "Book's number",
  model: "SportsGPT number",
};

const TITLES: Record<MetricKind, string> = {
  edge: "Edge",
  ev: "Expected Value",
  implied: "Implied Win Chance",
  model: "Model Win Chance",
};

const ICONS: Record<MetricKind, SFSymbol> = {
  edge: "scope",
  ev: "chart.line.uptrend.xyaxis",
  implied: "building.columns.fill",
  model: "sparkles",
};

const ACCENT_COLORS: Record<MetricKind, string> = {
  edge: palette.lime,
  ev: palette.lime,
  implied: palette.softPanel,
  model: palette.headerBar,
};

function headline(metric: MetricExplainerState): string {
  switch (metric.kind) {
    case "edge": {
      const value = numericSubstring(metric.value) ?? 0;
      if (value >= 5) {
        return "This price is standing out from the market in a real way.";
      } else if (value > 0) {
        return "This line has a real edge, even if it is not a monster gap.";
      }
      return "This line is pretty close to the market.";
    }
    case "ev": {
      const value = numericSubstring(metric.value) ?? 0;
      if (value >= 8) {
        return "This is the kind of long-run value bettors stop and read twice.";
      } else if (value > 0) {
        return "This is a positive-value bet, which is exactly what you want to see.";
      }
      return "This price is not showing much long-run upside.";
    }
    case "implied":
      return "This is the sportsbook's built-in guess about the bet.";
    case "model":
      return "This is SportsGPT's own estimate for how often the bet should hit.";
  }
}

function plainEnglish(metric: MetricExplainerState): string {
  switch (metric.kind) {
    case "edge":
      return `${metric.value} means this line looks better than the broader market by about that amount. Bigger positive edge usually means the price is more interesting.`;
    case "ev":
      return `${metric.value} is the estimated long-run upside on this price. If you could replay this same kind of bet over and over, positive EV is what you would want.`;
    case "implied": {
      const model = metric.relatedValues.model;
      if (model) {
        return `${metric.value} is the book's number. If SportsGPT's model is higher than that ${model}, the price may be giving you extra room.`;
      }
      return `${metric.value} is the book's number. Think of it as the sportsbook's side of the argument.`;
    }
    case "model": {
      const implied = metric.relatedValues.implied;
      if (implied) {
        return `${metric.value} is SportsGPT's estimate. If it is higher than the book's implied number ${implied}, that can point to value.`;
      }
      return `${metric.value} is SportsGPT's estimate for how often this bet should win.`;
    }
  }
}

function whyItMatters(metric: MetricExplainerState): string {
  switch (metric.kind) {
    case "edge":
      return "Positive edge is one of the clearest signs that a line is worth a second look. It does not promise a win tonight, but it tells you the number may be too generous.";
    case "ev":
      return "EV is the fastest way to ask, “Is this price good for me over time?” Positive EV is usually the first green light serious bettors want.";
    case "implied":
      return "This helps you see what the book is charging you for. It is useful because every value conversation starts with the sportsbook's price.";
    case "model":
      return "This is the app's own view of the bet. When this runs above the book's implied number, that gap is often where value starts to show up.";
  }
}

function quickRead(metric: MetricExplainerState): string {
  switch (metric.kind) {
    case "edge":
      return "Quick read: positive is good, bigger is better, and anything above zero is at least worth checking.";
    case "ev":
      return "Quick read: positive EV means the price is working in your favor over time.";
    case "implied":
      return "Quick read: lower implied number means a longer shot, higher implied number means the book sees it as more likely.";
    case "model":
      return "Quick read: if the model number beats the implied number, SportsGPT likes the bet more than the book does.";
  }
}

function comparisonRows(metric: MetricExplainerState): [string, string][] {
  const implied = metric.relatedValues.implied;
  const model = metric.relatedValues.model;
  const rows: ([string, string] | undefined)[] = (() => {
    switch (metric.kind) {
      case "edge":
      case "ev":
        return [
          implied ? ["Book's number", implied] : undefined,
          model ? ["SportsGPT number", model] : undefined,
        ];
      case "implied":
        return [["Book's number", metric.value], model ? ["SportsGPT number", model] : undefined];
      case "model":
        return [implied ? ["Book's number", implied] : undefined, ["SportsGPT number", metric.value]];
    }
  })();
  return rows.filter((row): row is [string, string] => row != null);
}

function ExplanationCard({ title, text }: { title: string; text: string }) {
  return (
    <View style={styles.explanationCard}>
      <Text style={styles.sectionTitle}>{title.toUpperCase()}</Text>
      <Text style={styles.explanationText}>{text}</Text>
    </View>
  );
}

interface Props {
  metric: MetricExplainerState | null;
  onClose: () => void;
}

export function MetricExplainerSheet({ metric, onClose }: Props) {
  return (
    <Modal
      visible={metric != null}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      {metric ? (
        <View style={styles.container}>
          <View style={styles.toolbar}>
            <Pressable onPress={onClose} hitSlop={8}>
              <Text style={styles.doneButton}>Done</Text>
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
            <View style={[styles.heroCard, { borderColor: ACCENT_COLORS[metric.kind] }]}>
              <View style={styles.heroTopRow}>
                <View style={styles.heroIdentity}>
                  <View
                    style={[styles.heroIconCircle, { backgroundColor: ACCENT_COLORS[metric.kind] }]}
                  >
                    <SymbolView
                      name={ICONS[metric.kind]}
                      size={18}
                      tintColor={metric.kind === "model" ? palette.card : palette.ink}
                    />
                  </View>

                  <View style={styles.heroTitles}>
                    <Text style={styles.sectionTitle}>{BADGE_TITLES[metric.kind].toUpperCase()}</Text>
                    <Text style={styles.heroTitle}>{TITLES[metric.kind]}</Text>
                  </View>
                </View>

                <Text style={styles.heroValue}>{metric.value}</Text>
              </View>

              <Text style={styles.heroHeadline}>{headline(metric)}</Text>
            </View>

            {comparisonRows(metric).length > 0 ? (
              <View style={styles.comparisonSection}>
                <Text style={styles.sectionTitle}>COMPARE THE TWO VIEWS</Text>
                <View style={styles.comparisonRow}>
                  {comparisonRows(metric).map(([label, value]) => (
                    <View key={label} style={styles.comparisonCell}>
                      <Text style={styles.comparisonLabel}>{label}</Text>
                      <Text style={styles.comparisonValue}>{value}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            <ExplanationCard title="In plain English" text={plainEnglish(metric)} />
            <ExplanationCard title="Why bettors care" text={whyItMatters(metric)} />
            <ExplanationCard title="Quick read" text={quickRead(metric)} />
          </ScrollView>
        </View>
      ) : null}
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.background,
  },
  toolbar: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  doneButton: {
    fontSize: 15,
    fontWeight: "700",
    color: palette.ink,
  },
  content: {
    padding: 20,
    gap: 18,
  },
  heroCard: {
    gap: 14,
    padding: 18,
    borderRadius: 24,
    backgroundColor: palette.card,
    borderWidth: 1,
  },
  heroTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  heroIdentity: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flexShrink: 1,
  },
  heroIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  heroTitles: {
    gap: 4,
    flexShrink: 1,
  },
  heroTitle: {
    fontFamily: displayFontFamily,
    fontSize: 24,
    fontWeight: "600",
    color: palette.ink,
  },
  heroValue: {
    fontFamily: displayFontFamily,
    fontSize: 26,
    fontWeight: "600",
    color: palette.ink,
  },
  heroHeadline: {
    fontFamily: displayFontFamily,
    fontSize: 16,
    fontWeight: "500",
    color: palette.ink,
    lineHeight: 22,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "900",
    color: palette.mutedInk,
  },
  comparisonSection: {
    gap: 10,
  },
  comparisonRow: {
    flexDirection: "row",
    gap: 10,
  },
  comparisonCell: {
    flex: 1,
    gap: 6,
    padding: 14,
    borderRadius: 18,
    backgroundColor: palette.panel,
  },
  comparisonLabel: {
    fontSize: 11,
    fontWeight: "900",
    color: palette.mutedInk,
  },
  comparisonValue: {
    fontFamily: displayFontFamily,
    fontSize: 20,
    fontWeight: "600",
    color: palette.ink,
  },
  explanationCard: {
    gap: 8,
    padding: 18,
    borderRadius: 22,
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.border,
  },
  explanationText: {
    fontSize: 15,
    fontWeight: "500",
    color: palette.ink,
    lineHeight: 21,
  },
});
