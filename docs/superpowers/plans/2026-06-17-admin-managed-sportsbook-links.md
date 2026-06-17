# Admin-managed sportsbook links — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace SportsGPT's broken hardcoded Rebet card with working, admin-managed sportsbook links from Juiced — linking each recommendation to its book's link, falling back to Rebet.

**Architecture:** Tag existing Juiced `Promo` rows with a canonical `bookmaker_id`; expose them at a new public `GET /v1/promos/sportsbook-links`; curate the mapping from a new Juiced admin page; consume + cache the feed in SportsGPT and pick the recommended book's link in `PromotionCard`.

**Tech Stack:** NestJS + Prisma (Mongo) backend, React + Vite + react-router admin, React Native (Expo) app, Jest.

---

## ⚠️ Commit & process rules (override skill defaults)

- **One commit per repo, at the very end of that repo's work.** Do NOT commit per task or per phase. Track progress with TodoWrite. Final history = one commit in Juiced_Backend, one in Juiced_admin, one in SportsGPTApp.
- **Deploy order (full-stack rule):** Juiced_Backend must be pushed, deployed, and verified live (base 200 + `GET /v1/promos/sportsbook-links` returns non-5xx) **before** the Juiced_admin page is pushed. SportsGPTApp is an EAS app build and ships on its own cadence, but only after the endpoint is live.
- **Backend push gates:** `npm run build` + boot-verify to "application started" + code review (`/code-review`) before any push to `main`. Use a worktree if any sibling session may touch the repo.
- Juiced_Backend / Juiced_admin live under `Juiced-Full-Stack/` — always `cd` into the specific repo; never run git at the Full Stack parent.

---

## File structure

**Juiced_Backend** (`Juiced-Full-Stack/Juiced_Backend/`)
- Modify: `prisma/schema.prisma` (`model Promo`) — add `bookmaker_id String?`
- Modify: `src/modules/app/promos/promos.service.ts` — `getSportsbookLinks()`, normalize `bookmaker_id` in `upsertPromo`
- Modify: `src/modules/app/promos/promos.controller.ts` — `GET sportsbook-links`
- Create: `src/modules/app/promos/promos.service.spec.ts` — unit test for the new method

**Juiced_admin** (`Juiced-Full-Stack/Juiced_admin/`)
- Modify: `src/types.ts` — add `bookmaker_id?: string | null` to `Promo`
- Create: `src/constants/sportsbooks.ts` — canonical id/name list (mirrors SportsGPT)
- Create: `src/pages/SportsbookLinks.tsx` — the mapping page
- Modify: `src/App.tsx` — route
- Modify: `src/components/Layout.tsx` — nav link

**SportsGPTApp** (`SportsGPTApp/`)
- Modify: `src/api/types.ts` — add `bookmakerId?: string` to `Recommendation`
- Modify: `src/api/presentation.ts` — map `bookmakerId` in `toRecommendation`
- Create: `src/api/sportsbookLinks.ts` — fetch + cache + fallback client
- Create: `src/api/__tests__/sportsbookLinks.test.ts`
- Modify: `src/features/chat/PromotionCard.tsx` — data-driven card
- Create: `src/features/chat/__tests__/promotionCardSelection.test.ts` — selection logic
- Modify: `src/features/chat/ChatBubble.tsx` — pass recommended `bookmakerId`

---

# REPO A — Juiced_Backend

### Task A1: Add `bookmaker_id` to Promo schema

**Files:**
- Modify: `Juiced-Full-Stack/Juiced_Backend/prisma/schema.prisma` (`model Promo`)

- [ ] **Step 1: Add the field**

In `model Promo`, add the field next to `tag`:

```prisma
  tag                  String   @default("SPORTSBOOK")
  bookmaker_id         String?
```

And add an index near the bottom of the model (before the closing `}`), after the `submissions` relation line:

