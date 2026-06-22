# Conversation History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give users their last 5 chat conversations as switchable, locally-persisted threads, reached via a ChatGPT-style slide-out drawer.

**Architecture:** Refactor the in-memory `chatStore` so the live `messages` buffer stays the source of truth for the active thread, backed by a persisted `conversations: Conversation[]` archive (capped at 5, AsyncStorage). A new `ConversationDrawer` overlay in `ChatScreen` lists/switches/deletes threads. Backend is untouched — threading scopes the existing "last 6 messages" context for free.

**Tech Stack:** React Native 0.81 / Expo 54, Zustand 5, AsyncStorage 2.2, expo-symbols, jest-expo.

---

## File structure

- Modify `src/state/chatStore.ts` — add `Conversation`, `conversations`, `activeConversationId`, lifecycle actions, persistence, title helper.
- Modify `src/state/__tests__/chatStore.test.ts` — add AsyncStorage mock + new-field resets; add tests for conversation lifecycle.
- Create `src/features/chat/ConversationDrawer.tsx` — slide-out overlay listing/switching/deleting threads.
- Modify `src/features/chat/ChatScreen.tsx` — hamburger (left) opens drawer, "+" starts new chat, mount drawer.
- Modify `src/app/_layout.tsx` — call `useChatStore.getState().hydrate()` on boot.

No native modules added → JS-only OTA-safe change.

---

## Task 1: chatStore data model + lifecycle (TDD)

**Files:**
- Modify: `src/state/chatStore.ts`
- Test: `src/state/__tests__/chatStore.test.ts`

### Conversation type + helpers (add near top of chatStore.ts)

```ts
export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

export const MAX_CONVERSATIONS = 5;
const CONVERSATIONS_STORAGE_KEY = "conversations";

let conversationSeq = 0;
function newConversationId(): string {
  conversationSeq += 1;
  return `conv-${Date.now()}-${conversationSeq}`;
}

export function conversationTitle(text: string): string {
  const clean = text.trim().replace(/\s+/g, " ");
  return clean.length > 40 ? `${clean.slice(0, 40)}…` : clean;
}

export function recentConversations(conversations: Conversation[]): Conversation[] {
  return [...conversations].sort((a, b) => b.updatedAt - a.updatedAt);
}
```

`Date.now()`-based ids stay unique across restarts (a module counter alone would collide with hydrated ids).

### State additions

Add to `ChatStore` interface and initial state:

```ts
conversations: Conversation[];      // initial: []
activeConversationId: string | null; // initial: null  (null = unsaved draft)

hydrate: () => Promise<void>;
newConversation: () => void;
selectConversation: (id: string) => void;
deleteConversation: (id: string) => void;
```

### Persistence helper (module-level, after imports)

```ts
function persistConversations(conversations: Conversation[]): void {
  void AsyncStorage.setItem(CONVERSATIONS_STORAGE_KEY, JSON.stringify(conversations));
}
```

Add `import AsyncStorage from "@react-native-async-storage/async-storage";` at top.

### `syncActiveConversation` (private helper inside the store, via get/set)

Mirrors the live `messages` buffer into the active conversation, bumps `updatedAt`, persists:

```ts
const syncActiveConversation = () => {
  const { activeConversationId, messages, conversations } = get();
  if (!activeConversationId) return;
  const next = conversations.map((c) =>
    c.id === activeConversationId
      ? { ...c, messages: [...messages], updatedAt: Date.now() }
      : c
  );
  set({ conversations: next });
  persistConversations(next);
};
```

Define it inside the `create` closure (e.g. as a `const` before the returned object) so actions can call it.

### `loadWelcomeState` / `newConversation`

`loadWelcomeState` keeps seeding the welcome message but now also resets the active thread to a draft:

```ts
loadWelcomeState: () =>
  set({
    messages: [
      { id: messageId(), role: "assistant", text: WELCOME_TEXT, includeInAPIRequest: false },
    ],
    activeConversationId: null,
  }),

newConversation: () => {
  get().loadWelcomeState();
  set({ input: "", errorMessage: undefined });
},
```

### `hydrate`

```ts
hydrate: async () => {
  try {
    const raw = await AsyncStorage.getItem(CONVERSATIONS_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return;
    const conversations = recentConversations(parsed as Conversation[]).slice(0, MAX_CONVERSATIONS);
    set({ conversations });
  } catch {
    // Corrupt/absent store: start with no history.
  }
},
```

Note: hydrate sets only `conversations`; the active thread stays the fresh draft from `loadWelcomeState` (spec: always start fresh on launch).

