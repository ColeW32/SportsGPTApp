// Slide-out history drawer: lists the last 5 conversations and lets the user
// start a new chat, switch threads, or delete one.

import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { SymbolView } from "expo-symbols";

import { recentConversations, useChatStore } from "../../state/chatStore";
import { palette } from "../../theme";

interface Props {
  visible: boolean;
  onClose: () => void;
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "Just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

export default function ConversationDrawer({ visible, onClose }: Props) {
  const conversations = useChatStore((s) => s.conversations);
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const ordered = recentConversations(conversations);

  const handleNew = () => {
    useChatStore.getState().newConversation();
    onClose();
  };
  const handleSelect = (id: string) => {
    useChatStore.getState().selectConversation(id);
    onClose();
  };
  const handleDelete = (id: string) => {
    useChatStore.getState().deleteConversation(id);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.panel} onPress={() => {}}>
          <View style={styles.headerRow}>
            <Text style={styles.headerLabel}>Conversations</Text>
            <Pressable style={styles.closeButton} onPress={onClose} hitSlop={6}>
              <SymbolView name="xmark" size={12} weight="black" tintColor={palette.headerText} />
            </Pressable>
          </View>

          <Pressable style={styles.newRow} onPress={handleNew}>
            <SymbolView name="square.and.pencil" size={16} weight="bold" tintColor={palette.ink} />
            <Text style={styles.newText}>New Chat</Text>
          </Pressable>

          <View style={styles.list}>
            {ordered.length === 0 ? (
              <Text style={styles.empty}>Your recent chats will show up here.</Text>
            ) : (
              ordered.map((c) => {
                const active = c.id === activeConversationId;
                return (
                  <Pressable
                    key={c.id}
                    style={[styles.row, active && styles.rowActive]}
                    onPress={() => handleSelect(c.id)}
                  >
                    <View style={styles.rowTexts}>
                      <Text style={styles.rowTitle} numberOfLines={1}>
                        {c.title}
                      </Text>
                      <Text style={styles.rowTime}>{relativeTime(c.updatedAt)}</Text>
                    </View>
                    <Pressable onPress={() => handleDelete(c.id)} hitSlop={8}>
                      <SymbolView name="trash" size={14} tintColor="rgba(240,235,224,0.55)" />
                    </Pressable>
                  </Pressable>
                );
              })
            )}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", flexDirection: "row" },
  panel: {
    width: 300,
    maxWidth: "82%",
    flex: 1,
    paddingTop: 64,
    paddingHorizontal: 18,
    gap: 16,
    backgroundColor: palette.headerBar,
    borderRightWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerLabel: { fontSize: 14, fontWeight: "900", color: palette.headerText },
  closeButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  newRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderRadius: 18,
    backgroundColor: palette.lime,
  },
  newText: { fontSize: 14, fontWeight: "900", color: palette.ink },
  list: { gap: 10 },
  empty: { fontSize: 13, fontWeight: "500", color: "rgba(240,235,224,0.6)", paddingHorizontal: 4 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  rowActive: { backgroundColor: "rgba(255,255,255,0.12)" },
  rowTexts: { flex: 1, gap: 4 },
  rowTitle: { fontSize: 14, fontWeight: "800", color: palette.headerText },
  rowTime: { fontSize: 12, fontWeight: "500", color: "rgba(240,235,224,0.6)" },
});
