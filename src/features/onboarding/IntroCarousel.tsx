// Port of IntroLandingView (ContentView.swift:1724-2006): three paged intro slides
// with page dots and a Continue / Start Setup CTA.

import { useRef, useState } from "react";
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { palette } from "../../theme";

interface IntroSlide {
  eyebrow: string;
  title: string;
  detail: string;
}

const SLIDES: IntroSlide[] = [
  {
    eyebrow: "Step 1",
    title: "Ask the question you already have in your head.",
    detail:
      "Type a game, team, player, or market question the same way you would ask a smart betting friend.",
  },
  {
    eyebrow: "Step 2",
    title: "Get one clean best-bet answer back.",
    detail:
      "SportsGPT turns live market data into a readable recommendation with the best book, price, and reason.",
  },
  {
    eyebrow: "Step 3",
    title: "Behind the scenes, SportsGPT does the math for you.",
    detail:
      "It is wired into real-time books, edge calculations, and live pricing so every answer starts with current market context.",
  },
];

export function IntroCarousel({ onDone }: { onDone: () => void }) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const [currentPage, setCurrentPage] = useState(0);

  const pageWidth = width - 44;
  const isLastPage = currentPage === SLIDES.length - 1;

  const handleMomentumEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const page = Math.round(event.nativeEvent.contentOffset.x / pageWidth);
    setCurrentPage(Math.max(0, Math.min(SLIDES.length - 1, page)));
  };

  const handleContinue = () => {
    if (isLastPage) {
      onDone();
      return;
    }
    const nextPage = currentPage + 1;
    setCurrentPage(nextPage);
    scrollRef.current?.scrollTo({ x: nextPage * pageWidth, animated: true });
  };

  return (
    <View
      style={[
        styles.container,
        { paddingTop: insets.top + 22, paddingBottom: insets.bottom + 28 },
      ]}
    >
      <View style={styles.headerRow}>
        <Text style={styles.wordmark}>SportsGPT</Text>
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleMomentumEnd}
        style={styles.pager}
      >
        {SLIDES.map((slide, index) => (
          <View key={slide.eyebrow} style={{ width: pageWidth }}>
            <View style={styles.slideCard}>
              <Text style={styles.eyebrow}>{slide.eyebrow.toUpperCase()}</Text>
              <Text style={styles.slideTitle}>{slide.title}</Text>
              <Text style={styles.slideDetail}>{slide.detail}</Text>
              <SlideVisual index={index} />
            </View>
          </View>
        ))}
      </ScrollView>

      <View style={styles.dotsRow}>
        {SLIDES.map((slide, index) => (
          <View
            key={slide.eyebrow}
            style={[
              styles.dot,
              index === currentPage ? styles.dotActive : styles.dotInactive,
            ]}
          />
        ))}
      </View>

      <Pressable style={styles.ctaButton} onPress={handleContinue}>
        <Text style={styles.ctaLabel}>{isLastPage ? "Start Setup" : "Continue"}</Text>
        <Text style={styles.ctaArrow}>→</Text>
      </Pressable>
    </View>
  );
}

function SlideVisual({ index }: { index: number }) {
  switch (index) {
    case 0:
      return (
        <View style={styles.visualBlock}>
          <Text style={styles.speakerLabel}>You</Text>
          <View style={styles.userBubble}>
            <Text style={styles.userBubbleText}>
              What’s the best bet for the Cowboys game tonight?
            </Text>
          </View>
        </View>
      );
    case 1:
      return (
        <View style={styles.visualBlock}>
          <Text style={styles.speakerLabel}>SportsGPT</Text>
          <View style={styles.bestBetCard}>
            <Text style={styles.bestBetEyebrow}>BEST BET</Text>
            <Text style={styles.bestBetTitle}>Dallas Cowboys Moneyline</Text>
            <Text style={styles.bestBetMatchup}>Cowboys vs. Eagles</Text>
            <Text style={styles.bestBetPrice}>+118</Text>
            <View style={styles.pillRow}>
              <FactPill label="Sportsbook" value="DraftKings" />
              <FactPill label="Why" value="Best price" />
            </View>
            <Text style={styles.bestBetNote}>
              SportsGPT found the strongest number still on the board and explained why it
              stands out.
            </Text>
          </View>
        </View>
      );
    default:
      return (
        <View style={styles.visualBlock}>
          <ProcessRow
            number="1"
            title="Live books"
            detail="SportsGPT checks current prices across books and exchanges."
          />
          <ProcessRow
            number="2"
            title="Edge math"
            detail="It weighs EV, market context, and where the best number actually lives."
          />
          <ProcessRow
            number="3"
            title="Clean answer"
            detail="You get one readable recommendation instead of raw sportsbook clutter."
          />
        </View>
      );
  }
}

