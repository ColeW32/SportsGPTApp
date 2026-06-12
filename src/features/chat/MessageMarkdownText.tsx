// Minimal markdown renderer (port of MessageMarkdownText + RichTextBlock,
// ContentView.swift:2135-2153, 2329-2417): **bold** segments, "- " bullets,
// numbered lines, and plain paragraphs. No markdown library.

import type { ReactNode } from "react";
import { StyleSheet, Text, View, type StyleProp, type TextStyle } from "react-native";

import { palette, typography } from "../../theme";

type Fragment =
  | { kind: "paragraph"; content: string }
  | { kind: "bullet"; content: string }
  | { kind: "numbered"; marker: string; content: string }
  | { kind: "spacer" };

function parseLines(text: string): Fragment[] {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line): Fragment => {
      const trimmedLine = line.trim();

      if (trimmedLine.length === 0) {
        return { kind: "spacer" };
      }

      if (trimmedLine.startsWith("- ")) {
        return { kind: "bullet", content: trimmedLine.slice(2).trim() };
      }

      const numbered = trimmedLine.match(/^(\d+[.)])\s+(.*)$/);
      if (numbered) {
        return { kind: "numbered", marker: numbered[1], content: numbered[2] };
      }

      return { kind: "paragraph", content: trimmedLine };
    });
}

function styledSegments(raw: string): ReactNode {
  const components = raw.split("**");
  if (components.length <= 1) {
    return raw;
  }
  return components.map((component, index) =>
    index % 2 === 1 ? (
      <Text key={index} style={styles.bold}>
        {component}
      </Text>
    ) : (
      <Text key={index}>{component}</Text>
    )
  );
}

interface Props {
  text: string;
  textStyle?: StyleProp<TextStyle>;
}

export function MessageMarkdownText({ text, textStyle }: Props) {
  return (
    <View style={styles.stack}>
      {parseLines(text).map((fragment, index) => {
        switch (fragment.kind) {
          case "spacer":
            return <View key={index} style={styles.spacer} />;
          case "bullet":
            return (
              <View key={index} style={styles.row}>
                <Text style={[styles.text, textStyle]}>•</Text>
                <Text style={[styles.text, styles.rowText, textStyle]}>
                  {styledSegments(fragment.content)}
                </Text>
              </View>
            );
          case "numbered":
            return (
              <View key={index} style={styles.row}>
                <Text style={[styles.text, textStyle]}>{fragment.marker}</Text>
                <Text style={[styles.text, styles.rowText, textStyle]}>
                  {styledSegments(fragment.content)}
                </Text>
              </View>
            );
          case "paragraph":
            return (
              <Text key={index} style={[styles.text, textStyle]}>
                {styledSegments(fragment.content)}
              </Text>
            );
        }
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: 7,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  rowText: {
    flex: 1,
  },
  spacer: {
    height: 6,
  },
  text: {
    fontSize: typography.bodySize,
    fontWeight: "500",
    color: palette.ink,
    lineHeight: typography.bodySize + 6,
  },
  bold: {
    fontWeight: "700",
  },
});