### `selectConversation` / `deleteConversation`

```ts
selectConversation: (id) => {
  const conv = get().conversations.find((c) => c.id === id);
  if (!conv) return;
  set({ messages: [...conv.messages], activeConversationId: id, input: "", errorMessage: undefined });
},

deleteConversation: (id) => {
  const next = get().conversations.filter((c) => c.id !== id);
  set({ conversations: next });
  persistConversations(next);
  if (get().activeConversationId === id) {
    get().newConversation();
  }
},
```

### `sendMessage` changes

Capture draft state, create the conversation on the first user message, and mirror on every commit. Replace the body around the optimistic add and the try/catch:

```ts
sendMessage: async () => {
  const trimmedInput = get().input.trim();
  if (!trimmedInput || get().isLoading) {
    return "noop";
  }

  const userMessage: ChatMessage = {
    id: messageId(),
    role: "user",
    text: trimmedInput,
    includeInAPIRequest: true,
  };

  const wasDraft = get().activeConversationId === null;

  set({
    errorMessage: undefined,
    input: "",
    messages: [...get().messages, userMessage],
    isLoading: true,
  });

  if (wasDraft) {
    const now = Date.now();
    const conversation: Conversation = {
      id: newConversationId(),
      title: conversationTitle(trimmedInput),
      messages: [...get().messages],
      createdAt: now,
      updatedAt: now,
    };
    const conversations = recentConversations([conversation, ...get().conversations]).slice(0, MAX_CONVERSATIONS);
    set({ activeConversationId: conversation.id, conversations });
    persistConversations(conversations);
  } else {
    syncActiveConversation();
  }

  const referencedBet = [...get().messages]
    .reverse()
    .find((m) => m.role === "assistant" && m.assistantPresentation?.primaryPick?.betRef)
    ?.assistantPresentation?.primaryPick?.betRef;

  try {
    const response = await sendMessages(
      get().messages,
      selectedSportsbooks(get().selectedSportsbookIds),
      get().suggestedBestBetEvents,
      referencedBet
    );
    const assistantMessage: ChatMessage = {
      id: messageId(),
      role: "assistant",
      text: formattedAnswer(response),
      includeInAPIRequest: true,
      assistantPresentation: toAssistantPresentation(response),
    };
    set({ messages: [...get().messages, assistantMessage], isLoading: false });
    syncActiveConversation();
    return "sent";
  } catch (error) {
    if (error instanceof FreeLimitReachedError) {
      set({
        messages: get().messages.filter((m) => m.id !== userMessage.id),
        input: trimmedInput,
        isLoading: false,
      });
      if (wasDraft) {
        // The thread was created just for this rejected ask — discard it.
        const activeId = get().activeConversationId;
        const conversations = get().conversations.filter((c) => c.id !== activeId);
        set({ conversations, activeConversationId: null });
        persistConversations(conversations);
      } else {
        syncActiveConversation();
      }
      return "limit";
    }

    set({
      isLoading: false,
      errorMessage: error instanceof Error ? error.message : "Something went wrong.",
    });
    syncActiveConversation();
    return "error";
  }
},
```

(`recentConversations([conversation, ...])` keeps the new thread on top and evicts the oldest when over the cap.)

- [ ] **Step 1:** Add the AsyncStorage mock to the top of `chatStore.test.ts` (copy the 3-line mock from `subscriptionStore.test.ts`).
- [ ] **Step 2:** Update the `beforeEach` reset in `chatStore.test.ts` to include `conversations: [], activeConversationId: null` and add `await AsyncStorage.clear()` isn't needed (mock resets via clearAllMocks); just reset the two fields.
- [ ] **Step 3:** Write failing tests (code below). Run `npm test -- chatStore` → FAIL.
- [ ] **Step 4:** Implement the model/lifecycle/sendMessage changes above. Run `npm test -- chatStore` → PASS.

### New tests to add to `chatStore.test.ts`

