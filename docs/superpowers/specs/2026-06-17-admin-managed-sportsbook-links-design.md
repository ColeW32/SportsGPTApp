# Admin-managed sportsbook links in SportsGPT

**Date:** 2026-06-17
**Repos:** Juiced_Backend, Juiced_admin, SportsGPTApp

## Problem

SportsGPT shows a single hardcoded promotion card under non-premium assistant
replies — `src/features/chat/PromotionCard.tsx`, with
`REBET_URL = "https://mlapi.bet/track/rebet?source=…"`. That `mlapi.bet` tracking
domain is the deprecated MoneyLine API infra, so the link is dead ("RebatLink not
working"). The card is also static: it shows the same Rebet promo regardless of
which sportsbook the bet was recommended on.

Meanwhile Juiced already maintains working, frequently-updated sportsbook links
in the `Promo` table, exposed at the public `GET /v1/promos?activeOnly=true` and
managed in the Juiced admin Promos page.

## Goal & behavior

Replace the broken hardcoded card with **working, admin-managed links sourced from
Juiced**. When SportsGPT recommends a bet on a specific book, the card links to
**that book's** working link. When there is no link for that book, fall back to
**Rebet** — and make even the Rebet fallback admin-updatable rather than hardcoded.

- **Link-only scope.** Use SportsGPT's existing recommendation engine. Do NOT
  import Juiced's odds/best-bet engine.
- **New admin page that reuses the existing promo links.** No second dataset to
  maintain.

## The crux: mapping a recommendation to a link

SportsGPT recommendations already carry `bookmakerId` (`"draftkings"`,
`"fanduel"`, `"rebet"`, …) in `RecommendationInfo` (`src/api/types.ts`). Juiced
promos carry free-text `brand`. To connect them, add one optional field,
`bookmaker_id`, to the existing `Promo` — the canonical SportsGPT book key. The
URL stays single-sourced in the promo already managed; we only tag which
sportsbook it represents. This is the entire "reuse the same links" mechanism.

The canonical keys are SportsGPT's `SPORTSBOOKS` ids in
`src/api/sportsbooks.ts` (e.g. `draftkings`, `fanduel`, `rebet`). The admin page
presents exactly those ids so the mapping always matches what SportsGPT sends.

## 1. Juiced_Backend

- **Schema** (`prisma/schema.prisma`, `model Promo`): add `bookmaker_id String?`
  plus an index. Mongo — no destructive migration.
- **New public endpoint** `GET /v1/promos/sportsbook-links`: active promos that have a
  non-null `bookmaker_id`, shaped as
  `[{ bookmakerId, brand, url, logoUrl, badge }]`, ordered by `order`. Dedupe to
  one link per `bookmaker_id` (lowest `order` wins). The `rebet` row, if present,
  is the designated fallback (returned like any other; the app picks it when no
  book matches).
- **Write path** (`upsertPromo`): already spreads payload, so it accepts
  `bookmaker_id`. Add normalization: trim + lowercase, empty string → null.

## 2. Juiced_admin — new "Sportsbook Links" page

A dedicated page (new nav item in `Layout.tsx`) that mirrors SportsGPT's
canonical sportsbook list and, for each book, lets an admin attach one of the
existing promos (dropdown of current promos → sets that promo's `bookmaker_id`;
clearing the selection nulls it). Shows the live mapping and which book is the
Rebet fallback. Reuses the existing `promoService` (`savePromo` / upsert). No new
link data to enter — it curates over promos already maintained.

## 3. SportsGPTApp

- **`src/api/sportsbookLinks.ts`** — fetch
  `https://api.juicedbets.io/v1/promos/sportsbook-links`; cache in-memory + AsyncStorage
  (~1h TTL). Bundled fallback constant (a current working Rebet URL) so
  first-launch/offline never renders a dead link. Exposes
  `getLinkForBook(bookmakerId)` and `getFallbackLink()`.
- **Rework `PromotionCard`** to be data-driven. `ChatBubble` passes the message's
  recommended `bookmakerId` (derived from `assistantPresentation` recommendations);
  the card looks it up → renders that book's card if found, else the Rebet
  fallback. Remove the hardcoded `REBET_URL`.

## Data flow

Admin sets `bookmaker_id` on promos → `GET /v1/promos/sportsbook-links` →
SportsGPT fetches + caches → `PromotionCard` selects the recommended book's link,
falling back to Rebet → `Linking.openURL`.

## Error handling

- Backend: endpoint returns `[]` when nothing is mapped.
- App: network/parse failure → cached value, else bundled Rebet fallback. The
  card never shows the dead `mlapi.bet` URL again.

## Testing

- **Backend:** unit test for `/sportsbook-links` — filters to active + non-null
  `bookmaker_id`, dedupes by `order`, returns the expected shape.
- **App:** tests for the links client (cache hit, TTL expiry, fallback on error)
  and `PromotionCard` selection (matched book vs Rebet fallback).

## Scope / non-goals (YAGNI)

- No import of Juiced's odds/recommendation engine.
- No separate links table — reuse `Promo` via `bookmaker_id`.
- No per-selection bet-slip deep-linking — books rarely support reliable
  bet-slip deep links. We open the book's working affiliate URL ("link to the
  recommended book," not "pre-fill the exact bet"). This is the one accepted
  limitation.

## Deploy ordering (full-stack rule)

Backend (`bookmaker_id` + `/sportsbook-links`) ships and is verified live first →
admin "Sportsbook Links" page next → SportsGPT app build consumes the live
endpoint (ships on its own EAS cadence).

## Success criteria

1. `GET /v1/promos/sportsbook-links` returns mapped, active books in the documented
   shape (verified against prod).
2. Admin can assign/clear a promo's `bookmaker_id` from the new page and see it
   reflected in the endpoint.
3. In SportsGPT, a recommendation on a mapped book opens that book's working
   link; an unmapped book opens the Rebet fallback; offline opens the bundled
   Rebet fallback. No path opens the dead `mlapi.bet` URL.
