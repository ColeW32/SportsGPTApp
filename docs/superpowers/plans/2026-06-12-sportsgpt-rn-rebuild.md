# SportsGPT React Native Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the SwiftUI SportsGPT app as an Expo/React Native app with EAS Update OTA, harden the Firebase MoneyLine proxy (App Check + auth + server-side free limit), and delete the Swift app at parity.

**Architecture:** Expo (expo-router, zustand) app at repo root calling a hardened `moneylineProxy` Firebase callable via @react-native-firebase. Anonymous Firebase Auth identifies users; a RevenueCat webhook writes premium status to Firestore so the proxy can enforce the 10-free-asks limit server-side. All event-resolution heuristics live in one deletable module.

**Tech Stack:** Expo SDK (latest), TypeScript, expo-router, zustand, @react-native-firebase (app/auth/app-check/functions), react-native-purchases, expo-speech-recognition, AsyncStorage, Jest (jest-expo + node:test for functions).

> **COMMIT CADENCE OVERRIDE (user CLAUDE.md HARD RULE):** Do NOT commit per task or per step, regardless of what the executing skill says. Track progress via the checkboxes in this file. ONE commit at the very end (Task 26) containing spec + plan + all code. Work on branch `feat/react-native-rebuild`.

**Spec:** `docs/superpowers/specs/2026-06-12-sportsgpt-rn-rebuild-design.md`

**Key facts:**
- Bundle ID (must keep): `com.sportsgpt.juiced` — version 1.0, build 2 → new build numbers start at 3.
- iOS deployment target 16.0.
- No `GoogleService-Info.plist` or `.firebaserc` in the repo (gitignored, absent locally) — Task 0 resolves this.
- Swift source is the porting reference: `SportsGPT/ContentView.swift` (UI), `SportsGPT/SportsGPTModels.swift` (models/transforms), `SportsGPT/MoneyLineService.swift` (heuristics). They stay in-tree until Task 25 cleanup, so port FROM them directly.

---

### Task 0: Preconditions and branch

**Files:** none (environment)

- [x] **Step 1: Confirm solo session.** Run `git worktree list` and `git reflog -5` in repo root. Expect only the primary checkout and your own reflog entries. If anything suggests a sibling session, STOP and switch to a worktree per CLAUDE.md. *(Done — fresh clone, solo.)*
- [x] **Step 2: Create branch.** `git checkout -b feat/react-native-rebuild`
- [x] **Step 3: Resolve Firebase project.** Run `npx firebase-tools projects:list` (uses local CLI auth). Identify the SportsGPT project ID. Then `npx firebase-tools apps:sdkconfig IOS --project <id>` to regenerate `GoogleService-Info.plist` content, save to repo root as `GoogleService-Info.plist` (already gitignored). Also create `.firebaserc` with `{"projects": {"default": "<id>"}}` (gitignored).
  **If CLI auth is unavailable or the project is ambiguous: STOP and ask the user** for the Firebase project ID and the `GoogleService-Info.plist` — this is the one external dependency that cannot be derived from the repo.
