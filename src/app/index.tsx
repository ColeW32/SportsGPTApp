// Port of the ContentView launch gating (ContentView.swift:59-63, 400-437):
// launch screen for at least 0.85s (and until flags hydrate), then intro carousel,
// then onboarding wizard, then the chat surface.

import { useEffect, useState } from "react";

import ChatScreen from "../features/chat/ChatScreen";
import { IntroCarousel } from "../features/onboarding/IntroCarousel";
import { LaunchScreen } from "../features/onboarding/LaunchScreen";
import { OnboardingWizard } from "../features/onboarding/OnboardingWizard";
import { useAppFlags } from "../state/appFlags";
import { isPremium, useSubscriptionStore } from "../state/subscriptionStore";

const MINIMUM_LAUNCH_DURATION_MS = 850;

export default function Index() {
  const [minimumLaunchElapsed, setMinimumLaunchElapsed] = useState(false);
  const hydrated = useAppFlags((s) => s.hydrated);
  const hasSeenIntroExperience = useAppFlags((s) => s.hasSeenIntroExperience);
  const hasCompletedOnboarding = useAppFlags((s) => s.hasCompletedOnboarding);

  useEffect(() => {
    const timer = setTimeout(() => setMinimumLaunchElapsed(true), MINIMUM_LAUNCH_DURATION_MS);
    return () => clearTimeout(timer);
  }, []);

  if (!minimumLaunchElapsed || !hydrated) {
    return <LaunchScreen />;
  }

  if (!hasSeenIntroExperience) {
    return (
      <IntroCarousel onDone={() => useAppFlags.getState().setHasSeenIntroExperience(true)} />
    );
  }

  if (!hasCompletedOnboarding) {
    return (
      <OnboardingWizard
        onDone={() => {
          // Mirrors completeOnboarding (ContentView.swift:482-507).
          const flags = useAppFlags.getState();
          flags.setHasSeenIntroExperience(true);
          flags.setHasCompletedOnboarding(true);

          const subscription = useSubscriptionStore.getState();
          if (!isPremium(subscription.state)) {
            subscription.presentPaywall();
          }
        }}
      />
    );
  }

  return <ChatScreen />;
}
