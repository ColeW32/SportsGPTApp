// Port of ChatBubble (ContentView.swift:1644-1680). Assistant messages with a
// presentation render AssistantPresentationView; everything else falls back to
// the minimal markdown renderer. Ads show under API-included assistant replies
// for non-premium users with chat ads enabled.

import { Image } from "expo-image";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import type { ChatMessage } from "../../api/types";
import { isPremium, useSubscriptionStore } from "../../state/subscriptionStore";
import { palette } from "../../theme";
import { AssistantPresentationView } from "./AssistantPresentationView";
import { MessageMarkdownText } from "./MessageMarkdownText";
import PromotionCard from "./PromotionCard";
import { SlipCheckCard } from "./SlipCheckCard";

interface Props {
  message: ChatMessage;
}

export function ChatBubble({ message }: Props) {
  const subscriptionState = useSubscriptionStore((s) => s.state);
  const areChatAdsEnabled = useSubscriptionStore((s) => s.areChatAdsEnabled);

  // The picker's copy lives in the cache iOS may clear; an old thread then just drops the thumbnail.
  const [imageMissing, setImageMissing] = useState(false);
  const isUser = message.role === "user";
  const showAd =
    !isUser && message.includeInAPIRequest && !isPremium(subscriptionState) && areChatAdsEnabled;

  return (
    <View style={[styles.container, isUser ? styles.containerUser : null]}>
      <Text style={styles.author}>{isUser ? "You" : "SportsGPT"}</Text>

      <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAssistant]}>
        {message.imageUri && !imageMissing ? (
          <Image source={{ uri: message.imageUri }} style={styles.slipImage} contentFit="cover" onError={() => setImageMissing(true)} />
        ) : null}

        {message.slipCheck && !isUser ? (
          <SlipCheckCard check={message.slipCheck} />
        ) : message.assistantPresentation && !isUser ? (
          <AssistantPresentationView presentation={message.assistantPresentation} />
        ) : (
          <MessageMarkdownText text={message.text} />
        )}

        {showAd ? (
          <PromotionCard bookmakerId={message.assistantPresentation?.primaryPick?.bookmakerId} />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
    alignItems: "flex-start",
  },
  containerUser: {
    alignItems: "flex-end",
  },
  author: {
    fontSize: 11,
    fontWeight: "900",
    color: palette.mutedInk,
  },
  bubble: {
    alignSelf: "stretch",
    gap: 12,
    padding: 14,
    borderRadius: 24,
    borderWidth: 1,
  },
  bubbleUser: {
    backgroundColor: palette.userBubble,
    borderColor: palette.userBorder,
  },
  slipImage: {
    width: 120,
    height: 180,
    borderRadius: 14,
    backgroundColor: palette.softPanel,
  },
  bubbleAssistant: {
    backgroundColor: palette.card,
    borderColor: palette.border,
  },
});