```prisma
  submissions PromoSubmission[]

  @@index([bookmaker_id])
```

- [ ] **Step 2: Regenerate the Prisma client**

Run (from `Juiced_Backend/`): `npx prisma generate`
Expected: "Generated Prisma Client" with no errors. (Mongo — no migration to apply.)

---

### Task A2: `getSportsbookLinks()` service method (TDD)

**Files:**
- Create: `Juiced-Full-Stack/Juiced_Backend/src/modules/app/promos/promos.service.spec.ts`
- Modify: `Juiced-Full-Stack/Juiced_Backend/src/modules/app/promos/promos.service.ts`

- [ ] **Step 1: Write the failing test**

Create `promos.service.spec.ts`:

```typescript
import { PromosService } from './promos.service';

describe('PromosService.getSportsbookLinks', () => {
  const makeService = (rows: any[]) => {
    const db = { promo: { findMany: jest.fn().mockResolvedValue(rows) } } as any;
    return new PromosService(db);
  };

  it('returns active mapped promos shaped for the app, one per bookmaker_id', async () => {
    const service = makeService([
      { bookmaker_id: 'draftkings', brand: 'DraftKings', url: 'https://dk', logo_url: 'https://dk.png', badge: 'LIVE', order: 0 },
      { bookmaker_id: 'draftkings', brand: 'DraftKings 2', url: 'https://dk2', logo_url: null, badge: 'LIVE', order: 1 },
      { bookmaker_id: 'rebet', brand: 'ReBet', url: 'https://rebet', logo_url: null, badge: 'LIVE', order: 2 },
    ]);

    const result = await service.getSportsbookLinks();

    expect(result).toEqual([
      { bookmakerId: 'draftkings', brand: 'DraftKings', url: 'https://dk', logoUrl: 'https://dk.png', badge: 'LIVE' },
      { bookmakerId: 'rebet', brand: 'ReBet', url: 'https://rebet', logoUrl: null, badge: 'LIVE' },
    ]);
  });

  it('queries only active, non-deleted, mapped promos ordered by order', async () => {
    const service = makeService([]);
    await service.getSportsbookLinks();
    const db = (service as any).db;
    expect(db.promo.findMany).toHaveBeenCalledWith({
      where: { deletedAt: null, is_active: true, bookmaker_id: { not: null } },
      orderBy: [{ order: 'asc' }, { updatedAt: 'asc' }, { id: 'asc' }],
    });
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run (from `Juiced_Backend/`): `npx jest src/modules/app/promos/promos.service.spec.ts`
Expected: FAIL — `getSportsbookLinks is not a function`.

- [ ] **Step 3: Implement the method**

In `promos.service.ts`, add this method to the `PromosService` class (e.g. after `findAll`):

```typescript
	async getSportsbookLinks() {
		const promos = await this.db.promo.findMany({
			where: { deletedAt: null, is_active: true, bookmaker_id: { not: null } },
			orderBy: [{ order: 'asc' }, { updatedAt: 'asc' }, { id: 'asc' }],
		});

		const seen = new Set<string>();
		const links: Array<{ bookmakerId: string; brand: string; url: string; logoUrl: string | null; badge: string }> = [];
		for (const p of promos) {
			const id = p.bookmaker_id as string;
			if (seen.has(id)) continue;
			seen.add(id);
			links.push({ bookmakerId: id, brand: p.brand, url: p.url, logoUrl: p.logo_url ?? null, badge: p.badge });
		}
		return links;
	}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `npx jest src/modules/app/promos/promos.service.spec.ts`
Expected: PASS (2 passing).

---

### Task A3: Public `GET /v1/promos/sportsbook-links` endpoint

**Files:**
- Modify: `Juiced-Full-Stack/Juiced_Backend/src/modules/app/promos/promos.controller.ts`

- [ ] **Step 1: Add the route**

Add this handler to `PromosController` (place it above the `@Get()` getAll handler so the static path is unambiguous). No `@Authorized` — it is public, like `revu-proxy`:

