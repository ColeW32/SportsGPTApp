import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { bootstrapFirebase } from "../api/firebase";
import { loadSportsbookLinks } from "../api/sportsbookLinks";
import { useAppFlags } from "../state/appFlags";
import { useChatStore } from "../state/chatStore";
import { useSubscriptionStore } from "../state/subscriptionStore";

export default function RootLayout() {
  useEffect(() => {
    void useAppFlags.getState().hydrate();

    const subscription = useSubscriptionStore.getState();
    void subscription.hydrate();
    void subscription.refresh();
    void subscription.loadOfferings();

    void useChatStore.getState().hydrate();
    useChatStore.getState().loadWelcomeState();
    void loadSportsbookLinks();

    // The proxy requires auth + App Check, so the prompt seed must wait for the
    // bootstrap; failures must not block the UI (chat calls surface their own errors).
    bootstrapFirebase()
      .catch(() => undefined)
      .finally(() => {
        void useChatStore.getState().loadSuggestedPrompts();
      });
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }} />
    </SafeAreaProvider>
  );
}