```ts
describe("conversation history", () => {
  it("saves and titles a thread on the first user message", async () => {
    mockSendMessages.mockResolvedValue({ answer: "ok", presentation: { summary: "ok" } });
    useChatStore.getState().loadWelcomeState();
    useChatStore.getState().setInput("Who wins Lakers vs Celtics tonight?");
    await useChatStore.getState().sendMessage();

    const { conversations, activeConversationId } = useChatStore.getState();
    expect(conversations).toHaveLength(1);
    expect(conversations[0].title).toBe("Who wins Lakers vs Celtics tonight?");
    expect(activeConversationId).toBe(conversations[0].id);
    expect(conversations[0].messages.some((m) => m.role === "assistant" && m.text === "ok")).toBe(true);
  });

  it("starts a separate thread on newConversation", async () => {
    mockSendMessages.mockResolvedValue({ answer: "a", presentation: { summary: "a" } });
    useChatStore.getState().loadWelcomeState();
    useChatStore.getState().setInput("first bet");
    await useChatStore.getState().sendMessage();
    useChatStore.getState().newConversation();
    useChatStore.getState().setInput("second bet");
    await useChatStore.getState().sendMessage();

    expect(useChatStore.getState().conversations).toHaveLength(2);
    expect(useChatStore.getState().messages.find((m) => m.role === "user")?.text).toBe("second bet");
  });

  it("caps history at 5, evicting the oldest", async () => {
    mockSendMessages.mockResolvedValue({ answer: "ok", presentation: { summary: "ok" } });
    for (let i = 0; i < 6; i++) {
      useChatStore.getState().newConversation();
      useChatStore.getState().setInput(`bet ${i}`);
      await useChatStore.getState().sendMessage();
    }
    const titles = useChatStore.getState().conversations.map((c) => c.title);
    expect(useChatStore.getState().conversations).toHaveLength(5);
    expect(titles).not.toContain("bet 0");
    expect(titles).toContain("bet 5");
  });

  it("selectConversation swaps the active messages", async () => {
    mockSendMessages.mockResolvedValue({ answer: "ok", presentation: { summary: "ok" } });
    useChatStore.getState().loadWelcomeState();
    useChatStore.getState().setInput("alpha");
    await useChatStore.getState().sendMessage();
    const first = useChatStore.getState().activeConversationId!;
    useChatStore.getState().newConversation();
    useChatStore.getState().setInput("beta");
    await useChatStore.getState().sendMessage();

    useChatStore.getState().selectConversation(first);
    expect(useChatStore.getState().activeConversationId).toBe(first);
    expect(useChatStore.getState().messages.find((m) => m.role === "user")?.text).toBe("alpha");
  });

  it("deleteConversation removes it and resets when active", async () => {
    mockSendMessages.mockResolvedValue({ answer: "ok", presentation: { summary: "ok" } });
    useChatStore.getState().loadWelcomeState();
    useChatStore.getState().setInput("to delete");
    await useChatStore.getState().sendMessage();
    const id = useChatStore.getState().activeConversationId!;

    useChatStore.getState().deleteConversation(id);
    expect(useChatStore.getState().conversations).toHaveLength(0);
    expect(useChatStore.getState().activeConversationId).toBeNull();
  });

  it("discards a draft thread when the first ask hits the free limit", async () => {
    mockSendMessages.mockRejectedValue(new FreeLimitReachedError());
    useChatStore.getState().loadWelcomeState();
    useChatStore.getState().setInput("limit ask");
    const result = await useChatStore.getState().sendMessage();
    expect(result).toBe("limit");
    expect(useChatStore.getState().conversations).toHaveLength(0);
    expect(useChatStore.getState().activeConversationId).toBeNull();
  });

  it("hydrate loads the most recent 5 from storage", async () => {
    const make = (n: number): Conversation => ({
      id: `c${n}`, title: `t${n}`, messages: [], createdAt: n, updatedAt: n,
    });
    await AsyncStorage.setItem("conversations", JSON.stringify([make(1), make(2), make(3), make(4), make(5), make(6)]));
    await useChatStore.getState().hydrate();
    const convs = useChatStore.getState().conversations;
    expect(convs).toHaveLength(5);
    expect(convs[0].id).toBe("c6"); // newest first
    expect(convs.map((c) => c.id)).not.toContain("c1");
  });
});
```

Add `Conversation` to the import from `../chatStore` and `import AsyncStorage from "@react-native-async-storage/async-storage";`.

- [ ] **Step 5:** Run full suite `npm test` → all green.

---

## Task 2: ConversationDrawer component

**Files:**
- Create: `src/features/chat/ConversationDrawer.tsx`

Slide-out overlay matching the app's dark palette. Renders a backdrop + left panel. Lists `recentConversations(conversations)` with title + relative time, highlights active, "New Chat" row on top, trailing trash per row. No animation library required beyond a simple `Modal` + absolute panel (Reanimated optional; keep it simple with `Modal animationType="fade"` + panel). Use existing `palette` and `expo-symbols`.