```typescript
	@Version('1')
	@Get('sportsbook-links')
	async getSportsbookLinks() {
		return this.promosService.getSportsbookLinks();
	}
```

- [ ] **Step 2: Verify it compiles**

Run (from `Juiced_Backend/`): `npm run build`
Expected: build succeeds, no TS errors.

---

### Task A4: Normalize `bookmaker_id` on write

**Files:**
- Modify: `Juiced-Full-Stack/Juiced_Backend/src/modules/app/promos/promos.service.ts` (`upsertPromo`)

- [ ] **Step 1: Add normalization**

In `upsertPromo`, after the `partnership_eligible` validation block and before the `const hasOrder = …` line, add:

```typescript
		if (payload.bookmaker_id !== undefined) {
			if (payload.bookmaker_id === null || payload.bookmaker_id === '') {
				payload.bookmaker_id = null;
			} else if (typeof payload.bookmaker_id === 'string') {
				payload.bookmaker_id = payload.bookmaker_id.trim().toLowerCase();
			} else {
				throw new BadRequestException('bookmaker_id must be a string');
			}
		}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: succeeds.

---

### Task A5: Land Juiced_Backend

- [ ] **Step 1: Full test + build + boot-verify**

Run (from `Juiced_Backend/`):
- `npx jest src/modules/app/promos` → all pass
- `npm run build` → succeeds
- Boot-verify: start the compiled app with stub env and confirm it reaches the Nest "application started"/"Nest application successfully started" log within ~30s (no `UnknownDependenciesException` / module-resolution errors). PromosModule already wires `DatabaseModule`; no new providers were added, so DI is unchanged.

- [ ] **Step 2: Code review**

Run `/code-review` on the diff. Address findings in-place (no separate commit).

- [ ] **Step 3: Commit (single commit for this repo) + push**

Include `prisma/schema.prisma`, both promos files, and the new spec. Push to `main` (the deploy branch) per project flow. Co-author trailer per global rules.

- [ ] **Step 4: Verify live (deploy gate)**

After the deploy job finishes:
- Base health: `curl -fsS https://api.juicedbets.io/v1/promos?activeOnly=true -o /dev/null -w "%{http_code}\n"` → `200`
- New endpoint: `curl -fsS https://api.juicedbets.io/v1/promos/sportsbook-links -o /dev/null -w "%{http_code}\n"` → non-5xx (200; `[]` body is fine until promos are tagged).

Report: "Pushed to **Juiced-Backend** `main`" + the two status codes. Do NOT proceed to the admin push until both pass.

---

# REPO B — Juiced_admin

### Task B1: Extend the Promo type

**Files:**
- Modify: `Juiced-Full-Stack/Juiced_admin/src/types.ts` (`interface Promo`)

- [ ] **Step 1: Add the field**

In `interface Promo`, add after `partnership_eligible?: boolean;`:

```typescript
	bookmaker_id?: string | null;
```

---

### Task B2: Canonical sportsbook constant

**Files:**
- Create: `Juiced-Full-Stack/Juiced_admin/src/constants/sportsbooks.ts`

- [ ] **Step 1: Create the list** (mirrors SportsGPT `src/api/sportsbooks.ts` ids/names)

