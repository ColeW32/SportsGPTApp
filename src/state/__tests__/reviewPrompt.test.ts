jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);
jest.mock("expo-store-review", () => ({ isAvailableAsync: jest.fn(async () => true), requestReview: jest.fn(async () => undefined) }));

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as StoreReview from "expo-store-review";
import { ANSWERS_BEFORE_RATING_ASK, noteAnsweredQuestion } from "../reviewPrompt";

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
});

test("asks for a rating once, only after the third answered question", async () => {
  for (let i = 1; i < ANSWERS_BEFORE_RATING_ASK; i++) await noteAnsweredQuestion();
  expect(StoreReview.requestReview).not.toHaveBeenCalled();
  await noteAnsweredQuestion();
  expect(StoreReview.requestReview).toHaveBeenCalledTimes(1);
  await noteAnsweredQuestion();
  await noteAnsweredQuestion();
  expect(StoreReview.requestReview).toHaveBeenCalledTimes(1);
});