```tsx
// Slide-out history drawer: lists the last 5 conversations, switch/new/delete.
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
                      <Text style={styles.rowTitle} numberOfLines={1}>{c.title}</Text>
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
    width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  newRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 14, paddingVertical: 13, borderRadius: 18, backgroundColor: palette.lime,
  },
  newText: { fontSize: 14, fontWeight: "900", color: palette.ink },
  list: { gap: 10 },
  empty: { fontSize: 13, fontWeight: "500", color: "rgba(240,235,224,0.6)", paddingHorizontal: 4 },
  row: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 14, paddingVertical: 13, borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  rowActive: { backgroundColor: "rgba(255,255,255,0.12)" },
  rowTexts: { flex: 1, gap: 4 },
  rowTitle: { fontSize: 14, fontWeight: "800", color: palette.headerText },
  rowTime: { fontSize: 12, fontWeight: "500", color: "rgba(240,235,224,0.6)" },
});
```

- [ ] **Step 1:** Create the file above.
- [ ] **Step 2:** `npx tsc --noEmit` → no errors. (Verify `palette.lime`, `palette.headerBar`, `palette.headerText`, `palette.ink` exist — they are used in existing components, so they do.)

---

## Task 3: Wire drawer + new-chat into ChatScreen

**Files:**
- Modify: `src/features/chat/ChatScreen.tsx`

Add a hamburger button on the LEFT of the header (before the title) that opens the drawer, and a "+" New Chat button. Keep the existing right-side account hamburger as-is (it opens `RightSideMenu`). Add `ConversationDrawer` mount.

- [ ] **Step 1:** Add state: `const [isDrawerVisible, setDrawerVisible] = useState(false);`
- [ ] **Step 2:** Import the drawer: `import ConversationDrawer from "./ConversationDrawer";`
- [ ] **Step 3:** In the header, before the `<Pressable onPress={handleTitlePress}>` title, add:

```tsx
<Pressable style={styles.iconButton} onPress={() => setDrawerVisible(true)} hitSlop={6}>
  <SymbolView name="sidebar.left" size={18} weight="semibold" tintColor={palette.headerText} />
</Pressable>
```

- [ ] **Step 4:** Add a New Chat button after the title (before `headerSpacer`):

```tsx
<Pressable style={styles.iconButton} onPress={() => useChatStore.getState().newConversation()} hitSlop={6}>
  <SymbolView name="square.and.pencil" size={18} weight="semibold" tintColor={palette.headerText} />
</Pressable>
```

- [ ] **Step 5:** Mount the drawer near the other sheets:

```tsx
<ConversationDrawer visible={isDrawerVisible} onClose={() => setDrawerVisible(false)} />
```

- [ ] **Step 6:** Add an `iconButton` style:

```ts
iconButton: {
  width: 36, height: 36, borderRadius: 18,
  alignItems: "center", justifyContent: "center",
  backgroundColor: "rgba(255, 255, 255, 0.06)",
},
```

- [ ] **Step 7:** `npx tsc --noEmit` → clean.

---

## Task 4: Hydrate on boot

**Files:**
- Modify: `src/app/_layout.tsx`

- [ ] **Step 1:** In the `useEffect`, before `loadWelcomeState()`, add:

```ts
void useChatStore.getState().hydrate();
```

(Order is safe: `hydrate` only sets `conversations`; `loadWelcomeState` only sets `messages`/`activeConversationId`.)

- [ ] **Step 2:** `npx tsc --noEmit` → clean.

---

## Task 5: Verify

- [ ] **Step 1:** `npm test` → all suites pass.
- [ ] **Step 2:** `npx tsc --noEmit` → no type errors.
- [ ] **Step 3:** `npm run lint` → clean (or no new warnings).
- [ ] **Step 4:** Manual success criteria from the spec (drawer switch, restart fresh, 6th evicts oldest, per-thread context, delete) — confirm via the running app / reasoning.

---

## Self-review notes

- **Spec coverage:** data model (T1), persistence/hydrate (T1, T4), lifecycle create/title/evict/switch/delete (T1), drawer UI + entry (T2, T3), restart-fresh (T1 hydrate sets only conversations; loadWelcomeState makes a draft), per-thread context (free — active `messages` is what `sendMessages` receives). ✓
- **Type consistency:** `newConversation`, `selectConversation`, `deleteConversation`, `hydrate`, `conversationTitle`, `recentConversations`, `Conversation`, `MAX_CONVERSATIONS` are used consistently across store + tests + drawer. ✓
- **No backend/API changes.** ✓