```typescript
// Canonical sportsbook ids/names — must match SportsGPT's SPORTSBOOKS ids
// (SportsGPTApp/src/api/sportsbooks.ts). These are the bookmaker_id values the
// app sends with each recommendation.
export interface SportsbookOption {
	id: string;
	name: string;
}

export const SPORTSBOOKS: SportsbookOption[] = [
	{ id: 'draftkings', name: 'DraftKings' },
	{ id: 'fanduel', name: 'FanDuel' },
	{ id: 'betmgm', name: 'BetMGM' },
	{ id: 'caesars', name: 'Caesars' },
	{ id: 'betrivers', name: 'BetRivers' },
	{ id: 'espnbet', name: 'ESPN BET' },
	{ id: 'fanatics', name: 'Fanatics' },
	{ id: 'fliff', name: 'Fliff' },
	{ id: 'hardrockbet', name: 'Hard Rock Bet' },
	{ id: 'bet365_us', name: 'bet365 (US)' },
	{ id: 'pinnacle', name: 'Pinnacle' },
	{ id: 'ballybet', name: 'Bally Bet' },
	{ id: 'prizepicks', name: 'PrizePicks' },
	{ id: 'underdog', name: 'Underdog Fantasy' },
	{ id: 'kalshi', name: 'Kalshi' },
	{ id: 'polymarket', name: 'Polymarket' },
	{ id: 'rebet', name: 'Rebet (fallback)' },
];
```

---

### Task B3: SportsbookLinks page

**Files:**
- Create: `Juiced-Full-Stack/Juiced_admin/src/pages/SportsbookLinks.tsx`

Reuses `promoService.getSavedPromos()` (read) and `promoService.savePromo()` (write — sets `bookmaker_id` on a promo via the existing upsert). For each canonical sportsbook, an admin picks which existing promo represents it; saving sets that promo's `bookmaker_id` and clears it from any other promo that previously held it.

- [ ] **Step 1: Create the page**

```tsx
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { Promo } from '../types';
import { promoService } from '../api/promoService';
import { SPORTSBOOKS } from '../constants/sportsbooks';

const SportsbookLinks = () => {
	const [promos, setPromos] = useState<Promo[]>([]);
	const [saving, setSaving] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);

	const load = async () => {
		setLoading(true);
		try {
			setPromos(await promoService.getSavedPromos());
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => { load(); }, []);

	const promoForBook = (bookId: string) =>
		promos.find((p) => (p.bookmaker_id ?? null) === bookId) ?? null;

	const handleAssign = async (bookId: string, promoId: string) => {
		setSaving(bookId);
		try {
			// Clear any promo currently holding this book id, then set the new one.
			const current = promoForBook(bookId);
			if (current && current.id && current.id !== promoId) {
				await promoService.savePromo({ ...current, bookmaker_id: null });
			}
			if (promoId) {
				const next = promos.find((p) => p.id === promoId);
				if (next) await promoService.savePromo({ ...next, bookmaker_id: bookId });
			} else if (current && current.id) {
				await promoService.savePromo({ ...current, bookmaker_id: null });
			}
			await load();
		} catch (err) {
			alert(`Failed to save: ${err instanceof Error ? err.message : 'Unknown error'}`);
		} finally {
			setSaving(null);
		}
	};

	if (loading) {
		return <div className="p-8 flex items-center gap-2 text-gray-500"><Loader2 className="animate-spin" /> Loading…</div>;
	}

	return (
		<div className="p-8">
			<h1 className="text-2xl font-bold text-gray-900">Sportsbook Links</h1>
			<p className="mt-1 text-sm text-gray-500">
				Map each sportsbook to one of your existing promos. SportsGPT opens the
				mapped promo's link when it recommends a bet on that book, and falls back
				to Rebet otherwise. Reuses the links you manage on the Promos page.
			</p>

			<div className="mt-6 space-y-2">
				{SPORTSBOOKS.map((book) => {
					const selected = promoForBook(book.id);
					return (
						<div key={book.id} className="flex items-center gap-4 rounded-lg border border-gray-200 p-3">
							<div className="w-48 font-medium text-gray-800">{book.name}</div>
							<select
								className="flex-1 rounded-md border border-gray-300 p-2"
								value={selected?.id ?? ''}
								disabled={saving === book.id}
								onChange={(e) => handleAssign(book.id, e.target.value)}
							>
								<option value="">— No link (unmapped) —</option>
								{promos.map((p) => (
									<option key={p.id} value={p.id}>{p.brand} — {p.url}</option>
								))}
							</select>
							{saving === book.id && <Loader2 className="animate-spin text-gray-400" />}
							{selected && <a href={selected.url} target="_blank" rel="noreferrer" className="text-sm text-blue-600">open ↗</a>}
						</div>
					);
				})}
			</div>
		</div>
	);
};

export default SportsbookLinks;
```

