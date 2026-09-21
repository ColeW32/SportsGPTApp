// In-app support chat, presented as a page sheet from Account Settings (same
// pattern as LegalSheet). Text only: screenshots need a native image picker.
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { palette } from "../../theme";
import {
  buildClientContext,
  fetchConversation,
  markConversationRead,
  sendSupportMessage,
  type SupportMessage,
} from "./api";

const POLL_MS = 10_000;
const MAX_LENGTH = 4000;
const SCREEN = "account_settings";

interface PendingMessage {
  localId: string;
  text: string;
  status: "sending" | "failed";
}

type Row =
  | { kind: "sent"; message: SupportMessage }
  | { kind: "pending"; pending: PendingMessage };

interface SupportChatProps {
  visible: boolean;
  onClose: () => void;
}

export default function SupportChat({ visible, onClose }: SupportChatProps) {
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [pending, setPending] = useState<PendingMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [isLoading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const listRef = useRef<FlatList<Row>>(null);
  const inFlight = useRef(false);
  const sendingCount = useRef(0);

  const refresh = useCallback(async (markRead: boolean) => {
    // Skip while a send is in flight so the server copy and the pending bubble never both show.
    if (inFlight.current || sendingCount.current > 0) return;
    inFlight.current = true;
    try {
      const convo = await fetchConversation();
      setMessages(convo.messages);
      setLoadError(false);
      if (markRead || convo.unread) {
        await markConversationRead();
      }
    } catch (e) {
      console.warn("[support] failed to load conversation", e);
      setLoadError(true);
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    void refresh(true);
    const timer = setInterval(() => void refresh(false), POLL_MS);
    return () => clearInterval(timer);
  }, [visible, refresh]);

  const deliver = async (item: PendingMessage) => {
    sendingCount.current += 1;
    setPending((list) =>
      list.some((p) => p.localId === item.localId)
        ? list.map((p) => (p.localId === item.localId ? { ...p, status: "sending" } : p))
        : [...list, item],
    );
    try {
      const sent = await sendSupportMessage(item.text, await buildClientContext(SCREEN));
      setMessages((list) => (list.some((m) => m.id === sent.id) ? list : [...list, sent]));
      setPending((list) => list.filter((p) => p.localId !== item.localId));
    } catch (e) {
      console.warn("[support] failed to send message", e);
      setPending((list) =>
        list.map((p) => (p.localId === item.localId ? { ...p, status: "failed" } : p)),
      );
    } finally {
      sendingCount.current -= 1;
    }
  };

  const handleSend = () => {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    void deliver({ localId: `local-${Date.now()}`, text, status: "sending" });
  };

  const rows: Row[] = [
    ...messages.map((message): Row => ({ kind: "sent", message })),
    ...pending.map((p): Row => ({ kind: "pending", pending: p })),
  ];

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.topBar}>
          <Text style={styles.title}>Contact Support</Text>
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button">
            <Text style={styles.doneText}>Done</Text>
          </Pressable>
        </View>

        {isLoading && rows.length === 0 ? (
          <View style={styles.centered}>
            <ActivityIndicator color={palette.ink} />
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={rows}
            keyExtractor={(row) => (row.kind === "sent" ? row.message.id : row.pending.localId)}
            renderItem={({ item }) => <MessageRow row={item} onRetry={deliver} />}
            contentContainerStyle={styles.listContent}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
            keyboardShouldPersistTaps="handled"
            ListHeaderComponent={
              <View style={styles.introCard}>
                <Text style={styles.introTitle}>We’re here to help</Text>
                <Text style={styles.introText}>
                  {"Questions, bugs, billing — ask here. We usually reply within a few hours."}
                </Text>
                {loadError ? (
                  <Text style={styles.errorText}>
                    {"Couldn’t load your messages. We’ll keep trying."}
                  </Text>
                ) : null}
              </View>
            }
          />
        )}

        <View style={styles.composer}>
          <TextInput
            style={styles.input}
            value={draft}
            onChangeText={setDraft}
            placeholder="Type your message"
            placeholderTextColor={palette.composerPlaceholder}
            multiline
            maxLength={MAX_LENGTH}
          />
          <Pressable
            style={({ pressed }) => [
              styles.sendButton,
              !draft.trim() && styles.sendDisabled,
              pressed && styles.pressed,
            ]}
            onPress={handleSend}
            disabled={!draft.trim()}
            accessibilityRole="button"
            accessibilityLabel="Send message"
          >
            <Text style={styles.sendText}>Send</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function MessageRow({ row, onRetry }: { row: Row; onRetry: (p: PendingMessage) => void }) {
  if (row.kind === "pending") {
    const { pending } = row;
    return (
      <View style={[styles.bubbleWrap, styles.userWrap]}>
        <View style={[styles.bubble, styles.userBubble, pending.status === "sending" && styles.sending]}>
          <Text style={styles.bubbleText}>{pending.text}</Text>
        </View>
        {pending.status === "failed" ? (
          <Pressable onPress={() => onRetry(pending)} hitSlop={8} accessibilityRole="button">
            <Text style={styles.failedText}>Not sent · Tap to retry</Text>
          </Pressable>
        ) : (
          <Text style={styles.metaText}>Sending…</Text>
        )}
      </View>
    );
  }

  const { message } = row;
  const isUser = message.sender === "user";
  return (
    <View style={[styles.bubbleWrap, isUser ? styles.userWrap : styles.supportWrap]}>
      {isUser ? null : <Text style={styles.senderLabel}>SportsGPT Support</Text>}
      <View style={[styles.bubble, isUser ? styles.userBubble : styles.supportBubble]}>
        <Text style={styles.bubbleText}>{message.text}</Text>
      </View>
      <Text style={styles.metaText}>{formatTime(message.createdAt)}</Text>
    </View>
  );
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.background },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  title: { fontSize: 22, fontWeight: "900", color: palette.ink },
  doneText: { fontSize: 15, fontWeight: "700", color: palette.ink },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  listContent: { padding: 20, gap: 14 },
  introCard: {
    padding: 18,
    borderRadius: 22,
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.border,
    gap: 6,
    marginBottom: 6,
  },
  introTitle: { fontSize: 15, fontWeight: "900", color: palette.ink },
  introText: { fontSize: 14, fontWeight: "500", color: palette.mutedInk, lineHeight: 20 },
  errorText: { fontSize: 13, fontWeight: "700", color: "#B3261E" },
  bubbleWrap: { maxWidth: "82%", gap: 4 },
  userWrap: { alignSelf: "flex-end", alignItems: "flex-end" },
  supportWrap: { alignSelf: "flex-start", alignItems: "flex-start" },
  senderLabel: { fontSize: 11, fontWeight: "900", color: palette.mutedInk },
  bubble: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18, borderWidth: 1 },
  userBubble: { backgroundColor: palette.userBubble, borderColor: palette.userBorder },
  supportBubble: { backgroundColor: palette.card, borderColor: palette.border },
  sending: { opacity: 0.6 },
  bubbleText: { fontSize: 15, fontWeight: "500", color: palette.ink, lineHeight: 21 },
  metaText: { fontSize: 11, fontWeight: "500", color: palette.mutedInk },
  failedText: { fontSize: 12, fontWeight: "700", color: "#B3261E" },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 28,
    borderTopWidth: 1,
    borderTopColor: palette.border,
  },
  input: {
    flex: 1,
    maxHeight: 120,
    minHeight: 40,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
    borderRadius: 20,
    backgroundColor: palette.ink,
    color: palette.composerText,
    fontSize: 16,
    fontWeight: "500",
  },
  sendButton: {
    height: 40,
    paddingHorizontal: 16,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.lime,
  },
  sendDisabled: { opacity: 0.45 },
  sendText: { fontSize: 14, fontWeight: "900", color: palette.ink },
  pressed: { opacity: 0.82 },
});
