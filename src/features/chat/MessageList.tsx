// Port of the chatSurface scroll area (ContentView.swift:215-267): suggested
// prompts (or their loading skeleton) on a fresh conversation, the message
// stream, and the thinking bubble while a reply is in flight.

import { useEffect, useRef } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

import type { SuggestedPrompt } from "../../api/types";
import {
  shouldShowSuggestedPromptLoading,
  shouldShowSuggestedPrompts,
  useChatStore,
} from "../../state/chatStore";
import { palette } from "../../theme";
import { ChatBubble } from "./ChatBubble";
import { SuggestedPromptsLoadingRow, SuggestedPromptsRow } from "./SuggestedPromptsRow";
import { ThinkingIndicator } from "./ThinkingIndicator";

interface Props {
  onSelectPrompt: (prompt: SuggestedPrompt) => void;
}

export function MessageList({ onSelectPrompt }: Props) {
  const messages = useChatStore((s) => s.messages);
  const isLoading = useChatStore((s) => s.isLoading);
  const suggestedPrompts = useChatStore((s) => s.suggestedPrompts);
  const isLoadingSuggestedPrompts = useChatStore((s) => s.isLoadingSuggestedPrompts);

  const showPrompts = shouldShowSuggestedPrompts({ messages, suggestedPrompts });
  const showPromptLoading = shouldShowSuggestedPromptLoading({
    messages,
    suggestedPrompts,
    isLoadingSuggestedPrompts,
  });

  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [messages.length, isLoading]);

  return (
    <View style={styles.surface}>
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        {showPrompts ? (
          <SuggestedPromptsRow prompts={suggestedPrompts} onSelect={onSelectPrompt} />
        ) : null}

        {showPromptLoading ? <SuggestedPromptsLoadingRow /> : null}

        {messages.map((message) => (
          <ChatBubble key={message.id} message={message} />
        ))}

        {isLoading ? <ThinkingIndicator /> : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  surface: {
    flex: 1,
    borderRadius: 30,
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.border,
    overflow: "hidden",
    shadowColor: "#000000",
    shadowOpacity: 0.08,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 18 },
  },
  content: {
    padding: 16,
    gap: 14,
  },
});
