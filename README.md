# SportsGPT

A React Native (Expo) chat app for sports-betting questions, powered by the MoneyLine
API (mlapi.bet) through a hardened Firebase Functions proxy. Subscriptions via
RevenueCat ("SportsGPT Pro"); OTA JS updates via EAS Update.

## Repo layout

- `src/app/` — expo-router routes (launch gate → intro → onboarding → chat)
- `src/api/` — MoneyLine client (Firebase callable transport), response→UI
  transformation, event-resolution fallback heuristics (`moneylineFallbacks.ts` is
  deliberately isolated and deletable once the MoneyLine API ships machine-readable
  resolution statuses)
- `src/features/` — chat, paywall, onboarding, settings screens
- `src/state/` — zustand stores (chat, subscription, app flags)
- `functions/` — Firebase Functions (see `functions/README.md`)

## Prerequisites (local, gitignored)

- `GoogleService-Info.plist` at the repo root — download via
  `firebase apps:sdkconfig IOS <app-id> --project juiced-636b2`
- `.firebaserc` — `{ "projects": { "default": "juiced-636b2" } }`
- Node 20+ (`nvm use 20`)

## Develop

```bash
npm install
npm test                          # Jest unit suites (api + state)
npx tsc --noEmit                  # typecheck
npx expo prebuild --platform ios  # generate ios/ (CNG; gitignored)
npx expo run:ios                  # build + launch simulator dev build
```

App Check uses the debug provider in dev — set `EXPO_PUBLIC_APPCHECK_DEBUG_TOKEN`
to a token registered in Firebase console → App Check → apps → manage debug tokens.

## Build & release (EAS)

```bash
npx eas build --profile development --platform ios   # dev client
npx eas build --profile production --platform ios    # store build
npx eas update --branch production --message "..."   # OTA push (JS/assets only)
```

JS-only changes ship instantly via `eas update`. Anything that touches native modules
or app config (new native dependency, plugin change, `app.json` native fields)
requires a new store build — the fingerprint runtime version policy prevents an OTA
update from landing on an incompatible binary.

Bundle ID: `com.sportsgpt.juiced` (App Store), Firebase project `juiced-636b2`.

## Backend

See [functions/README.md](functions/README.md). Deploy order for changes that span
app + backend: functions deploy + smoke tests first, then the app build/OTA update.