- [x] **Step 4: Verify the existing function is reachable** (baseline before changes). *(FINDING: project is `juiced-636b2`; Cloud Functions API was never enabled — the proxy was NEVER deployed. No live endpoint exists, so the Task 24 cutover-coordination concern is moot. The repo's pbxproj bundle `com.sportsgpt.juiced` was also not registered in Firebase (only `com.juicedapp.juiced` was); registered it as app `1:382864104068:ios:e5e1b3276a697145cdc0d1` and downloaded its GoogleService-Info.plist. Apple team IDs found in pbxproj: 3WXTFLADTA, P5KW35BV2C — needed for App Attest console setup at Task 24. MONEYLINE_API_KEY secret must be set at first deploy.)*

---

### Task 1: Functions — restructure into testable modules

**Files:**
- Modify: `functions/index.js` (slim to wiring only)
- Create: `functions/proxy.js`, `functions/limits.js`, `functions/webhook.js`
- Create: `functions/test/proxy.test.js`, `functions/test/limits.test.js`, `functions/test/webhook.test.js`
- Modify: `functions/package.json` (add `"test": "node --test test/"`)

The current `index.js` mixes transport wiring and logic. Extract pure logic so it can be unit-tested with `node:test` (Node 20 built-in, no new deps) via dependency injection — no firebase emulator needed.

- [x] **Step 1: Write failing tests for the proxy core** in `functions/test/proxy.test.js`:

```js
"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const { buildUpstreamRequest, handleProxyInvocation } = require("../proxy.js");

test("rejects unknown operations", async () => {
  await assert.rejects(
    handleProxyInvocation({ data: { operation: "nope" }, apiKey: "k", fetchImpl: async () => {}, enforceLimit: async () => {} }),
    /Unsupported MoneyLine proxy operation/
  );
});

test("aiChat builds POST to /v1/ai/chat with body", () => {
  const r = buildUpstreamRequest("aiChat", { body: { scope: "large" } });
  assert.equal(r.method, "POST");
  assert.equal(r.url, "https://mlapi.bet/v1/ai/chat");
  assert.equal(r.body, JSON.stringify({ scope: "large" }));
});

test("bestBets builds GET with limit and bookmaker", () => {
  const r = buildUpstreamRequest("bestBets", { limit: 4, bookmaker: "draftkings" });
  assert.equal(r.url, "https://mlapi.bet/v1/best-bets?limit=4&bookmaker=draftkings");
});

test("eventBestBets requires eventId", () => {
  assert.throws(() => buildUpstreamRequest("eventBestBets", {}), /eventId is required/);
});

test("aiChat invokes enforceLimit with uid; bestBets does not", async () => {
  const calls = [];
  const fetchImpl = async () => ({ ok: true, text: async () => JSON.stringify({ success: true }) });
  const enforceLimit = async (uid) => calls.push(uid);
  await handleProxyInvocation({ data: { operation: "aiChat", body: {} }, uid: "u1", apiKey: "k", fetchImpl, enforceLimit });
  await handleProxyInvocation({ data: { operation: "bestBets" }, uid: "u1", apiKey: "k", fetchImpl, enforceLimit });
  assert.deepEqual(calls, ["u1"]);
});

test("non-OK upstream surfaces upstream error message", async () => {
  const fetchImpl = async () => ({ ok: false, status: 502, text: async () => JSON.stringify({ error: { message: "boom" } }) });
  await assert.rejects(
    handleProxyInvocation({ data: { operation: "bestBets" }, uid: "u1", apiKey: "k", fetchImpl, enforceLimit: async () => {} }),
    /boom/
  );
});
```

- [x] **Step 2: Run to verify failure.** `cd functions && npm test` — expect FAIL (`Cannot find module '../proxy.js'`).
- [x] **Step 3: Create `functions/proxy.js`** by moving `buildUpstreamRequest`, `safeParseJSON`, `httpStatusCode`, and `handleProxyInvocation` out of `index.js`, refactored to take injected deps:

```js
"use strict";
const { HttpsError } = require("firebase-functions/v2/https");

const MONEYLINE_BASE_URL = "https://mlapi.bet";
const ALLOWED_OPERATIONS = new Set(["aiChat", "bestBets", "eventBestBets"]);

function buildUpstreamRequest(operation, data) {
  /* identical body to current functions/index.js buildUpstreamRequest — move verbatim */
}

function safeParseJSON(value) { try { return JSON.parse(value); } catch { return null; } }

function httpStatusCode(code) { /* move verbatim from index.js */ }

async function handleProxyInvocation({ data, uid, apiKey, fetchImpl, enforceLimit }) {
  const operation = data?.operation;
  if (!ALLOWED_OPERATIONS.has(operation)) {
    throw new HttpsError("invalid-argument", "Unsupported MoneyLine proxy operation.");
  }
  if (!apiKey) {
    throw new HttpsError("failed-precondition", "MONEYLINE_API_KEY is not configured.");
  }
  if (operation === "aiChat") {
    await enforceLimit(uid);
  }
  const upstreamRequest = buildUpstreamRequest(operation, data);
  const response = await fetchImpl(upstreamRequest.url, {
    method: upstreamRequest.method,
    headers: { "Content-Type": "application/json", "x-api-key": apiKey },
    body: upstreamRequest.body
  });
  const text = await response.text();
  const json = safeParseJSON(text);
  if (!response.ok) {
    throw new HttpsError("internal", json?.error?.message || text || `MoneyLine returned ${response.status}.`);
  }
  if (!json) {
    throw new HttpsError("internal", "MoneyLine returned a non-JSON response.");
  }
  return json;
}

module.exports = { buildUpstreamRequest, handleProxyInvocation, httpStatusCode, MONEYLINE_BASE_URL };
```

- [x] **Step 4: Run tests.** `npm test` — proxy tests PASS (limits/webhook tests come next).

---

### Task 2: Functions — server-side free limit (`limits.js`)

**Files:** Create: `functions/limits.js`; Test: `functions/test/limits.test.js`

- [x] **Step 1: Write failing tests** in `functions/test/limits.test.js` using a fake Firestore:

```js
"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const { makeEnforceAiChatLimit, FREE_REQUEST_LIMIT } = require("../limits.js");

function fakeDb(initialUserData) {
  let stored = initialUserData;
  const ref = {};
  return {
    collection: () => ({ doc: () => ref }),
    runTransaction: async (fn) => fn({
      get: async () => ({ data: () => stored, exists: stored !== undefined }),
      set: (_ref, data) => { stored = { ...(stored || {}), ...data }; }
    }),
    readBack: () => stored
  };
}

test("premium users are never limited or counted", async () => {
  const db = fakeDb({ isPremium: true, freeRequestCount: 99 });
  await makeEnforceAiChatLimit(db)("u1");
  assert.equal(db.readBack().freeRequestCount, 99);
});

test("free user under limit increments count", async () => {
  const db = fakeDb({ freeRequestCount: 3 });
  await makeEnforceAiChatLimit(db)("u1");
  assert.equal(db.readBack().freeRequestCount, 4);
});

test("brand-new user (no doc) gets count 1", async () => {
  const db = fakeDb(undefined);
  await makeEnforceAiChatLimit(db)("u1");
  assert.equal(db.readBack().freeRequestCount, 1);
});

test(`free user at ${FREE_REQUEST_LIMIT} is rejected with free-limit-reached`, async () => {
  const db = fakeDb({ freeRequestCount: FREE_REQUEST_LIMIT });
  await assert.rejects(makeEnforceAiChatLimit(db)("u1"), (err) => {
    assert.equal(err.code, "resource-exhausted");
    assert.equal(err.details?.code, "free-limit-reached");
    return true;
  });
});

test("missing uid is rejected unauthenticated", async () => {
  await assert.rejects(makeEnforceAiChatLimit(fakeDb({}))(undefined), (err) => {
    assert.equal(err.code, "unauthenticated");
    return true;
  });
});
```

- [x] **Step 2: Run to verify failure.** `npm test` — FAIL (module missing).
- [x] **Step 3: Implement `functions/limits.js`:**

```js
"use strict";
const { HttpsError } = require("firebase-functions/v2/https");

const FREE_REQUEST_LIMIT = 10;

function makeEnforceAiChatLimit(db) {
  return async function enforceAiChatLimit(uid) {
    if (!uid) {
      throw new HttpsError("unauthenticated", "Sign-in is required.");
    }
    const ref = db.collection("users").doc(uid);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const data = snap.data() || {};
      if (data.isPremium === true) {
        return;
      }
      const count = typeof data.freeRequestCount === "number" ? data.freeRequestCount : 0;
      if (count >= FREE_REQUEST_LIMIT) {
        throw new HttpsError("resource-exhausted", "You've used all your free asks.", { code: "free-limit-reached" });
      }
      tx.set(ref, { freeRequestCount: count + 1 }, { merge: true });
    });
  };
}

module.exports = { makeEnforceAiChatLimit, FREE_REQUEST_LIMIT };
```

Note: `tx.set(ref, ...)` — the fake passes `(_ref, data)`; real Firestore transaction signature is `tx.set(ref, data, options)`. Implement against real Firestore (`tx.set(ref, { ... }, { merge: true })`) and make the fake match that signature.

- [x] **Step 4: Run tests.** `npm test` — limits tests PASS.

---

### Task 3: Functions — RevenueCat webhook (`webhook.js`)

**Files:** Create: `functions/webhook.js`; Test: `functions/test/webhook.test.js`

Webhook contract (RevenueCat → us): POST with `Authorization: Bearer <shared secret>`, body `{ "event": { "type": "...", "app_user_id": "<firebase uid>" } }`. Premium-granting types: `INITIAL_PURCHASE`, `RENEWAL`, `UNCANCELLATION`, `NON_RENEWING_PURCHASE` (lifetime), `PRODUCT_CHANGE`. Premium-revoking: `EXPIRATION`. All others (incl. `CANCELLATION`, which keeps access until expiration): ignore. RevenueCat anonymous IDs (prefix `$RCAnonymousID:`) are ignored — our app always logs in with the Firebase UID.

- [x] **Step 1: Write failing tests** in `functions/test/webhook.test.js`:

```js
"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const { processWebhookEvent } = require("../webhook.js");

function fakeDb() {
  const writes = [];
  return {
    collection: (c) => ({ doc: (id) => ({ set: async (data, opts) => writes.push({ c, id, data, opts }) }) }),
    writes
  };
}

test("INITIAL_PURCHASE sets isPremium true", async () => {
  const db = fakeDb();
  const result = await processWebhookEvent(db, { type: "INITIAL_PURCHASE", app_user_id: "uid1" });
  assert.equal(result, "updated");
  assert.deepEqual(db.writes[0].data, { isPremium: true, lastRevenueCatEvent: "INITIAL_PURCHASE" });
  assert.deepEqual(db.writes[0].opts, { merge: true });
});

test("EXPIRATION sets isPremium false", async () => {
  const db = fakeDb();
  await processWebhookEvent(db, { type: "EXPIRATION", app_user_id: "uid1" });
  assert.equal(db.writes[0].data.isPremium, false);
});

test("CANCELLATION is ignored (access until expiration)", async () => {
  const db = fakeDb();
  const result = await processWebhookEvent(db, { type: "CANCELLATION", app_user_id: "uid1" });
  assert.equal(result, "ignored");
  assert.equal(db.writes.length, 0);
});

test("anonymous RevenueCat ids are ignored", async () => {
  const db = fakeDb();
  const result = await processWebhookEvent(db, { type: "RENEWAL", app_user_id: "$RCAnonymousID:abc" });
  assert.equal(result, "ignored");
  assert.equal(db.writes.length, 0);
});

test("missing event is rejected", async () => {
  await assert.rejects(processWebhookEvent(fakeDb(), undefined), /Missing event/);
});
```

- [x] **Step 2: Run to verify failure**, then **Step 3: implement `functions/webhook.js`:**

```js
"use strict";

const PREMIUM_ON = new Set(["INITIAL_PURCHASE", "RENEWAL", "UNCANCELLATION", "NON_RENEWING_PURCHASE", "PRODUCT_CHANGE"]);
const PREMIUM_OFF = new Set(["EXPIRATION"]);

async function processWebhookEvent(db, event) {
  if (!event || typeof event.type !== "string") {
    throw new Error("Missing event payload.");
  }
  const uid = event.app_user_id;
  if (typeof uid !== "string" || !uid.length || uid.startsWith("$RCAnonymousID:")) {
    return "ignored";
  }
  let isPremium;
  if (PREMIUM_ON.has(event.type)) isPremium = true;
  else if (PREMIUM_OFF.has(event.type)) isPremium = false;
  else return "ignored";

  await db.collection("users").doc(uid).set(
    { isPremium, lastRevenueCatEvent: event.type },
    { merge: true }
  );
  return "updated";
}

module.exports = { processWebhookEvent };
```

- [x] **Step 4: Run tests.** `npm test` — all functions tests PASS.

---

### Task 4: Functions — rewire `index.js` (enforced App Check, auth, webhook endpoint, delete HTTP proxy)

**Files:** Modify: `functions/index.js`, `functions/package.json`; Modify: `functions/README.md` (Task 25 updates docs fully)

- [x] **Step 1: Replace `functions/index.js` with:**

```js
"use strict";

const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { handleProxyInvocation } = require("./proxy.js");
const { makeEnforceAiChatLimit } = require("./limits.js");
const { processWebhookEvent } = require("./webhook.js");

const moneyLineApiKey = defineSecret("MONEYLINE_API_KEY");
const revenueCatWebhookSecret = defineSecret("REVENUECAT_WEBHOOK_SECRET");

initializeApp();

exports.moneylineProxy = onCall(
  {
    region: "us-central1",
    enforceAppCheck: true,
    secrets: [moneyLineApiKey]
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Sign-in is required.");
    }
    return handleProxyInvocation({
      data: request.data,
      uid: request.auth.uid,
      apiKey: moneyLineApiKey.value(),
      fetchImpl: fetch,
      enforceLimit: makeEnforceAiChatLimit(getFirestore())
    });
  }
);

exports.revenuecatWebhook = onRequest(
  {
    region: "us-central1",
    secrets: [revenueCatWebhookSecret]
  },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({ error: { message: "Method not allowed." } });
      return;
    }
    const authHeader = req.get("Authorization") || "";
    if (authHeader !== `Bearer ${revenueCatWebhookSecret.value()}`) {
      res.status(401).json({ error: { message: "Unauthorized." } });
      return;
    }
    try {
      const result = await processWebhookEvent(getFirestore(), req.body?.event);
      res.status(200).json({ result });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Webhook processing failed.";
      res.status(400).json({ error: { message } });
    }
  }
);
```

`moneylineProxyHttp` is gone (the spec deletes it). `firebase-admin` is already in package.json.

- [x] **Step 2: Boot-verify (pre-push runtime rule).** `cd functions && node -e "require('./index.js'); console.log('functions module loaded OK')"` — must print OK with no `Cannot find module`/throw. (Secrets resolve lazily; module load catches wiring errors.)
- [x] **Step 3: Run all tests.** `npm test` — PASS.
- [x] **Step 4: Deploy gate note.** Do NOT deploy yet — deploy happens in Task 24 ordering (functions live before app relies on them). Old clients use `moneylineProxyHttp`, so deletion timing matters: deploying this removes the old endpoint and breaks the current Swift app build in the store. **Surface this to the user at Task 24** — they choose the cutover moment.

---

### Task 5: Scaffold the Expo app

**Files:** Create: `package.json`, `app.json`, `eas.json`, `tsconfig.json`, `babel.config.js`, `app/_layout.tsx`, `app/index.tsx`, `src/` skeleton; Modify: `.gitignore`

- [x] **Step 1: Scaffold in a temp dir and hoist** (repo root is non-empty):

```bash
cd /tmp && npx create-expo-app@latest sportsgpt-rn --template default
cd /Users/colewarner/Desktop/Development/SportsGPTApp
rsync -a --exclude node_modules --exclude .git /tmp/sportsgpt-rn/ ./
npm install
```

- [x] **Step 2: Install dependencies:**

```bash
npx expo install @react-native-firebase/app @react-native-firebase/auth @react-native-firebase/app-check @react-native-firebase/functions react-native-purchases expo-speech-recognition @react-native-async-storage/async-storage expo-build-properties
npm install zustand
npm install --save-dev jest jest-expo @types/jest
```

- [x] **Step 3: Configure `app.json`:** name `SportsGPT`, slug `sportsgpt`, `ios.bundleIdentifier: "com.sportsgpt.juiced"`, `ios.buildNumber: "3"`, `version: "2.0.0"`, `ios.googleServicesFile: "./GoogleService-Info.plist"`, `ios.infoPlist` with `NSMicrophoneUsageDescription` and `NSSpeechRecognitionUsageDescription` (copy the strings from the Swift target's Info settings in `project.pbxproj`; if absent write: "SportsGPT uses the microphone so you can ask questions by voice." / "SportsGPT converts your speech to text to fill in your question."), plugins: `@react-native-firebase/app`, `@react-native-firebase/app-check`, `expo-speech-recognition`, and `expo-build-properties` with `{ "ios": { "useFrameworks": "static", "deploymentTarget": "16.4" } }` (required by RN Firebase).
- [x] **Step 4: Create `eas.json`:**

```json
{
  "cli": { "appVersionSource": "remote" },
  "build": {
    "development": { "developmentClient": true, "distribution": "internal", "channel": "preview" },
    "preview": { "distribution": "internal", "channel": "preview" },
    "production": { "autoIncrement": true, "channel": "production" }
  },
  "submit": { "production": {} }
}
```

Set `runtimeVersion: { "policy": "fingerprint" }` in `app.json`.

- [x] **Step 5: Jest config** in `package.json`: `"jest": { "preset": "jest-expo", "testPathIgnorePatterns": ["functions/"] }` and script `"test": "jest"`.
- [x] **Step 6: Update `.gitignore`:** add `node_modules/` already present; add `.expo/`, `ios/`, `android/` (CNG — native dirs are generated), `*.jks`, `.env*` at root scope, keep existing entries.
- [x] **Step 7: Verify the scaffold boots.** `npx expo prebuild --platform ios --clean && npx expo run:ios` (or `npx expo start` + dev client if already built). Expected: default template renders in simulator. This also validates the Firebase plugin config compiles. If no simulator available, minimum bar: `npx tsc --noEmit` passes and `npx expo prebuild` succeeds.

---

### Task 6: Theme module

**Files:** Create: `src/theme.ts`

- [x] **Step 1: Transcribe the exact palette** from `SportsGPT/ContentView.swift:3543-3559` (the color extension block) into `src/theme.ts` as named hex constants (e.g. `accentLime = "#D2F23F"`, plus the beige/tan surfaces, dark header, bubble colors — copy every color defined there, converting SwiftUI `Color(red:green:blue:)` components to hex). Also export font sizing constants used repeatedly (headline 22, body 15).
- [x] **Step 2: Verify** `npx tsc --noEmit` passes.

---

### Task 7: API types (`src/api/types.ts`)

**Files:** Create: `src/api/types.ts`

- [x] **Step 1: Port the wire types** from `SportsGPT/SportsGPTModels.swift` (lines 772-1142) to TypeScript interfaces. All fields optional unless the Swift type is non-optional. Required types:

```ts
export interface MoneyLineChatRequest {
  context?: string | null;
  scope: string;                       // "large"
  responseFormat: string;              // "hybrid"
  filters?: { bookmakers: string[] };  // omit entirely when empty
  messages: { role: "user" | "assistant"; content: string }[];
}

export interface APIError { message?: string }

export interface MoneyLineAIResponse { success: boolean; data?: MoneyLineAIData; error?: APIError }
export interface BestBetsResponse { success: boolean; data?: BestBetEvent[]; error?: APIError }
export interface EventBestBetsResponse { success: boolean; data?: BestBetEvent; error?: APIError }

export interface BestBetEvent {
  eventId: string;
  leagueId?: string;
  sport?: string;
  startTime?: string;
  markets: { marketType: string; outcomes: Outcome[] }[];
}
export interface Outcome { name: string; bestOdds?: number; bookmakerId?: string; bookmakerName?: string }

export interface RecommendationInfo {
  recordIndex?: number | null;
  signalType?: string; signalLabel?: string;
  selection?: string; marketLabel?: string; market?: string; outcome?: string;
  point?: number | null; odds?: number | null; oddsDisplay?: string;
  bookmakerName?: string; bookmakerId?: string; sourceType?: string;
  confidence?: string; rationale?: string; reason?: string;
  metrics?: Record<string, unknown>;
  event?: { matchup?: string; startTime?: string };
}

export interface PresentationInfo {
  responseType?: string; headline?: string; summary?: string;
  confidence?: string; sourceLabel?: string;
  entity?: { matchup?: string };
  primaryPick?: RecommendationInfo; alternativePick?: RecommendationInfo;
  cards?: RecommendationInfo[];
}

export interface MoneyLineAIData {
  answer?: string;
  analysis?: { summary?: string; highlights?: string[] };
  presentation?: PresentationInfo;
  records?: Record<string, unknown>[];
  context?: unknown; sources?: unknown;
}
```

Plus the UI-side types (port of `AssistantPresentation`, `Recommendation`, `Fact`, `Confidence` from SportsGPTModels.swift:184-241) and `ChatMessage`:

```ts
export type Confidence = "high" | "medium" | "low";
export interface Fact { label: string; value: string }
export interface Recommendation {
  signalLabel?: string; selection: string; contextLabel?: string;
  eventStartTime?: Date; marketLabel?: string; oddsDisplay?: string;
  bookmakerName?: string; sourceType?: string; confidence?: Confidence;
  rationale?: string; facts: Fact[];
}
export interface AssistantPresentation {
  headline?: string; summary?: string; sourceLabel?: string;
  confidence?: Confidence; entityMatchup?: string;
  primaryPick?: Recommendation; alternativePick?: Recommendation;
  cards: Recommendation[]; expandedExplanation?: string;
}
export interface ChatMessage {
  id: string; role: "user" | "assistant"; text: string;
  includeInAPIRequest: boolean; assistantPresentation?: AssistantPresentation;
}
```

Cross-check every field name against the Swift `CodingKeys` while porting — JSON keys must match the wire format exactly.
- [x] **Step 2: Verify** `npx tsc --noEmit`.

---

### Task 8: Formatters (TDD)

**Files:** Create: `src/api/format.ts`; Test: `src/api/__tests__/format.test.ts`

- [x] **Step 1: Write failing tests** covering, at minimum (port exact behavior from `SportsGPTModels.swift:1736-2001` — read that range first and add a test per branch you find):

```ts
import { formatAmericanOdds, percentText, shortISODateTime, easternEventTime, cardFriendlyTitle, cleanedTeamName, readableLabel } from "../format";

test("american odds", () => {
  expect(formatAmericanOdds(118)).toBe("+118");
  expect(formatAmericanOdds(-145)).toBe("-145");
  expect(formatAmericanOdds(0)).toBe("0");
});
test("percent text handles fractional and whole inputs", () => {
  expect(percentText(0.062)).toBe("6.2%");
  expect(percentText(6.2)).toBe("6.2%");
});
test("card friendly market titles", () => {
  expect(cardFriendlyTitle("moneyline")).toBe("Moneyline");
  expect(cardFriendlyTitle("player_points")).toBe("Player Points");
});
test("cleaned team name strips slashes", () => {
  expect(cleanedTeamName("Team A/Team B")).toBe("Team ATeam B"); // match Swift behavior exactly — verify against cleanedTeamName impl
});
test("eastern event time", () => {
  expect(easternEventTime(new Date("2026-06-12T23:00:00Z"))).toBe("Fri Jun 12 at 7:00 PM ET");
});
test("shortISODateTime parses ISO8601", () => {
  expect(shortISODateTime("2026-06-12T23:00:00Z")).toMatch(/Jun 12/);
});
```

Before finalizing assertions, READ the Swift implementations and mirror them precisely (e.g. `percentText` treats values ≥1 as already-percent; `cleanedTeamName` removes slashes — confirm whether it inserts a space). Adjust expected values to match Swift, not the guesses above.
- [x] **Step 2: Run** `npx jest src/api/__tests__/format.test.ts` — FAIL.
- [x] **Step 3: Implement `src/api/format.ts`** porting each Swift extension (`formatAmericanOdds`, `percentText`, `moneyText`, `shortISODateTime`, `sportsbookEasternTimeText` → `easternEventTime` using `Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", ... })`, `readableLabel`, `cardFriendlyTitle` with its special-case market map, `cardFriendlyMatchup`, `cardFriendlyOutcome`, `cleanedTeamName`, `cleanSentenceSpacing`, `normalizedBetSelection`, `trimmedNilIfEmpty` → `trimmedOrUndefined`).
- [x] **Step 4: Run tests** — PASS.

---

### Task 9: Presentation transformer (TDD)

**Files:** Create: `src/api/presentation.ts`; Test: `src/api/__tests__/presentation.test.ts`

This is the largest porting risk: `MoneyLineAIData.formattedAnswer` + `assistantPresentation` + `RecommendationInfo.assistantRecommendation()` + dedup (`SportsGPTModels.swift:1048-1316`).

- [x] **Step 1: Write failing tests** with realistic fixture payloads:

```ts
import { formattedAnswer, toAssistantPresentation } from "../presentation";

const fullPayload = { /* a realistic MoneyLineAIData with presentation: headline, summary,
  primaryPick { selection, market: "moneyline", odds: 118, bookmakerName, metrics: { edge: 0.03, ev: 0.05 } },
  alternativePick, cards: [duplicate of primaryPick, plus one unique card] */ };

test("formattedAnswer prefers presentation.summary → headline → answer → analysis.summary", () => {
  expect(formattedAnswer({ answer: "a", presentation: { summary: "s" } })).toBe("s");
  expect(formattedAnswer({ answer: "a", presentation: { headline: "h" } })).toBe("h");
  expect(formattedAnswer({ answer: "a" })).toBe("a");
  expect(formattedAnswer({ analysis: { summary: "as" } })).toBe("as");
});

test("primary pick maps selection, odds display, facts from metrics", () => {
  const p = toAssistantPresentation(fullPayload)!;
  expect(p.primaryPick!.selection).toBeTruthy();
  expect(p.primaryPick!.oddsDisplay).toBe("+118");
  expect(p.primaryPick!.facts.map(f => f.label)).toEqual(expect.arrayContaining(["Edge", "EV"]));
});

test("cards matching primary/alternative dedup key are removed from supporting cards", () => {
  const p = toAssistantPresentation(fullPayload)!;
  // fixture has 2 cards, one duplicating the primary pick
  expect(p.cards).toHaveLength(1);
});

test("no presentation payload returns undefined", () => {
  expect(toAssistantPresentation({ answer: "plain" })).toBeUndefined();
});
```

Build `fullPayload` by reading the Swift transformation and constructing a payload that exercises: selection normalization from outcome+point, over/under handling, implicit moneyline labeling, metric pill construction (edge/EV/implied/model), dedup key (selection+market+odds+bookmaker), and event start-time parsing.
- [x] **Step 2: Run — FAIL.**
- [x] **Step 3: Implement `src/api/presentation.ts`** as a line-faithful port of SportsGPTModels.swift:1048-1316, using Task 8 formatters. Key functions: `formattedAnswer(data)`, `toAssistantPresentation(data)`, internal `toRecommendation(info, records)`, `dedupKey(rec)`.
- [x] **Step 4: Run tests — PASS.** Add cases for every conditional branch you ported (target: each `if` in the Swift mapping has a test exercising both sides where feasible).

---

### Task 10: Firebase bootstrap + MoneyLine client

**Files:** Create: `src/api/firebase.ts`, `src/api/moneylineClient.ts`; Test: `src/api/__tests__/moneylineClient.test.ts`

- [x] **Step 1: `src/api/firebase.ts`:**

```ts
import { firebase } from "@react-native-firebase/app-check";
import auth from "@react-native-firebase/auth";
import Purchases from "react-native-purchases";

export const REVENUECAT_IOS_API_KEY = "appl_BvJoKxnxXfCaydUglCnEpRkfWFu"; // public SDK key, same as Swift AppServices.plist
export const ENTITLEMENT_ID = "SportsGPT Pro";

export async function bootstrapFirebase(): Promise<string> {
  Purchases.configure({ apiKey: REVENUECAT_IOS_API_KEY });
  const provider = firebase.appCheck().newReactNativeFirebaseAppCheckProvider();
  provider.configure({
    apple: { provider: __DEV__ ? "debug" : "appAttestWithDeviceCheckFallback", debugToken: process.env.EXPO_PUBLIC_APPCHECK_DEBUG_TOKEN },
    android: { provider: "playIntegrity" }
  });
  await firebase.appCheck().initializeAppCheck({ provider, isTokenAutoRefreshEnabled: true });

  const user = auth().currentUser ?? (await auth().signInAnonymously()).user;
  await Purchases.logIn(user.uid);
  return user.uid;
}
```

- [x] **Step 2: Write failing client tests** (mock `@react-native-firebase/functions`): aiChat passes `{ operation: "aiChat", body: payload }`; bestBets passes limit/bookmaker; eventBestBets requires eventId; a callable rejection with `code: "functions/resource-exhausted"` and `details.code === "free-limit-reached"` maps to `FreeLimitReachedError`; `success: false` envelope maps to `ServerError(message)`.
- [x] **Step 3: Implement `src/api/moneylineClient.ts`:**

```ts
import functions from "@react-native-firebase/functions";
import type { MoneyLineChatRequest, MoneyLineAIData, BestBetEvent, MoneyLineAIResponse, BestBetsResponse, EventBestBetsResponse } from "./types";

export class FreeLimitReachedError extends Error {}
export class ServerError extends Error {}
export class EmptyResponseError extends Error {}

const callable = () => functions().httpsCallable("moneylineProxy");

async function call<T extends { success: boolean; error?: { message?: string } }>(payload: Record<string, unknown>): Promise<T> {
  try {
    const result = await callable()(payload);
    const envelope = result.data as T;
    if (!envelope.success) throw new ServerError(envelope.error?.message ?? "The MoneyLine request failed.");
    return envelope;
  } catch (e: any) {
    if (e?.code === "functions/resource-exhausted" && e?.details?.code === "free-limit-reached") throw new FreeLimitReachedError();
    if (e instanceof ServerError) throw e;
    if (e?.code === "functions/unauthenticated" || e?.code === "functions/failed-precondition" || e?.code === "functions/permission-denied") {
      throw new ServerError("SportsGPT couldn't reach the MoneyLine proxy. Please make sure you're on the latest build and try again.");
    }
    throw new ServerError(e?.message ?? "The MoneyLine AI response was invalid.");
  }
}

export async function sendChat(payload: MoneyLineChatRequest): Promise<MoneyLineAIData> {
  const r = await call<MoneyLineAIResponse>({ operation: "aiChat", body: payload });
  if (!r.data) throw new EmptyResponseError("MoneyLine AI returned an empty response.");
  return r.data;
}
export async function fetchBestBets(limit: number, bookmaker?: string): Promise<BestBetEvent[]> {
  const r = await call<BestBetsResponse>({ operation: "bestBets", limit, ...(bookmaker ? { bookmaker } : {}) });
  return r.data ?? [];
}
export async function fetchEventBestBets(eventId: string, bookmaker?: string): Promise<BestBetEvent> {
  const r = await call<EventBestBetsResponse>({ operation: "eventBestBets", eventId, ...(bookmaker ? { bookmaker } : {}) });
  if (!r.data) throw new EmptyResponseError("MoneyLine AI returned an empty response.");
  return r.data;
}
```

- [x] **Step 4: Run tests — PASS.**

---

### Task 11: Fallback heuristics module (TDD)

**Files:** Create: `src/api/moneylineFallbacks.ts`; Test: `src/api/__tests__/moneylineFallbacks.test.ts`

Line-faithful port of `SportsGPT/MoneyLineService.swift` private helpers. This module is DELETABLE once the MoneyLine API ships the follow-up contract — keep all heuristics here, nothing elsewhere.

- [x] **Step 1: Write failing tests:**
  - `resolveEvent("are the celtics good tonight", events)` returns the Celtics event (full-name containment scores ≥ token match); multi-word team names outrank 4+-char token matches; no match → undefined. (Port scoring exactly: full name → `max(2, wordCount*3)`, token ≥4 chars → 2.)
  - `enrichMessages` appends `For event resolution, this refers to the X vs Y game.` to the last user message only when a matchup resolves.
  - `shouldRetryAsEventRecommendation`: answer containing "don't see"/"do not see"/"need" AND question containing " game"/"tonight" → true; otherwise false.
  - `shouldFallbackToEventBestBets`: "don't see"/"do not see" in answer OR empty records → true.
  - `buildFallbackResponse(event, ...)` synthesizes: answer sentence naming the top moneyline outcome + odds + book; presentation with `responseType: "event_recommendation"`, primary pick, alternative pick when a second outcome exists, cards (≤2 outcomes per market), records array; throws EmptyResponseError when no moneyline market.
- [x] **Step 2: Run — FAIL.**
- [x] **Step 3: Implement** by porting `resolveEvent`, `resolveMatchup`, `enrich`, `eventResolutionMessages`, `shouldRetryAsEventRecommendation`, `shouldFallbackToEventBestBets`, `fallbackEventResponse` (→ `buildFallbackResponse`, pure: takes the fetched `BestBetEvent`, returns `MoneyLineAIData`), and the `matchup` derivation from a `BestBetEvent`'s moneyline outcomes (port the Swift `BestBetEvent.matchup` extension into this module).
- [x] **Step 4: Run tests — PASS.**

---

### Task 12: MoneyLine service orchestration (TDD)

**Files:** Create: `src/api/moneylineService.ts`; Test: `src/api/__tests__/moneylineService.test.ts`

- [x] **Step 1: Write failing tests** with a mocked client module, mirroring `MoneyLineService.send` (`MoneyLineService.swift:21-79`):
  - sends only the last 6 includable messages; bookmaker filter only when selection non-empty; single-bookmaker passes `bookmaker` to best-bets calls.
  - happy path returns primary response untouched.
  - retry path: primary answer "I don't see that game" + question "who wins the celtics game tonight" → second sendChat with `context: "event_best_available_bet"` and the "This is specifically the X vs Y game." message.
  - fallback path: retry still empty-looking → `fetchEventBestBets` called and synthesized response returned.
  - server error "matches multiple games" during retry → fallback; other server errors rethrow.
  - `fetchSuggestedPromptSeed`: 8 best bets → up to 4 deduped dynamic prompts + static "best bet today" first.
- [x] **Step 2: Run — FAIL.**
- [x] **Step 3: Implement `src/api/moneylineService.ts`** orchestrating client + fallbacks, exporting `sendMessages(messages, selectedBookmakers, bestBetEvents)` and `fetchSuggestedPromptSeed(selectedBookmakers)`. Port `SuggestedPrompt` construction from the Swift `SuggestedPrompt.init(bestBet:)` (read it in SportsGPTModels.swift before implementing).
- [x] **Step 4: Run tests — PASS.**

---

### Task 13: Subscription store (zustand + RevenueCat, live prices)

**Files:** Create: `src/state/subscriptionStore.ts`; Test: `src/state/__tests__/subscriptionStore.test.ts`

- [x] **Step 1: Write failing tests** (mock react-native-purchases): state mapping from CustomerInfo (entitlement "SportsGPT Pro" active+trial → `activeTrial`, active → `activeSubscriber`, else `neverSubscribed`); `planPrices` populated from offerings packages' `product.priceString` keyed by plan kind (ANNUAL/LIFETIME/MONTHLY package types); offerings failure → prices undefined, plans still listed; purchase success refreshes state; `paywallContext` set/cleared.
- [x] **Step 2: Run — FAIL.**
- [x] **Step 3: Implement.** Port the `SubscriptionState` copy strings (statusTitle/statusDetail/ctaTitle/badge/plan/billing/timing/manage fields) from SportsGPTModels.swift:320-510 as pure functions of state. Plans: Yearly (most popular, default-selected), Lifetime, Monthly — titles/descriptions ported, **prices exclusively from offerings** (`package.product.priceString`); when unavailable render plan without price. Keep `freeRequestCountLocal` in AsyncStorage for "X free asks left" copy only — server is authoritative. `recordLocalAsk()`, `presentPaywall(context)`, `dismissPaywall()`, `purchase(planKind)`, `restore()`, `refresh()` (CustomerInfo on launch), `areChatAdsEnabled` persisted.
- [x] **Step 4: Run tests — PASS.**

---

### Task 14: Chat store

**Files:** Create: `src/state/chatStore.ts`; Test: `src/state/__tests__/chatStore.test.ts`

- [x] **Step 1: Write failing tests** (mock moneylineService): initial welcome message (`includeInAPIRequest: false`, text "Ask me anything betting related!"); `sendMessage` appends user msg, sets `isLoading`, appends assistant msg with `formattedAnswer` text + `assistantPresentation`, returns true; `FreeLimitReachedError` → returns `"limit"` sentinel (no assistant message, user message removed or marked); service error → assistant error-text message, returns false; `loadSuggestedPrompts` populates prompts + cached events; `shouldShowSuggestedPrompts` true only when ≤1 message and prompts exist; sportsbook selection changes re-seed prompts.
- [x] **Step 2: Run — FAIL.**
- [x] **Step 3: Implement** porting `SportsGPTViewModel` (SportsGPTModels.swift:15-131): state `{ messages, input, isLoading, isLoadingSuggestedPrompts, selectedSportsbooks: Set<string>, suggestedPrompts, suggestedBestBetEvents }`, the computed helpers (`canSend`, `sportsbookSummary`), and the send flow. Also create the static `SPORTSBOOKS` list — port all 40 `{ id, name, apiValue }` entries verbatim from SportsGPTModels.swift:276-317 into `src/api/sportsbooks.ts`.
- [x] **Step 4: Run tests — PASS.**

---

### Tasks 15-22: UI port (component per task, no new business logic)

All business logic already lives in stores/services with tests; these tasks are visual ports. For EACH task: read the referenced Swift lines first, match layout/copy/colors via `src/theme.ts`, then verify in the simulator (`npx expo start`) before checking the box. No unit tests for pure presentation components; any conditional display logic belongs in the store (move it there + test it if you find some).

**Task 15 — App shell & gating.** Files: `app/_layout.tsx`, `app/index.tsx`, `src/features/onboarding/LaunchScreen.tsx`. Root layout runs `bootstrapFirebase()`, `subscriptionStore.refresh()`, shows LaunchScreen ≥0.85s (port ContentView.swift:59-63, 424), then routes: `!hasSeenIntroExperience` → intro; `!hasCompletedOnboarding` → onboarding; else chat. Persist both flags in AsyncStorage (`hasSeenIntroExperience`, `hasCompletedOnboarding`).
- [x] Step 1: implement shell + gating. Step 2: simulator-verify the three gate states by clearing AsyncStorage.

**Task 16 — Intro carousel.** Files: `src/features/onboarding/IntroCarousel.tsx`. Port the 3 slides (ContentView.swift:1724-2000): copy, imagery (reuse `assets/` wordmark from `SportsGPT/Assets.xcassets` — copy PNGs into `assets/`), page dots, CTA setting `hasSeenIntroExperience`.
- [x] Step 1: implement. Step 2: simulator-verify all 3 slides + CTA.

**Task 17 — Onboarding wizard.** Files: `src/features/onboarding/OnboardingWizard.tsx`. Port the 5 steps (ContentView.swift:3191-3462): Quick Start, Answer Style, Rate prompt, Books (writes `chatStore.selectedSportsbooks`), Apply Filters; completion sets `hasCompletedOnboarding` and (non-premium) presents paywall (port of post-onboarding gate at ContentView.swift:504).
- [x] Step 1: implement. Step 2: simulator-verify full wizard → paywall hand-off.

**Task 18 — Chat screen core.** Files: `src/features/chat/ChatScreen.tsx`, `MessageList.tsx`, `ChatBubble.tsx`, `ThinkingIndicator.tsx`, `Composer.tsx`. Port header (title taps open paywall for free users — ContentView.swift:139-141), message list, user/assistant bubbles (ContentView.swift:1644-1680), thinking phrases cycling ~1.2s (ContentView.swift:27-88), composer with send gating: `canSend` + `subscriptionStore` check → on `FreeLimitReachedError` or local-limit, `presentPaywall("requestLimitReached")` (port sendMessage gate ContentView.swift:378-450). Markdown fallback rendering: implement a minimal bold/list/paragraph renderer in `MessageMarkdownText.tsx` mirroring the Swift one — no markdown library unless the Swift version's behavior demands it.
- [x] Step 1: implement. Step 2: simulator-verify send → thinking → response with live backend (after Task 24 deploy use prod; before that point the dev app at the emulator or temporarily at the old endpoint — acceptable to defer live verification to Task 24's checklist).

**Task 19 — Presentation cards + metric explainers.** Files: `src/features/chat/AssistantPresentationView.tsx`, `RecommendationBlock.tsx`, `MetricExplainerSheet.tsx`. Port ContentView.swift:2155-2327 (headline, summary, primary/alternative blocks, supporting cards, expanded explanation) and 2568-2710 (Edge/EV/Implied/Model explainer sheets with their exact copy). Fact pills tappable → sheet.
- [x] Step 1: implement. Step 2: simulator-verify with a fixture-injected message (add a `__DEV__`-only store helper to inject a canned presentation message).

**Task 20 — Suggested prompts + sportsbook filter.** Files: `src/features/chat/SuggestedPromptsRow.tsx`, `src/features/settings/SportsbookFilterSheet.tsx`. Port ContentView.swift:2941-2987 (horizontal chips, loading state) and 3053-3175 (modal: search, All Books action, multi-select with count).
- [x] Step 1: implement. Step 2: simulator-verify selection re-seeds prompts.

**Task 21 — Voice input.** Files: `src/features/chat/useVoiceInput.ts` (+ mic button wiring in Composer). Port SpeechRecognizer semantics with expo-speech-recognition: mic visible only when recording or composer empty; toggle start/stop; transcript fills composer; the four error messages ported verbatim from SpeechRecognizer.swift:21-32.
- [x] Step 1: implement. Step 2: device-verify (simulator speech support is unreliable — physical-device check or defer to Task 24 checklist with a note).

**Task 22 — Paywall, account, ads, legal.** Files: `src/features/paywall/PaywallScreen.tsx`, `src/features/settings/AccountSettingsSheet.tsx`, `AdPreferencesSheet.tsx`, `LegalScreen.tsx`, `src/features/chat/PromotionCard.tsx`. Port ContentView.swift:697-1264 (paywall: context-aware eyebrow/copy, 3 plan rows with live `planPrices`, default Yearly, 5s-delayed "Not now", purchase/restore via subscriptionStore), 565-566 + account menu (lines 136-212), ad preferences toggle, legal screens (1535-1641), Rebet promo card under assistant replies for free users with ads enabled.
- [x] Step 1: implement. Step 2: simulator-verify paywall contexts (standard, requestLimitReached, active-subscriber variants via store injection) and that prices render from mocked offerings in dev.

---

### Task 23: Full test pass + type check

- [x] **Step 1:** `npx tsc --noEmit` — clean.
- [x] **Step 2:** `npx jest` — all app suites PASS.
- [x] **Step 3:** `cd functions && npm test` — all functions suites PASS.
- [x] **Step 4:** `npx expo prebuild --platform ios --clean && npx expo run:ios` — app boots to launch→gate flow in simulator.

---

### Task 24: Deploy functions + EAS setup + live verification (USER-COORDINATED CUTOVER)

**⚠️ Deploying deletes `moneylineProxyHttp`, which the live Swift app uses. Ask the user to confirm cutover timing before Step 2.**

- [x] **Step 1: Set secrets:** `npx firebase-tools functions:secrets:set REVENUECAT_WEBHOOK_SECRET --project <id>` (generate: `openssl rand -hex 32`; also paste into RevenueCat dashboard → Webhooks with URL `https://us-central1-<id>.cloudfunctions.net/revenuecatWebhook`, Authorization `Bearer <secret>`). `MONEYLINE_API_KEY` already exists.
- [x] **Step 2 (after user confirms):** `npx firebase-tools deploy --only functions --project <id>`. **Never use `firebase deploy` for Firestore indexes** (CLAUDE.md rule; none needed here — `users/{uid}` is direct doc access, no composite index).
- [x] **Step 3: Post-deploy smoke tests (mandatory):**
  - Callable without App Check/auth must now fail: `curl -s -X POST https://us-central1-<id>.cloudfunctions.net/moneylineProxy -H 'Content-Type: application/json' -d '{"data":{"operation":"bestBets"}}'` → expect `401`/`403`-class error JSON, NOT a 200.
  - Webhook rejects bad secret: `curl -s -o /dev/null -w "%{http_code}\n" -X POST .../revenuecatWebhook -H 'Authorization: Bearer wrong' -d '{}'` → `401`.
  - From the dev-client app (real App Check debug token + anon auth): suggested prompts load (bestBets round-trip) and a chat message returns an answer (aiChat round-trip), and the 11th ask on a fresh anonymous user trips the paywall (set `FREE_REQUEST_LIMIT` check by sending 11 cheap asks or temporarily reading the Firestore doc).
- [x] **Step 4: EAS:** `npx eas init` (links/creates the Expo project — user account interaction likely; surface any login prompt to the user), `npx eas build --profile development --platform ios` for the dev client, then verify OTA: `npx eas update --branch preview --message "smoke"` and confirm the dev build fetches it.
- [x] **Step 5: RevenueCat webhook end-to-end:** make a sandbox purchase in the dev build, confirm `users/{uid}.isPremium` flips to `true` in Firestore, and that the 10-ask limit no longer applies to that user.

---

### Task 25: Delete the Swift app + docs

- [x] **Step 1:** `git rm -r SportsGPT SportsGPT.xcodeproj SportsGPTTests SportsGPTUITests` — ONLY after Tasks 15-24 are fully checked (the Swift code is the porting reference).
- [x] **Step 2:** Rewrite `functions/README.md`: callable-only (`moneylineProxy` with App Check + auth enforced), `revenuecatWebhook` setup, secrets list, remove `moneylineProxyHttp` and stale iOS-config sections. Write a root `README.md`: Expo app overview, dev setup (GoogleService-Info.plist + .firebaserc prerequisites, dev client, `npm test`), EAS build/update commands, release process (OTA for JS, store build for native changes).
- [x] **Step 3:** Final `.gitignore` audit: `GoogleService-Info.plist`, `.firebaserc`, `.expo/`, `ios/`, `android/`, `functions/node_modules/` all covered; remove stale `SportsGPT/Configuration/AppServices.local.plist` entry.
- [x] **Step 4:** `npx tsc --noEmit && npx jest && (cd functions && npm test)` — still green after deletion.

---

### Task 26: Code review + single commit + land

- [x] **Step 1:** Invoke `superpowers:code-reviewer` on the full diff (backend changed → review is mandatory before push per CLAUDE.md). Fix findings in place (same commit, no "review fixes" commit).
- [x] **Step 2:** ONE commit containing everything (spec doc, plan doc, RN app, functions, deletions):

```bash
git add -A
git commit -m "Rebuild SportsGPT as Expo/React Native app with OTA updates and hardened MoneyLine proxy"
```

- [x] **Step 3:** Push branch, open PR to `main`, squash-merge after review passes. Report push destination explicitly ("Pushed to **SportsGPTApp** `feat/react-native-rebuild`", then the merge).
- [x] **Step 4:** Post-merge: re-run the Task 24 Step 3 smoke tests against prod once more; report results.