- [ ] **Step 2: Verify build after wiring (run in Task B4)**

---

### Task B4: Route + nav

**Files:**
- Modify: `Juiced-Full-Stack/Juiced_admin/src/App.tsx`
- Modify: `Juiced-Full-Stack/Juiced_admin/src/components/Layout.tsx`

- [ ] **Step 1: Add the import + route in `App.tsx`**

Add with the other page imports:

```tsx
import SportsbookLinks from './pages/SportsbookLinks';
```

Add inside the authed `<Route path="/" …>` block, after the `promo-access` route:

```tsx
          <Route path="sportsbook-links" element={<SportsbookLinks />} />
```

- [ ] **Step 2: Add the nav link in `Layout.tsx`**

Inside the Promos `<nav>` group (after the `promo-access` `<Link>`), add:

```tsx
						<Link to="/sportsbook-links" className="flex items-center space-x-3 p-3 rounded-lg hover:bg-gray-100 text-gray-700 font-medium transition-colors">
							<span>Sportsbook Links</span>
						</Link>
```

- [ ] **Step 3: Build**

Run (from `Juiced_admin/`): `npm run build`
Expected: Vite + tsc build succeeds.

---

### Task B5: Land Juiced_admin

- [ ] **Step 1:** Confirm backend endpoint is live (Task A5 Step 4 passed). Do not land otherwise.
- [ ] **Step 2:** `npm run build` succeeds.
- [ ] **Step 3:** Single commit for this repo + push to `main`. Report: "Pushed to **Juiced-Admin** `main`".
- [ ] **Step 4:** After deploy, load the admin → Sportsbook Links page, assign one promo to `rebet` and one to `draftkings`, then confirm `GET /v1/promos/sportsbook-links` reflects both.

---

# REPO C — SportsGPTApp

### Task C1: Thread `bookmakerId` into the Recommendation model (TDD)

**Files:**
- Modify: `SportsGPTApp/src/api/types.ts` (`interface Recommendation`)
- Modify: `SportsGPTApp/src/api/presentation.ts` (`toRecommendation`)
- Modify: `SportsGPTApp/src/api/__tests__/presentation.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `presentation.test.ts` (mirror the existing test setup in that file for building `MoneyLineAIData`; assert the new field on the produced presentation's `primaryPick`):

```typescript
it("maps bookmakerId from the wire recommendation onto the primary pick", () => {
  const data = {
    presentation: {
      primaryPick: {
        selection: "Lakers ML",
        bookmakerId: "draftkings",
        bookmakerName: "DraftKings",
      },
    },
  } as any;
  const presentation = toAssistantPresentation(data);
  expect(presentation?.primaryPick?.bookmakerId).toBe("draftkings");
});
```

> Note: if the existing tests construct input differently, match their pattern; the assertion (`primaryPick?.bookmakerId === "draftkings"`) is what matters.

- [ ] **Step 2: Run it, verify it fails**

Run (from `SportsGPTApp/`): `npx jest src/api/__tests__/presentation.test.ts -t bookmakerId`
Expected: FAIL — `bookmakerId` is `undefined`.

- [ ] **Step 3: Add the field to the model**

In `src/api/types.ts`, `interface Recommendation`, add after `bookmakerName?: string;`:

```typescript
  bookmakerId?: string;
```

- [ ] **Step 4: Map it in `toRecommendation`**

In `src/api/presentation.ts`, in the object returned by `toRecommendation`, add after the `bookmakerName:` line:

```typescript
    bookmakerId: trimmedOrUndefined(info.bookmakerId)?.toLowerCase(),
