// Port of the @AppStorage launch flags in ContentView.swift:13-14
// (hasSeenIntroExperience / hasCompletedOnboarding), persisted via AsyncStorage.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";

const STORAGE_KEYS = {
  hasSeenIntroExperience: "hasSeenIntroExperience",
  hasCompletedOnboarding: "hasCompletedOnboarding",
} as const;

interface AppFlagsStore {
  hydrated: boolean;
  hasSeenIntroExperience: boolean;
  hasCompletedOnboarding: boolean;

  hydrate: () => Promise<void>;
  setHasSeenIntroExperience: (value: boolean) => void;
  setHasCompletedOnboarding: (value: boolean) => void;
}

export const useAppFlags = create<AppFlagsStore>((set) => ({
  hydrated: false,
  hasSeenIntroExperience: false,
  hasCompletedOnboarding: false,

  hydrate: async () => {
    try {
      const [intro, onboarding] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.hasSeenIntroExperience),
        AsyncStorage.getItem(STORAGE_KEYS.hasCompletedOnboarding),
      ]);
      set({
        hasSeenIntroExperience: intro === "true",
        hasCompletedOnboarding: onboarding === "true",
        hydrated: true,
      });
    } catch {
      // Storage failures should not strand the app on the launch screen.
      set({ hydrated: true });
    }
  },

  setHasSeenIntroExperience: (value) => {
    set({ hasSeenIntroExperience: value });
    void AsyncStorage.setItem(STORAGE_KEYS.hasSeenIntroExperience, String(value));
  },

  setHasCompletedOnboarding: (value) => {
    set({ hasCompletedOnboarding: value });
    void AsyncStorage.setItem(STORAGE_KEYS.hasCompletedOnboarding, String(value));
  },
}));
