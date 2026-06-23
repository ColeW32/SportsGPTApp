// Port of AssistantPresentationView (ContentView.swift:2155-2227). Note: like the
// Swift view, cards themselves are not rendered — only the "Supporting Data"
// header and the expanded explanation.

import { useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";

import type { AssistantPresentation } from "../../api/types";
import { palette, typography } from "../../theme";
import { MessageMarkdownText } from "./MessageMarkdownText";
import { MetricExplainerSheet, type MetricExplainerState } from "./MetricExplainerSheet";
import { RecommendationBlock } from "./RecommendationBlock";

const displayFontFamily = Platform.select({ ios: "Avenir Next", default: undefined });

interface Props {
  presentation: AssistantPresentation;
}

export function AssistantPresentationView({ presentation }: Props) {
  const [selectedMetric, setSelectedMetric] = useState<MetricExplainerState | null>(null);

  const sourceLabel = presentation.sourceLabel ?? presentation.entityMatchup;
  const lineComparisonBooks = presentation.lineComparison ? presentation.cards : [];
  const showSupportingData =
    !presentation.lineComparison &&
    (presentation.cards.length > 0 || presentation.expandedExplanation != null);

  return (
    <View style={styles.stack}>
      {sourceLabel ? <Text style={styles.eyebrow}>{sourceLabel.toUpperCase()}</Text> : null}

      {presentation.headline ? (
        <MessageMarkdownText text={presentation.headline} textStyle={styles.headline} />
      ) : null}

      {presentation.summary ? (
        <MessageMarkdownText text={presentation.summary} textStyle={styles.summary} />
      ) : null}

      {presentation.primaryPick ? (
        <RecommendationBlock
          eyebrow="Best Bet"
          recommendation={presentation.primaryPick}
          isPrimary
          onMetricTap={setSelectedMetric}
        />
      ) : null}

      {presentation.alternativePick ? (
        <RecommendationBlock
          eyebrow="Alternative"
          recommendation={presentation.alternativePick}
          isPrimary={false}
          onMetricTap={setSelectedMetric}
        />
      ) : null}

      {lineComparisonBooks.length > 0 ? (
        <View style={styles.bookList}>
          <Text style={styles.supportingHeader}>OTHER BOOKS</Text>
          {lineComparisonBooks.map((book, index) => {
            // Show each book's own line when it differs from the primary pick —
            // prop/spread comparisons span different lines (Over 2.5 vs Over 3.5),
            // so a name+odds-only row would make distinct bets look identical.
            const line =
              book.selection && book.selection !== presentation.primaryPick?.selection
                ? book.selection
                : null;
            return (
              <View key={`${book.bookmakerName ?? "book"}-${index}`} style={styles.bookRow}>
                <View style={styles.bookInfo}>
                  <Text style={styles.bookName} numberOfLines={1}>
                    {book.bookmakerName}
                    {book.sourceType ? ` · ${book.sourceType}` : ""}
                  </Text>
                  {line ? (
                    <Text style={styles.bookLine} numberOfLines={1}>
                      {line}
                    </Text>
                  ) : null}
                </View>
                {book.oddsDisplay ? <Text style={styles.bookOdds}>{book.oddsDisplay}</Text> : null}
              </View>
            );
          })}
        </View>
      ) : null}

      {showSupportingData ? <Text style={styles.supportingHeader}>SUPPORTING DATA</Text> : null}

      {presentation.expandedExplanation ? (
        <MessageMarkdownText
          text={presentation.expandedExplanation}
          textStyle={styles.expandedExplanation}
        />
      ) : null}

      <MetricExplainerSheet metric={selectedMetric} onClose={() => setSelectedMetric(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: 14,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: "900",
    color: palette.mutedInk,
  },
  headline: {
    fontFamily: displayFontFamily,
    fontSize: typography.headlineSize,
    fontWeight: "500",
    color: palette.ink,
    lineHeight: typography.headlineSize + 6,
  },
  summary: {
    fontSize: typography.bodySize,
    fontWeight: "500",
    color: palette.ink,
    lineHeight: typography.bodySize + 7,
  },
  supportingHeader: {
    fontSize: 12,
    fontWeight: "900",
    color: palette.mutedInk,
  },
  bookList: {
    gap: 8,
  },
  bookRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  bookInfo: {
    flex: 1,
    gap: 2,
  },
  bookName: {
    fontSize: 14,
    fontWeight: "500",
    color: palette.ink,
  },
  bookLine: {
    fontSize: 12,
    fontWeight: "700",
    color: palette.mutedInk,
  },
  bookOdds: {
    fontSize: 14,
    fontWeight: "900",
    color: palette.ink,
  },
  expandedExplanation: {
    fontSize: 14,
    fontWeight: "500",
    color: palette.ink,
    lineHeight: 21,
  },
});
