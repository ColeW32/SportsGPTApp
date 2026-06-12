# SportsGPT React Native Rebuild + Backend Hardening — Design

**Date:** 2026-06-12
**Status:** Approved
**Repo:** SportsGPTApp (this repo; RN app replaces the SwiftUI app, `functions/` stays)

## Goal

Rebuild the SportsGPT iOS app (currently SwiftUI, ~6,400 lines) as a React Native app
with OTA update capability, at 1:1 feature parity, and fix four issues found during
investigation:

1. The Firebase MoneyLine proxy is effectively unauthenticated (public HTTP function,
   no App Check verification despite client-side App Check bootstrap).
2. The 10-free-messages limit is enforced client-side only (UserDefaults).
3. Paywall prices are hardcoded in the client instead of read from the store.
4. Brittle client-side AI fallback heuristics (string-matching the AI's answer text).
   Fixed properly in the MoneyLine API later; ported as-is and isolated for now.

## Scope decisions (user-confirmed)

- **Platforms:** iOS ships first. Code is cross-platform (Expo); Android launch is a
  follow-up (Play Console, Google billing products, Play Integrity).
- **Repo:** Build in this repo. The SwiftUI app (`SportsGPT/`, `SportsGPT.xcodeproj`,
  test targets) is deleted in final cleanup once the RN app reaches parity.
- **MoneyLine API:** Out of scope. This project covers the RN app + Firebase functions
  only. A written API contract for the follow-up ticket is included below.

## Stack

| Concern | Choice |
|---|---|
| Framework | Expo (latest SDK), TypeScript, EAS dev builds (not Expo Go) |
| OTA | EAS Update — channels `production` and `preview`, fingerprint runtime version policy |
| Navigation | expo-router (single chat screen + modals) |
| State | React context + small zustand store |
| Subscriptions | react-native-purchases (RevenueCat), entitlement "SportsGPT Pro" |
| Firebase | @react-native-firebase/app, app-check, auth, functions |
| Voice input | expo-speech-recognition (on-device iOS speech recognition) |
| Testing | Jest (+ React Native Testing Library where useful) |

OTA constraint: EAS Update ships JS/asset changes only. Native-module changes require a
store build, so native dependencies are kept to the list above. The app keeps the
existing bundle ID so it ships as an update to the current App Store listing. Existing
subscribers re-link automatically via RevenueCat receipt restore on first launch.

## Project layout

```
app/                      # expo-router routes
src/
  api/                    # MoneyLine client, request/response types
    moneylineClient.ts    # callable-function transport
    moneylineFallbacks.ts # ported event-resolution heuristics (isolated, deletable)
    types.ts              # MoneyLineChatRequest, MoneyLineAIData, BestBetEvent, ...
  features/
    chat/                 # chat screen, bubbles, presentation cards, suggested prompts
    paywall/              # paywall modal, plans, subscription store
    onboarding/           # intro carousel + onboarding wizard
    settings/             # account, ad preferences, sportsbook filter, legal
  state/                  # zustand store(s), persistence
functions/                # Firebase functions (hardened, see below)
```

## Feature parity checklist (ported 1:1, same look and copy)

- Launch screen (~0.85s minimum) → 3-slide intro carousel → 5-step onboarding wizard,
  gated by persisted `hasSeenIntroExperience` / `hasCompletedOnboarding` flags
  (AsyncStorage; fresh start for existing users is accepted).
- Chat home: welcome message, dynamic suggested prompts seeded from `GET /v1/best-bets`
  (top events → prompt chips; events cached for fallback matching).
- Thinking animation (cycling phrases, ~1.2s cadence).
- Structured assistant rendering: headline, summary, primary pick, alternative pick,
  supporting cards, confidence, fact pills (Edge/EV/Implied/Model) with tappable
  metric explainer sheets; markdown/plain-text fallback when no presentation payload.
- Sportsbook filter: all 40 books, multi-select, live search, passed to API as
  `filters.bookmakers`; selection re-seeds suggested prompts.
- Voice input via on-device speech recognition (mic button when composer empty).
- Paywall: Yearly / Lifetime / Monthly, context-aware copy (standard vs. free-limit-
  reached vs. active trial/subscriber), 5-second-delayed "Not now" dismiss, restore
  purchases.
- Rebet affiliate promo card under assistant replies for free users; Ad Preferences
  toggle.
- Account settings (status, manage subscription, upgrade CTA) and legal screens.
- Chat context window: last 6 includable messages, same as today.

## The four fixes

### 1. Proxy authentication (App Check + auth, enforced)

- App switches from raw HTTP POSTs against `moneylineProxyHttp` to the **callable**
  `moneylineProxy` via @react-native-firebase/functions, which attaches App Check and
  auth tokens automatically.
- `moneylineProxy` gets `enforceAppCheck: true` and rejects unauthenticated callers
  (`request.auth` required).
- `moneylineProxyHttp` is **deleted**.
- App Check provider: App Attest on iOS (debug provider on simulator), Play Integrity
  slot ready for Android later.

### 2. Server-side free-message limit

- On first launch the app signs in with **anonymous Firebase Auth** and calls
  `Purchases.logIn(uid)` so the RevenueCat app user ID equals the Firebase UID.
- The proxy's `aiChat` operation counts requests per UID in Firestore
  (`users/{uid}.freeRequestCount`, transactional increment). Non-premium users are
  rejected at request #11 with a typed `free-limit-reached` error (HttpsError
  `resource-exhausted` with `details.code = "free-limit-reached"`); the client maps it
  to the paywall with the "Free Limit Reached" context.