```

- [ ] **Step 5: Run it, verify it passes**

Run: `npx jest src/api/__tests__/presentation.test.ts -t bookmakerId`
Expected: PASS.

---

### Task C2: Sportsbook links client (fetch + cache + fallback) (TDD)

**Files:**
- Create: `SportsGPTApp/src/api/sportsbookLinks.ts`
- Create: `SportsGPTApp/src/api/__tests__/sportsbookLinks.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import {
  __resetSportsbookLinksForTest,
  getLinkForBook,
  getFallbackLink,
  loadSportsbookLinks,
  REBET_FALLBACK,
} from "../sportsbookLinks";

describe("sportsbookLinks", () => {
  beforeEach(() => {
    __resetSportsbookLinksForTest();
    (global as any).fetch = jest.fn();
  });

  it("falls back to the bundled Rebet link before any load", () => {
    expect(getFallbackLink()).toEqual(REBET_FALLBACK);
    expect(getLinkForBook("draftkings")).toEqual(REBET_FALLBACK);
  });

  it("returns the mapped book link after a successful load", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => [
        { bookmakerId: "draftkings", brand: "DraftKings", url: "https://dk", logoUrl: null, badge: "LIVE" },
        { bookmakerId: "rebet", brand: "ReBet", url: "https://rebet", logoUrl: null, badge: "LIVE" },
      ],
    });

    await loadSportsbookLinks();

    expect(getLinkForBook("draftkings")?.url).toBe("https://dk");
    expect(getFallbackLink().url).toBe("https://rebet"); // feed Rebet overrides bundled
    expect(getLinkForBook("unmapped_book")?.url).toBe("https://rebet"); // unmapped → fallback
  });

  it("keeps the bundled fallback when the fetch fails", async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error("network"));
    await loadSportsbookLinks();
    expect(getFallbackLink()).toEqual(REBET_FALLBACK);
    expect(getLinkForBook("draftkings")).toEqual(REBET_FALLBACK);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx jest src/api/__tests__/sportsbookLinks.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the client**

