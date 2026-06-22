// Port of ContentView's chat shell (ContentView.swift:35-460): dark header bar,
// chat surface, composer, and the sheet/modal mounts. The Swift error alert is
// rendered as a dismissible inline banner instead.

import { useState } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SymbolView } from "expo-symbols";

import type { SuggestedPrompt } from "../../api/types";
import { sportsbookSummary, useChatStore, type SendResult } from "../../state/chatStore";
import {
  FREE_REQUEST_LIMIT,
  isPremium,
  useSubscriptionStore,
} from "../../state/subscriptionStore";
import { palette } from "../../theme";
import PaywallSheet from "../paywall/PaywallSheet";
import AccountSettingsSheet from "../settings/AccountSettingsSheet";
import AdPreferencesSheet from "../settings/AdPreferencesSheet";
import LegalSheet from "../settings/LegalSheet";
import SportsbookFilterSheet from "../settings/SportsbookFilterSheet";
import { Composer } from "./Composer";
import ConversationDrawer from "./ConversationDrawer";
import { MessageList } from "./MessageList";
import RightSideMenu from "./RightSideMenu";

const displayFontFamily = Platform.select({ ios: "Avenir Next", default: undefined });

async function guardedSend(send: () => Promise<SendResult>): Promise<void> {
  const subscription = useSubscriptionStore.getState();
  if (!isPremium(subscription.state) && subscription.freeRequestCount >= FREE_REQUEST_LIMIT) {
    subscription.presentPaywall("requestLimitReached");
    return;
  }

  Keyboard.dismiss();
  const result = await send();
  if (result === "sent") {
    useSubscriptionStore.getState().recordLocalAsk();
  } else if (result === "limit") {
    useSubscriptionStore.getState().presentPaywall("requestLimitReached");
  }
}

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const [isFilterSheetVisible, setFilterSheetVisible] = useState(false);
  const [isMenuVisible, setMenuVisible] = useState(false);
  const [isLegalVisible, setLegalVisible] = useState(false);
  const [isDrawerVisible, setDrawerVisible] = useState(false);

  const selectedSportsbookIds = useChatStore((s) => s.selectedSportsbookIds);
  const errorMessage = useChatStore((s) => s.errorMessage);

  const handleSend = () => {
    void guardedSend(() => useChatStore.getState().sendMessage());
  };

  const handleSelectPrompt = (prompt: SuggestedPrompt) => {
    void guardedSend(() => useChatStore.getState().sendSuggestedPrompt(prompt));
  };

  const handleTitlePress = () => {
    const subscription = useSubscriptionStore.getState();
    if (!isPremium(subscription.state)) {
      subscription.presentPaywall();
    }
  };

  return (
    <View
      style={[
        styles.screen,
        { paddingTop: insets.top + 4, paddingBottom: Math.max(insets.bottom, 10) },
      ]}
    >
      <View style={styles.header}>
        <Pressable style={styles.iconButton} onPress={() => setDrawerVisible(true)} hitSlop={6}>
          <SymbolView name="sidebar.left" size={18} weight="semibold" tintColor={palette.headerText} />
        </Pressable>

        <Pressable onPress={handleTitlePress}>
          <Text style={styles.title}>SportsGPT</Text>
        </Pressable>

        <Pressable
          style={styles.iconButton}
          onPress={() => useChatStore.getState().newConversation()}
          hitSlop={6}
        >
          <SymbolView name="square.and.pencil" size={18} weight="semibold" tintColor={palette.headerText} />
        </Pressable>

        <View style={styles.headerSpacer} />

        <Pressable style={styles.filterButton} onPress={() => setFilterSheetVisible(true)}>
          <SymbolView
            name="line.3.horizontal.decrease.circle"
            size={15}
            tintColor={palette.headerText}
          />
          <Text style={styles.filterText}>{sportsbookSummary(selectedSportsbookIds)}</Text>
        </Pressable>

        <Pressable style={styles.accountButton} onPress={() => setMenuVisible((v) => !v)}>
          <SymbolView name="line.3.horizontal" size={16} weight="black" tintColor={palette.ink} />
        </Pressable>
      </View>

      {isMenuVisible ? (
        <View style={[styles.menuOverlay, { top: insets.top + 84 }]}>
          <RightSideMenu
            onClose={() => setMenuVisible(false)}
            onOpenLegal={() => setLegalVisible(true)}
          />
        </View>
      ) : null}

      <KeyboardAvoidingView
        style={styles.body}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <MessageList onSelectPrompt={handleSelectPrompt} />

        {errorMessage ? (
          <View style={styles.errorBanner}>
            <View style={styles.errorTexts}>
              <Text style={styles.errorTitle}>Something Went Wrong</Text>
              <Text style={styles.errorMessage}>{errorMessage}</Text>
            </View>

            <Pressable onPress={() => useChatStore.getState().dismissError()} hitSlop={8}>
              <Text style={styles.errorDismiss}>OK</Text>
            </Pressable>
          </View>
        ) : null}

        <Composer onSend={handleSend} />
      </KeyboardAvoidingView>

      <PaywallSheet />
      <AccountSettingsSheet />
      <AdPreferencesSheet />
      <SportsbookFilterSheet
        visible={isFilterSheetVisible}
        onClose={() => setFilterSheetVisible(false)}
      />
      <LegalSheet visible={isLegalVisible} onClose={() => setLegalVisible(false)} />
      <ConversationDrawer visible={isDrawerVisible} onClose={() => setDrawerVisible(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: palette.background,
    paddingHorizontal: 18,
    paddingBottom: 10,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 24,
    backgroundColor: palette.headerBar,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
    shadowColor: "#000000",
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  title: {
    fontFamily: displayFontFamily,
    fontSize: 24,
    fontWeight: "500",
    letterSpacing: 0.2,
    color: palette.headerText,
  },
  headerSpacer: {
    flex: 1,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.06)",
  },
  filterButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
  },
  filterText: {
    fontSize: 13,
    fontWeight: "600",
    color: palette.headerText,
  },
  accountButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.card,
  },
  menuOverlay: {
    position: "absolute",
    right: 18,
    zIndex: 2,
  },
  body: {
    flex: 1,
    gap: 14,
    marginTop: 14,
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 18,
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.border,
  },
  errorTexts: {
    flex: 1,
    gap: 2,
  },
  errorTitle: {
    fontSize: 13,
    fontWeight: "900",
    color: palette.ink,
  },
  errorMessage: {
    fontSize: 13,
    fontWeight: "500",
    color: palette.mutedInk,
  },
  errorDismiss: {
    fontSize: 14,
    fontWeight: "700",
    color: palette.ink,
  },
});