- A new **`revenuecatWebhook`** HTTP function (shared-secret header, secret stored as
  a Firebase secret) receives RevenueCat events and writes
  `users/{uid}.isPremium` / entitlement metadata to Firestore. The proxy reads this to
  decide whether limits apply.
- Client still tracks a local count for UI copy ("X free asks left") but the server is
  authoritative.
- Accepted gap: reinstall → new anonymous UID → fresh 10 messages (no worse than
  today; now requires reinstall instead of nothing).
- `bestBets` / `eventBestBets` operations are not counted against the limit (they power
  prompts and fallbacks), but still require auth + App Check.

### 3. Live paywall prices

- Paywall renders `localizedPriceString` from RevenueCat offerings/packages. Hardcoded
  price strings are removed. If offerings fail to load, plans render without prices
  (and purchase still routes through RevenueCat), never wrong prices.

### 4. Transport correctness + isolated heuristics

- New client checks callable/HTTP error status before decoding (fixes the swallowed-
  error bug in the Swift `DirectMoneyLineTransport.perform`).
- Event-resolution heuristics ported as-is into `src/api/moneylineFallbacks.ts`:
  - Enrichment: fuzzy team-name match against cached best-bet events; append
    "For event resolution, this refers to the X vs Y game."
  - Retry: if answer text matches "don't see"/"do not see"/"need" and the question
    mentions "game"/"tonight", re-send with `context: "event_best_available_bet"`.
  - Fallback: on empty-looking responses or "matches multiple games"/"unable to
    resolve" errors, fetch `GET /v1/events/{id}/best-bets` and synthesize a
    presentation payload client-side.
- The module is behind the service interface so it can be deleted wholesale once the
  MoneyLine API ships the contract below.

## MoneyLine API follow-up contract (separate ticket, written here for the record)

To delete `moneylineFallbacks.ts`, `POST /v1/ai/chat` should:

1. Return a machine-readable status instead of prose the client greps:
   `data.resolution = "ok" | "event_unresolved" | "event_ambiguous" | "no_data"`.
2. On `event_ambiguous`, include candidate events (`eventId`, team names, start time)
   so a client can disambiguate or auto-pick.
3. Accept an optional `eventId` in the request to pin event resolution server-side.
4. When the AI has no answer but the event resolves, fall back server-side to the
   event best-bets composition (what the client synthesizes today) and return it as a
   normal presentation payload.

## Error handling

- Same user-facing error copy as today (invalid response, empty response, server
  message passthrough, proxy-unreachable message).
- New: `free-limit-reached` → paywall, `unauthenticated`/App Check failures → "make
  sure you're on the latest build" message (matches existing proxy-error copy).
- Speech recognition errors map to the same four messages as the Swift app.

## Testing

- **Jest unit tests** for the high-risk pure logic:
  - Presentation payload → UI model transformer (largest porting risk; the Swift
    version is ~140 lines of mapping plus dedup keys, odds/date/percent formatting,
    selection normalization).
  - `moneylineFallbacks.ts` (event matching/scoring, retry triggers, synthesized
    response shape).
  - Formatters (American odds, percent, money, Eastern-time event display).
- **Functions unit tests** for the proxy: operation allowlist, auth/App Check gates,
  free-limit enforcement (premium vs. free vs. at-limit), webhook secret check.
- UI verified manually on the iOS simulator. No E2E framework.

## Out of scope

- MoneyLine API changes (contract above; separate ticket).
- Android ship (code stays cross-platform-ready).
- Visual redesign — same look, theme (beige/tan + lime #D2F23F), and copy.
- Migrating existing users' local UserDefaults state (onboarding flags, free count).

## Delivery

- One commit per repo at the end (this repo only), containing spec + plan + RN app +
  hardened functions + tests + Swift app deletion.
- EAS project setup (`eas.json`, channels) is part of the work; store submission of
  the new binary is a user-driven step after the build is verified.
