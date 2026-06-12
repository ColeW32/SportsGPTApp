// Port of OnboardingFlowView + OnboardingQuestionCard (ContentView.swift:3191-3523):
// five steps — Quick Start, Answer Style, rate prompt, sportsbook selection, apply filters.

import * as StoreReview from "expo-store-review";
import { type ReactNode, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SPORTSBOOKS } from "../../api/sportsbooks";
import { useChatStore } from "../../state/chatStore";
import { palette } from "../../theme";

const TOTAL_STEPS = 5;

const FIRST_QUESTION_OPTIONS = [
  "Tell me the best bet for one game",
  "Show me the best price across books",
  "Explain why a bet is actually worth taking",
];

const SECOND_QUESTION_OPTIONS = [
  "One clear bet with a short reason",
  "A best bet plus a couple good backups",
  "The safest angle if I want less risk",
];

type ReviewChoice = "rateNow" | "skip";

export function OnboardingWizard({ onDone }: { onDone: () => void }) {
  const insets = useSafeAreaInsets();
  const [currentStep, setCurrentStep] = useState(0);
  const [firstQuestionChoice, setFirstQuestionChoice] = useState<string>();
  const [secondQuestionChoice, setSecondQuestionChoice] = useState<string>();
  const [reviewChoice, setReviewChoice] = useState<ReviewChoice>();
  const [selectedSportsbookIds, setSelectedSportsbookIds] = useState<string[]>([]);

  const hasSelectedBooks = selectedSportsbookIds.length > 0;

  const advance = () => setCurrentStep((step) => Math.min(TOTAL_STEPS - 1, step + 1));
  const goBack = () => setCurrentStep((step) => Math.max(0, step - 1));

  const toggleBook = (id: string) => {
    setSelectedSportsbookIds((ids) =>
      ids.includes(id) ? ids.filter((existing) => existing !== id) : [...ids, id]
    );
  };

  const complete = (shouldApplySportsbooks: boolean) => {
    // Mirrors completeOnboarding (ContentView.swift:482-507): apply the picked books
    // (or clear them), which also reloads suggested prompts via the chat store.
    useChatStore
      .getState()
      .setSelectedSportsbookIds(shouldApplySportsbooks ? selectedSportsbookIds : []);
    onDone();
  };

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return (
          <QuestionCard
            eyebrow="Quick Start"
            title="What do you want SportsGPT to help with first?"
            detail="This helps SportsGPT feel immediately useful when you ask your first real betting question."
          >
            {FIRST_QUESTION_OPTIONS.map((option) => (
              <ChoiceRow
                key={option}
                title={option}
                isSelected={firstQuestionChoice === option}
                onPress={() => {
                  setFirstQuestionChoice(option);
                  advance();
                }}
              />
            ))}
          </QuestionCard>
        );
      case 1:
        return (
          <QuestionCard
            eyebrow="Answer Style"
            title="What kind of answer would make SportsGPT feel right?"
            detail="You can always ask follow-ups. This just helps shape the kind of first answer that feels best to you."
          >
            {SECOND_QUESTION_OPTIONS.map((option) => (
              <ChoiceRow
                key={option}
                title={option}
                isSelected={secondQuestionChoice === option}
                onPress={() => {
                  setSecondQuestionChoice(option);
                  advance();
                }}
              />
            ))}
          </QuestionCard>
        );
      case 2:
        return (
          <QuestionCard
            eyebrow="Quick Favor"
            title="If SportsGPT feels promising, would you rate the app?"
            detail="Great reviews are what keep us going. This is completely optional, and you can skip it in one tap."
          >
            <ChoiceRow
              title="Rate SportsGPT"
              isSelected={reviewChoice === "rateNow"}
              onPress={() => {
                setReviewChoice("rateNow");
                void StoreReview.requestReview().catch(() => undefined);
                advance();
              }}
            />
            <ChoiceRow
              title="Skip for now"
              isSelected={reviewChoice === "skip"}
              onPress={() => {
                setReviewChoice("skip");
                advance();
              }}
            />
          </QuestionCard>
        );
      case 3:
        return (
          <QuestionCard
            eyebrow="Your Books"
            title="Which sportsbooks do you actually use?"
            detail="Pick as many as you want. SportsGPT can search across everything or start with the books you use most."
          >
            <ScrollView style={styles.booksScroll} showsVerticalScrollIndicator={false}>
              <View style={styles.booksGrid}>
                {SPORTSBOOKS.map((book) => {
                  const isSelected = selectedSportsbookIds.includes(book.id);
                  return (
                    <Pressable
                      key={book.id}
                      style={[styles.bookChip, isSelected && styles.bookChipSelected]}
                      onPress={() => toggleBook(book.id)}
                    >
                      <Text
                        style={[styles.bookChipLabel, isSelected && styles.bookChipLabelSelected]}
                      >
                        {book.name}
                      </Text>
                      {isSelected ? <Text style={styles.bookChipCheck}>✓</Text> : null}
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
            <Pressable style={styles.primaryButton} onPress={advance}>
              <Text style={styles.primaryButtonLabel}>
                {hasSelectedBooks ? "Continue" : "Continue With All Books"}
              </Text>
            </Pressable>
          </QuestionCard>
        );
      default:
        return (
          <QuestionCard
            eyebrow={hasSelectedBooks ? "Apply Filters" : "All Books"}
            title={
              hasSelectedBooks
                ? "Do you want those sportsbooks included in your filters right away?"
                : "Want SportsGPT to search the full market to start?"
            }
            detail={
              hasSelectedBooks
                ? "You can change this any time. Starting here can make the first answers feel more personal."
                : "You can start broad, see everything, and narrow your books later whenever you want."
            }
          >
            {hasSelectedBooks ? (
              <>
                {/* shouldApplySportsbooks defaults to false in OnboardingState, so "No" renders selected. */}
                <ChoiceRow
                  title="Yes, use those books as my filters"
                  isSelected={false}
                  onPress={() => complete(true)}
                />
                <ChoiceRow
                  title="No, search across everything"
                  isSelected
                  onPress={() => complete(false)}
                />
              </>
            ) : (
              <>
                <ChoiceRow
                  title="Yes, start with every sportsbook"
                  isSelected
                  onPress={() => complete(false)}
                />
                <ChoiceRow
                  title="Let me go back and pick books"
                  isSelected={false}
                  onPress={() => setCurrentStep(3)}
                />
              </>
            )}
          </QuestionCard>
        );
    }
  };

  return (
    <View
      style={[
        styles.container,
        { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 28 },
      ]}
    >
      <View style={styles.headerRow}>
        <Pressable
          style={styles.backButton}
          onPress={goBack}
          disabled={currentStep === 0}
        >
          <Text style={[styles.backChevron, currentStep === 0 && styles.backChevronDisabled]}>
            ‹
          </Text>
        </Pressable>
        <Text style={styles.wordmark}>SportsGPT</Text>
      </View>

      <View style={styles.progressBlock}>
        <Text style={styles.stepLabel}>{`STEP ${currentStep + 1} OF ${TOTAL_STEPS}`}</Text>
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              { width: `${((currentStep + 1) / TOTAL_STEPS) * 100}%` },
            ]}
          />
        </View>
      </View>

      {renderStep()}
    </View>
  );
}