function FactPill({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.factPill}>
      <Text style={styles.factPillLabel}>{label}</Text>
      <Text style={styles.factPillValue}>{value}</Text>
    </View>
  );
}

function ProcessRow({ number, title, detail }: { number: string; title: string; detail: string }) {
  return (
    <View style={styles.processRow}>
      <View style={styles.processNumberCircle}>
        <Text style={styles.processNumber}>{number}</Text>
      </View>
      <View style={styles.processBody}>
        <Text style={styles.processTitle}>{title}</Text>
        <Text style={styles.processDetail}>{detail}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.background,
    paddingHorizontal: 22,
    gap: 24,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  wordmark: {
    fontSize: 24,
    fontWeight: "500",
    color: palette.ink,
  },
  pager: {
    flex: 1,
    flexGrow: 1,
  },
  slideCard: {
    flex: 1,
    backgroundColor: palette.card,
    borderRadius: 32,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 24,
    marginBottom: 6,
    gap: 10,
    shadowColor: "#000000",
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.8,
    color: palette.mutedInk,
  },
  slideTitle: {
    fontSize: 30,
    fontWeight: "700",
    color: palette.ink,
  },
  slideDetail: {
    fontSize: 16,
    fontWeight: "500",
    lineHeight: 22,
    color: palette.mutedInk,
  },
  visualBlock: {
    marginTop: 12,
    gap: 12,
  },
  speakerLabel: {
    fontSize: 11,
    fontWeight: "900",
    color: palette.mutedInk,
  },
  userBubble: {
    backgroundColor: palette.userBubble,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: palette.userBorder,
    paddingHorizontal: 18,
    paddingVertical: 18,
  },
  userBubbleText: {
    fontSize: 21,
    fontWeight: "600",
    color: palette.ink,
  },
  bestBetCard: {
    backgroundColor: palette.panel,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(209, 242, 79, 0.45)",
    padding: 18,
    gap: 8,
  },
  bestBetEyebrow: {
    fontSize: 11,
    fontWeight: "900",
    color: palette.mutedInk,
  },
  bestBetTitle: {
    fontSize: 24,
    fontWeight: "600",
    color: palette.ink,
  },
  bestBetMatchup: {
    fontSize: 15,
    color: palette.mutedInk,
  },
  bestBetPrice: {
    fontSize: 15,
    fontWeight: "600",
    color: palette.mutedInk,
  },
  pillRow: {
    flexDirection: "row",
    gap: 8,
  },
  factPill: {
    backgroundColor: palette.softPanel,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 2,
  },
  factPillLabel: {
    fontSize: 10,
    fontWeight: "900",
    color: palette.mutedInk,
  },
  factPillValue: {
    fontSize: 12,
    fontWeight: "900",
    color: palette.ink,
  },
  bestBetNote: {
    fontSize: 14,
    lineHeight: 19,
    color: palette.mutedInk,
  },
  processRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
    backgroundColor: palette.panel,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 18,
  },
  processNumberCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: palette.lime,
    alignItems: "center",
    justifyContent: "center",
  },
  processNumber: {
    fontSize: 18,
    fontWeight: "700",
    color: palette.ink,
  },
  processBody: {
    flex: 1,
    gap: 4,
  },
  processTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: palette.ink,
  },
  processDetail: {
    fontSize: 14,
    lineHeight: 19,
    color: palette.mutedInk,
  },
  dotsRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
  dotActive: {
    width: 30,
    backgroundColor: palette.lime,
  },
  dotInactive: {
    width: 12,
    backgroundColor: palette.softPanel,
  },
  ctaButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: palette.lime,
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  ctaLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: palette.ink,
  },
  ctaArrow: {
    fontSize: 16,
    fontWeight: "600",
    color: palette.ink,
  },
});
