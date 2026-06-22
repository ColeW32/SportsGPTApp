# SportsGPT — Multi-Conversation History

**Date:** 2026-06-22
**Status:** Approved

## Problem

Chat is a single in-memory flat list of messages (`src/state/chatStore.ts`),
wiped on every app restart. There is no concept of separate threads, so a user
who wants to discuss a Lakers bet and an NFL parlay must do both in one
ever-growing conversation, and the AI's context (last 6 messages) bleeds
across topics. Nothing persists.

## Goal

Give users their **last 5 conversations** as switchable threads, persisted
locally, so they can keep different bets/leagues in separate contexts.

This is a **purely client-side** change. The backend `/v1/ai/chat` is stateless
(it receives the last 6 messages of whatever is sent) — no API change needed.

## Design

### 1. Data model (`src/state/chatStore.ts`)

Introduce a `Conversation`:

```ts
interface Conversation {
  id: string;            // uuid
  title: string;         // auto-derived from first user message
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;     // bumped on every message; ordering + eviction key
}
```

Store shape changes:
- `conversations: Conversation[]` (persisted, capped at 5)
- `activeConversationId: string`
- A `messages` accessor/selector returns the active conversation's messages, so
  `ChatScreen` / `MessageList` read through a thin accessor and need minimal
  changes.
- `sendMessage` / `sendSuggestedPrompt` append into the active conversation and
  bump `updatedAt`.
- Global UI state (`input`, `isLoading`, `isLoadingSuggestedPrompts`,
  `selectedSportsbookIds`, `suggestedPrompts`, `suggestedBestBetEvents`,
  `errorMessage`) stays top-level and conversation-agnostic.

### 2. Persistence (AsyncStorage, matching `subscriptionStore`)

- Add `hydrate()` to the chat store, called from `src/app/_layout.tsx` alongside
  the existing hydrate calls.
- Persist **`conversations` only** (capped at 5). Write-through on every message
  append and on thread create/delete/evict.
- `selectedSportsbookIds` remains a global filter preference on its current
  persistence path — unchanged.

### 3. Thread lifecycle

- **Create:** "New Chat" / launch creates an in-memory thread with the welcome
  state, **not yet inserted** into `conversations`.
- **Save + title:** on the first *user* message, insert the thread into
  `conversations`, titled from that message (trimmed to ~40 chars, ellipsis).
- **Order:** drawer lists by `updatedAt` desc; resuming + sending bumps to top.
- **Evict:** when a 6th conversation would be saved, drop the oldest `updatedAt`.
- **Switch:** tapping a drawer item sets `activeConversationId`. An unsaved empty
  thread that is switched away from simply evaporates (never persisted).
- **Delete:** trailing trash / long-press removes a thread; if it was active,
  fall back to a fresh empty thread.

### 4. UI — drawer + entry point

- **Header (`ChatScreen`):** add a hamburger icon (left) to open the drawer; keep
  a "+" affordance for New Chat.
- **`ConversationDrawer`** (new component): in-screen animated overlay
  (Reanimated / `Modal`), matching the app's existing modal-heavy pattern — **not**
  a react-navigation drawer, so navigation is not restructured. Lists up to 5
  chats (title + relative time), highlights the active one, "New Chat" row at top,
  per-row delete.

### 5. Restart behavior

On launch: hydrate saved conversations into the drawer, but set the active thread
to a **fresh empty one** (welcome screen shows, exactly like today). Past chats
are one tap away.

### 6. Free side-effect: per-thread AI context

Because the backend gets "last 6 messages of the active conversation," threading
automatically scopes the AI's context to the current thread. No backend change.

## Scope / Non-goals

- **No** Firestore / cross-device sync (anonymous per-device auth — out of scope).
- **No** manual renaming, search, or pinning.
- **No** unlimited history — last 5 only.
- **No** backend/API changes.

## Success criteria

1. Send messages, tap "New Chat", send more → two distinct titled threads in the
   drawer.
2. Kill + relaunch → past threads still in the drawer; app opens on a fresh
   welcome thread.
3. Create a 6th thread → oldest disappears, 5 remain.
4. Switch to an old thread and ask a follow-up → AI responds in *that* thread's
   context.
5. Delete a thread → it disappears; deleting the active one drops to a fresh
   thread.