function QuestionCard({
  eyebrow,
  title,
  detail,
  children,
}: {
  eyebrow: string;
  title: string;
  detail: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardEyebrow}>{eyebrow.toUpperCase()}</Text>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.cardDetail}>{detail}</Text>
      </View>
      <View style={styles.cardContent}>{children}</View>
    </View>
  );
}

function ChoiceRow({
  title,
  isSelected,
  onPress,
}: {
  title: string;
  isSelected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.choiceRow, isSelected ? styles.choiceRowSelected : styles.choiceRowUnselected]}
      onPress={onPress}
    >
      <Text style={styles.choiceLabel}>{title}</Text>
      <Text style={styles.choiceArrow}>→</Text>
    </Pressable>
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
    justifyContent: "space-between",
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: palette.card,
    alignItems: "center",
    justifyContent: "center",
  },
  backChevron: {
    fontSize: 22,
    fontWeight: "900",
    color: palette.ink,
    marginTop: -2,
  },
  backChevronDisabled: {
    color: "rgba(87, 82, 71, 0.35)",
  },
  wordmark: {
    fontSize: 22,
    fontWeight: "500",
    color: palette.ink,
  },
  progressBlock: {
    gap: 10,
  },
  stepLabel: {
    fontSize: 12,
    fontWeight: "900",
    color: palette.mutedInk,
  },
  progressTrack: {
    height: 10,
    borderRadius: 5,
    backgroundColor: palette.softPanel,
    overflow: "hidden",
  },
  progressFill: {
    height: 10,
    borderRadius: 5,
    backgroundColor: palette.lime,
  },
  card: {
    backgroundColor: palette.card,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 22,
    gap: 22,
    shadowColor: "#000000",
    shadowOpacity: 0.08,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6,
  },
  cardHeader: {
    gap: 10,
  },
  cardEyebrow: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.8,
    color: palette.mutedInk,
  },
  cardTitle: {
    fontSize: 31,
    fontWeight: "700",
    color: palette.ink,
  },
  cardDetail: {
    fontSize: 16,
    fontWeight: "500",
    lineHeight: 22,
    color: palette.mutedInk,
  },
  cardContent: {
    gap: 12,
  },
  choiceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 17,
  },
  choiceRowSelected: {
    backgroundColor: palette.lime,
  },
  choiceRowUnselected: {
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.border,
  },
  choiceLabel: {
    flex: 1,
    fontSize: 18,
    fontWeight: "600",
    color: palette.ink,
  },
  choiceArrow: {
    fontSize: 13,
    fontWeight: "900",
    color: "rgba(20, 20, 18, 0.7)",
  },
  booksScroll: {
    maxHeight: 320,
  },
  booksGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    paddingTop: 4,
  },
  bookChip: {
    flexGrow: 1,
    flexBasis: "45%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
    borderRadius: 16,
    backgroundColor: palette.headerBar,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  bookChipSelected: {
    backgroundColor: palette.lime,
  },
  bookChipLabel: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: "700",
    color: palette.headerText,
  },
  bookChipLabelSelected: {
    color: palette.ink,
  },
  bookChipCheck: {
    fontSize: 11,
    fontWeight: "900",
    color: palette.ink,
  },
  primaryButton: {
    marginTop: 8,
    borderRadius: 18,
    backgroundColor: palette.lime,
    paddingVertical: 15,
    alignItems: "center",
  },
  primaryButtonLabel: {
    fontSize: 15,
    fontWeight: "900",
    color: palette.ink,
  },
});
