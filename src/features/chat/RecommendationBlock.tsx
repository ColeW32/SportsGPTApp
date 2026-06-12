// Port of RecommendationBlockView + FlexibleFactWrap + FactPill
// (ContentView.swift:2229-2327, 2420-2524).

import { SymbolView } from "expo-symbols";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { cleanSentenceSpacing, easternEventTime } from "../../api/format";
import type { Fact, MetricKind, Recommendation } from "../../api/types";
import { palette } from "../../theme";
import { MessageMarkdownText } from "./MessageMarkdownText";
import type { MetricExplainerState } from "./MetricExplainerSheet";

const displayFontFamily = Platform.select({ ios: "Avenir Next", default: undefined });

function displayTitle(recommendation: Recommendation): string {
  const selection = recommendation.selection.trim();
  const marketLabel = recommendation.marketLabel?.trim();
  if (!marketLabel) {
    return selection;
  }
  if (selection.toLowerCase().includes(marketLabel.toLowerCase())) {
    return selection;
  }
  return cleanSentenceSpacing(`${selection} ${marketLabel}`).trim();
}

function factPillBackground(fact: Fact): string {
  switch (fact.label.toLowerCase()) {
    case "edge":
    case "ev":
    case "profit":
      return "rgba(209, 242, 79, 0.88)"; // palette.lime
    case "implied":
    case "model":
      return "rgba(247, 242, 232, 0.82)"; // palette.card
    case "odds":
      return "rgba(0, 0, 0, 0.08)";
    case "book":
    case "books":
      return "rgba(255, 255, 255, 0.5)";
    default:
      return palette.softPanel;
  }
}

function metricExplainerState(fact: Fact, allFacts: Fact[]): MetricExplainerState | null {
  if (!fact.kind) {
    return null;
  }
  const relatedValues: Partial<Record<MetricKind, string>> = {};
  for (const item of allFacts) {
    if (item.kind) {
      relatedValues[item.kind] = item.value;
    }
  }
  return { kind: fact.kind, value: fact.value, relatedValues };
}

function FactPill({
  fact,
  allFacts,
  onMetricTap,
}: {
  fact: Fact;
  allFacts: Fact[];
  onMetricTap: (metric: MetricExplainerState) => void;
}) {
  const metric = metricExplainerState(fact, allFacts);
  const content = (
    <View
      style={[
        styles.pill,
        { backgroundColor: factPillBackground(fact) },
        metric ? styles.pillInteractive : null,
      ]}
    >
      <View style={styles.pillTexts}>
        <Text style={styles.pillLabel}>{fact.label}</Text>
        <Text style={styles.pillValue}>{fact.value}</Text>
      </View>

      {metric ? (
        <SymbolView
          name="info.circle.fill"
          size={12}
          tintColor="rgba(20, 20, 18, 0.72)"
          style={styles.pillIcon}
        />
      ) : null}
    </View>
  );

  if (!metric) {
    return content;
  }
  return <Pressable onPress={() => onMetricTap(metric)}>{content}</Pressable>;
}

function chunkedFacts(facts: Fact[]): Fact[][] {
  const rows: Fact[][] = [];
  for (let start = 0; start < facts.length; start += 2) {
    rows.push(facts.slice(start, start + 2));
  }
  return rows;
}

interface Props {
  eyebrow: string;
  recommendation: Recommendation;
  isPrimary: boolean;
  onMetricTap: (metric: MetricExplainerState) => void;
}

export function RecommendationBlock({ eyebrow, recommendation, isPrimary, onMetricTap }: Props) {
  const startTimeLine = recommendation.eventStartTime
    ? easternEventTime(recommendation.eventStartTime)
    : undefined;
  const marketOddsLine = recommendation.oddsDisplay?.trim() || undefined;

  return (
    <View style={[styles.block, isPrimary ? styles.blockPrimary : styles.blockSecondary]}>
      <Text style={styles.eyebrow}>{eyebrow.toUpperCase()}</Text>

      <MessageMarkdownText
        text={displayTitle(recommendation)}
        textStyle={[styles.title, { fontSize: isPrimary ? 20 : 17 }]}
      />

      {recommendation.contextLabel ? (
        <MessageMarkdownText text={recommendation.contextLabel} textStyle={styles.detailText} />
      ) : null}

      {startTimeLine ? (
        <MessageMarkdownText text={startTimeLine} textStyle={styles.detailText} />
      ) : null}

      {marketOddsLine ? (
        <MessageMarkdownText text={marketOddsLine} textStyle={styles.oddsText} />
      ) : null}

      {recommendation.facts.length > 0 ? (
        <View style={styles.factRows}>
          {chunkedFacts(recommendation.facts).map((row, rowIndex) => (
            <View key={rowIndex} style={styles.factRow}>
              {row.map((fact) => (
                <FactPill
                  key={`${fact.label}-${fact.value}`}
                  fact={fact}
                  allFacts={recommendation.facts}
                  onMetricTap={onMetricTap}
                />
              ))}
            </View>
          ))}
        </View>
      ) : null}

      {recommendation.rationale ? (
        <MessageMarkdownText text={recommendation.rationale} textStyle={styles.detailText} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: 10,
    padding: 14,
    borderRadius: 20,
    borderWidth: 1,
  },
  blockPrimary: {
    backgroundColor: palette.panel,
    borderColor: "rgba(209, 242, 79, 0.45)", // palette.lime
  },
  blockSecondary: {
    backgroundColor: "rgba(247, 242, 232, 0.9)", // palette.card
    borderColor: palette.border,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: "900",
    color: palette.mutedInk,
  },
  title: {
    fontFamily: displayFontFamily,
    fontWeight: "600",
    color: palette.ink,
    lineHeight: 26,
  },
  detailText: {
    fontSize: 13,
    fontWeight: "500",
    color: palette.mutedInk,
    lineHeight: 18,
  },
  oddsText: {
    fontSize: 13,
    fontWeight: "600",
    color: palette.mutedInk,
    lineHeight: 18,
  },
  factRows: {
    gap: 8,
  },
  factRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  pill: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 22,
  },
  pillInteractive: {
    borderWidth: 1,
    borderColor: "rgba(20, 20, 18, 0.08)", // palette.ink
  },
  pillTexts: {
    gap: 2,
  },
  pillLabel: {
    fontSize: 10,
    fontWeight: "900",
    color: palette.mutedInk,
  },
  pillValue: {
    fontSize: 13,
    fontWeight: "900",
    color: palette.ink,
  },
  pillIcon: {
    marginTop: 1,
  },
});
