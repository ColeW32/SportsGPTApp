# SportsGPT Firebase Functions

Backend for the SportsGPT app: a hardened proxy that keeps the MoneyLine API key off
the client, plus the RevenueCat webhook that records premium status for server-side
free-limit enforcement.

## Functions

### `moneylineProxy` (callable, us-central1)

The only client-facing entry point. Enforces **App Check** (`enforceAppCheck: true`)
and **Firebase Auth** (anonymous sign-in from the app) — unauthenticated or
unattested calls are rejected.

Operations (passed as `{ operation, ...params }`):

- `aiChat` — POST `https://mlapi.bet/v1/ai/chat` with `{ body }`. Counted against the
  free limit: non-premium users get `FREE_REQUEST_LIMIT` (10) lifetime asks tracked in
  Firestore `users/{uid}.freeRequestCount`; request #11 is rejected with
  `resource-exhausted` and `details.code = "free-limit-reached"`.
- `bestBets` — GET `/v1/best-bets?limit=&bookmaker=`. Not counted.
- `eventBestBets` — GET `/v1/events/{eventId}/best-bets?bookmaker=`. Not counted.

### `revenuecatWebhook` (HTTP, us-central1)

Receives RevenueCat webhook events and writes `users/{uid}.isPremium` to Firestore.
Requires `Authorization: Bearer <REVENUECAT_WEBHOOK_SECRET>`. The app calls
`Purchases.logIn(<firebase uid>)`, so RevenueCat's `app_user_id` is the Firebase UID.
Premium-granting events: INITIAL_PURCHASE, RENEWAL, UNCANCELLATION,
NON_RENEWING_PURCHASE, PRODUCT_CHANGE. Premium-revoking: EXPIRATION. Everything else
(including CANCELLATION, which keeps access until expiration) is ignored.

## Secrets

```bash
firebase functions:secrets:set MONEYLINE_API_KEY
firebase functions:secrets:set REVENUECAT_WEBHOOK_SECRET   # e.g. openssl rand -hex 32
```

Configure the same webhook secret in the RevenueCat dashboard (Integrations →
Webhooks) with the URL
`https://us-central1-<project-id>.cloudfunctions.net/revenuecatWebhook` and the
Authorization header value `Bearer <secret>`.

## Develop & test

```bash
cd functions
npm install
npm test          # node:test unit suites (proxy, limits, webhook)
node -e "require('./index.js')"   # boot check: must load without throwing
```

## Deploy

```bash
firebase deploy --only functions
```

After deploying, verify:

1. Direct curl to the callable without App Check/auth fails (401/403-class error).
2. `revenuecatWebhook` returns 401 for a wrong secret.
3. The app's suggested prompts load and a chat round-trip succeeds.