```typescript
// Fetches admin-managed sportsbook links from Juiced and resolves the right link
// for a recommended book, falling back to Rebet. Cached in-memory + AsyncStorage.
import AsyncStorage from "@react-native-async-storage/async-storage";

export interface SportsbookLink {
  bookmakerId: string;
  brand: string;
  url: string;
  logoUrl: string | null;
  badge: string;
}

const ENDPOINT = "https://api.juicedbets.io/v1/promos/sportsbook-links";
const CACHE_KEY = "sportsbookLinks.cache.v1";
const TTL_MS = 60 * 60 * 1000; // 1h

// Bundled fallback so a first launch / offline never shows a dead link.
export const REBET_FALLBACK: SportsbookLink = {
  bookmakerId: "rebet",
  brand: "Rebet",
  url: "https://rebet.app",
  logoUrl: null,
  badge: "LIVE",
};

let links: SportsbookLink[] = [];
let loadedAt = 0;

export function __resetSportsbookLinksForTest() {
  links = [];
  loadedAt = 0;
}

function byId(id: string | undefined): SportsbookLink | undefined {
  if (!id) return undefined;
  const key = id.trim().toLowerCase();
  return links.find((l) => l.bookmakerId === key);
}

export function getFallbackLink(): SportsbookLink {
  return byId("rebet") ?? REBET_FALLBACK;
}

export function getLinkForBook(bookmakerId: string | undefined): SportsbookLink {
  return byId(bookmakerId) ?? getFallbackLink();
}

function isValid(data: unknown): data is SportsbookLink[] {
  return Array.isArray(data) && data.every((d) => d && typeof d.bookmakerId === "string" && typeof d.url === "string");
}

export async function loadSportsbookLinks(): Promise<void> {
  if (links.length && Date.now() - loadedAt < TTL_MS) return;

  // Warm from AsyncStorage first so the UI has something immediately.
  if (!links.length) {
    try {
      const cached = await AsyncStorage.getItem(CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (isValid(parsed)) links = parsed;
      }
    } catch {
      // ignore cache read errors
    }
  }

  try {
    const res = await fetch(ENDPOINT);
    if (!res.ok) return;
    const data = await res.json();
    if (isValid(data)) {
      links = data;
      loadedAt = Date.now();
      void AsyncStorage.setItem(CACHE_KEY, JSON.stringify(data));
    }
  } catch {
    // keep cached / bundled fallback on network or parse failure
  }
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `npx jest src/api/__tests__/sportsbookLinks.test.ts`
Expected: PASS (3 passing). The AsyncStorage mock is already configured project-wide (see `subscriptionStore.test.ts`); if this suite needs it explicitly, add at top: `jest.mock("@react-native-async-storage/async-storage", () => require("@react-native-async-storage/async-storage/jest/async-storage-mock"));`

- [ ] **Step 5: Kick off the load at app start**

In the app's existing startup path (where `subscriptionStore`/flags are hydrated — find the root `App` / bootstrap and follow the existing pattern), call `void loadSportsbookLinks();` once. Place it alongside the other one-time hydration calls. (Verify the call site by grepping for where subscription/app-flags hydrate.)

---

### Task C3: Data-driven PromotionCard (TDD on selection)

**Files:**
- Create: `SportsGPTApp/src/features/chat/__tests__/promotionCardSelection.test.ts`
- Modify: `SportsGPTApp/src/features/chat/PromotionCard.tsx`

The selection logic (which link to show) is extracted into a pure helper so it's unit-testable without rendering RN.

- [ ] **Step 1: Write the failing test**

```typescript
import { resolvePromotionLink } from "../PromotionCard";
import { __resetSportsbookLinksForTest, loadSportsbookLinks } from "../../../api/sportsbookLinks";

