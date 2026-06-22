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

    void useSubscriptionStore.getState().hydrate();

    void useChatStore.getState().hydrate();
    useChatStore.getState().loadWelcomeState();
    void loadSportsbookLinks();

    // RevenueCat reads must wait for bootstrap: it runs Purchases.configure +
    // Purchases.logIn(firebaseUid), so refresh()/loadOfferings() before it would
    // hit an unconfigured/anonymous customer and reset premium to free. The proxy
    // also needs auth + App Check before the prompt seed. Failures must not block
    // the UI (chat calls surface their own errors).
    bootstrapFirebase()
      .then(() => {
        const subscription = useSubscriptionStore.getState();
        return Promise.all([subscription.refresh(), subscription.loadOfferings()]);
      })
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
