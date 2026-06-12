// Port of the thinking phrases + ThinkingBubble (ContentView.swift:27-33, 82-88,
// 1682-1722). Cycles phrases every 1.2s while mounted (it is only mounted while
// the chat store is loading).

import { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";

import { palette } from "../../theme";

// Verbatim from ContentView.swift:27-33.
export const THINKING_PHRASES = [
  "Comparing books for the cleanest number",
  "Scanning live market context",
  "Looking for a bet worth making",
  "Ranking the sharpest available angles",
  "Turning the board into a clean answer",
];

const PHRASE_INTERVAL_MS = 1200;

function Dot({ delay, highlighted }: { delay: number; highlighted: boolean }) {
  const scale = useRef(new Animated.Value(0.72)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(scale, { toValue: 1, duration: 550, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 0.72, duration: 550, useNativeDriver: true }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [delay, scale]);

  return (
    <Animated.View
      style={[
        styles.dot,
        highlighted ? styles.dotHighlighted : styles.dotMuted,
        { transform: [{ scale }] },
      ]}
    />
  );
}

export function ThinkingIndicator() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((current) => (current + 1) % THINKING_PHRASES.length);
    }, PHRASE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);

  return (
    <View style={styles.bubble}>
      <View style={styles.dots}>
        {[0, 1, 2].map((dotIndex) => (
          <Dot key={dotIndex} delay={dotIndex * 120} highlighted={dotIndex === 1} />
        ))}
      </View>

      <Text style={styles.text}>{THINKING_PHRASES[index % THINKING_PHRASES.length]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 24,
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.border,
  },
  dots: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotHighlighted: {
    backgroundColor: palette.lime,
  },
  dotMuted: {
    backgroundColor: "rgba(20, 20, 18, 0.28)", // palette.ink at 28%
  },
  text: {
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
    color: palette.mutedInk,
  },
});