describe("resolvePromotionLink", () => {
  beforeEach(() => {
    __resetSportsbookLinksForTest();
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        { bookmakerId: "draftkings", brand: "DraftKings", url: "https://dk", logoUrl: null, badge: "LIVE" },
        { bookmakerId: "rebet", brand: "Rebet", url: "https://rebet", logoUrl: null, badge: "LIVE" },
      ],
    });
  });

  it("returns the recommended book's link when mapped", async () => {
    await loadSportsbookLinks();
    expect(resolvePromotionLink("draftkings").url).toBe("https://dk");
  });

  it("returns the Rebet fallback for an unmapped book or no recommendation", async () => {
    await loadSportsbookLinks();
    expect(resolvePromotionLink("betmgm").url).toBe("https://rebet");
    expect(resolvePromotionLink(undefined).url).toBe("https://rebet");
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx jest src/features/chat/__tests__/promotionCardSelection.test.ts`
Expected: FAIL — `resolvePromotionLink` not exported.

- [ ] **Step 3: Rewrite `PromotionCard.tsx`**

Replace the hardcoded `REBET_URL` and make the card data-driven. Full new file:

```tsx
// Rebet/sportsbook promotion card shown under assistant replies. Links to the
// recommended book's admin-managed link, falling back to Rebet.

import { Linking, Pressable, StyleSheet, Text, View } from "react-native";

import { getLinkForBook, type SportsbookLink } from "../../api/sportsbookLinks";
import { palette } from "../../theme";

export function resolvePromotionLink(bookmakerId: string | undefined): SportsbookLink {
  return getLinkForBook(bookmakerId);
}

interface Props {
  bookmakerId?: string;
}

export default function PromotionCard({ bookmakerId }: Props) {
  const link = resolvePromotionLink(bookmakerId);

  return (
    <View style={styles.card}>
      <Text style={styles.eyebrow}>Recommended Place To Bet</Text>

      <Text style={styles.title}>{link.brand}</Text>

      <Text style={styles.detail}>
        {"Place this bet with a sportsbook we trust. Must be 21+ and use 1-800-GAMBLER."}
      </Text>

      <Pressable
        style={({ pressed }) => [styles.linkButton, pressed && styles.pressed]}
        onPress={() => void Linking.openURL(link.url)}
        accessibilityRole="link"
      >
        <Text style={styles.linkButtonText}>{`Open ${link.brand}`}</Text>
        <Text style={styles.linkButtonArrow}>↗</Text>
      </Pressable>

      <Text style={styles.disclaimer}>Must be 21+ and use 1-800-GAMBLER.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 14,
    borderRadius: 20,
    backgroundColor: palette.panel,
    borderWidth: 1,
    borderColor: palette.border,
    alignSelf: "stretch",
    gap: 10,
  },
  eyebrow: { fontSize: 11, fontWeight: "900", color: palette.mutedInk },
  title: { fontSize: 18, fontWeight: "900", color: palette.ink },
  detail: { fontSize: 13, fontWeight: "500", color: palette.mutedInk, lineHeight: 18 },
  linkButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: palette.lime,
  },
  linkButtonText: { fontSize: 13, fontWeight: "700", color: palette.ink },
  linkButtonArrow: { fontSize: 11, fontWeight: "700", color: palette.ink },
  pressed: { opacity: 0.82 },
  disclaimer: { fontSize: 11, fontWeight: "700", color: palette.mutedInk },
});
```

> Note: this drops the static "Current promotion: 100% bonus…" copy, which was hardcoded for Rebet and would be wrong for other books. Keep the generic disclaimer. If per-book promo copy is wanted later, add a `promoText` field to the feed — out of scope here.

- [ ] **Step 4: Run it, verify it passes**

Run: `npx jest src/features/chat/__tests__/promotionCardSelection.test.ts`
Expected: PASS.

---

### Task C4: Pass the recommended book from ChatBubble

**Files:**
- Modify: `SportsGPTApp/src/features/chat/ChatBubble.tsx`

- [ ] **Step 1: Pass `bookmakerId` to the card**

Replace the `{showAd ? <PromotionCard /> : null}` line with:

```tsx
        {showAd ? (
          <PromotionCard bookmakerId={message.assistantPresentation?.primaryPick?.bookmakerId} />
        ) : null}
```

- [ ] **Step 2: Typecheck + full test run**

Run (from `SportsGPTApp/`):
- `npx tsc --noEmit` → no errors
- `npx jest` → all suites pass

---

### Task C5: Land SportsGPTApp

- [ ] **Step 1:** Confirm `GET /v1/promos/sportsbook-links` is live (Repo A landed).
- [ ] **Step 2:** `npx tsc --noEmit` clean + `npx jest` green.
- [ ] **Step 3:** Single commit for this repo. Push per the SportsGPT flow (this repo deploys functions via Firebase and ships the app via EAS; this change is app-only — no functions touched — so no backend deploy needed here). Report: "Pushed to **SportsGPTApp** `main`".
- [ ] **Step 4:** Note for release: the working links require an app build (EAS) to reach users; the endpoint + admin changes are live server-side immediately.

---

## Success criteria (verify at the end)

1. `GET https://api.juicedbets.io/v1/promos/sportsbook-links` returns the mapped books in `{ bookmakerId, brand, url, logoUrl, badge }` shape (200).
2. Assigning/clearing a promo on the admin Sportsbook Links page changes that endpoint's output.
3. In the app: a recommendation on a mapped book opens that book's link; an unmapped book or no-recommendation opens Rebet; offline opens the bundled Rebet fallback. The dead `mlapi.bet` URL is gone.
4. `npx jest` (app) and `npx jest src/modules/app/promos` (backend) green; `npm run build` succeeds in backend and admin; `npx tsc --noEmit` clean in app.
