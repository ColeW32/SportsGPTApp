// The one place SportsGPT asks for an App Store rating: once, after a user's third answered
// question, so they've seen what it does first. Asking during onboarding got 2.1.0 rejected
// (guideline 5.6.3); iOS also caps the prompt at three showings a year.
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as StoreReview from "expo-store-review";

export const ANSWERS_BEFORE_RATING_ASK = 3;
const ANSWERED_KEY = "answeredQuestionCount";
const ASKED_KEY = "ratingRequested";

export async function noteAnsweredQuestion(): Promise<void> {
  try {
    if ((await AsyncStorage.getItem(ASKED_KEY)) === "true") return;
    const answered = Number((await AsyncStorage.getItem(ANSWERED_KEY)) ?? "0") + 1;
    await AsyncStorage.setItem(ANSWERED_KEY, String(answered));
    if (answered < ANSWERS_BEFORE_RATING_ASK || !(await StoreReview.isAvailableAsync())) return;
    await AsyncStorage.setItem(ASKED_KEY, "true");
    await StoreReview.requestReview();
  } catch (error) {
    console.warn("[review-prompt] could not ask for a rating", error);
  }
}
