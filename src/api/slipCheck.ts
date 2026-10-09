// SportsGPT's slip check: Juiced's Bet Analyzer reads and prices a bet screenshot in one call
// (contract: Juiced_Backend docs/superpowers/specs/2026-10-09-slip-check-design.md). This file
// sends the picture and turns the analysis into what the chat card shows.
import { priceFormats } from "./format";
import { JuicedHttpError, juicedRequest } from "./juicedClient";

/** Reading a slip is a vision call plus pricing, ~10-15s; give it room before calling it busy. */
const CHECK_TIMEOUT_MS = 45_000;
export const MAX_SLIP_IMAGE_BYTES = 5 * 1024 * 1024;

interface TicketEv {
  stakeCents: number;
  finalPayoutCents: number;
  winProbability: number;
  evPct: number;
}

interface LegAnalysis {
  status: "priced" | "unmatched" | "unpriced";
  reason: string | null;
  label: string;
  juicedProbability: number | null;
  marketProbability: number | null;
  match: { eventId: string } | null;
}

export interface SlipCheckResponse {
  draft: { platform: string; legs: unknown[] };
  analysis: {
    warnings: string[];
    legs: LegAnalysis[];
    correlation: { correlated: boolean };
    ticket: TicketEv | null;
    withoutPromo: TicketEv | null;
  };
  nominalStake: boolean;
}

export interface SlipCheckLeg {
  label: string;
  /** The pick's fair price, all three formats; missing when it couldn't be priced. */
  fair?: string;
  /** What the slip's own price for this pick implies, when the slip shows one. */
  book?: string;
  note?: string;
}

export interface SlipCheckView {
  book: string;
  title: string;
  /** What the slip pays, boost included, all three formats. */
  bookPays?: string;
  fair?: string;
  /** Expected value as a fraction of the stake (-0.114 = -11.4%). */
  evPct?: number;
  /** The same ticket with its promo removed, when the slip had one. */
  withoutPromo?: { bookPays?: string; evPct: number };
  perHundred: boolean;
  legs: SlipCheckLeg[];
  warnings: string[];
}

export interface SlipImage {
  uri: string;
  mimeType: string;
  fileName?: string;
}

const pays = (t: TicketEv) => priceFormats(t.finalPayoutCents / t.stakeCents);
const fairOf = (probability: number | null | undefined) =>
  probability != null && probability > 0 ? priceFormats(1 / probability) : undefined;

// With no readable ticket price the analyzer can't price the whole slip, but separate games are
// independent, so their fair chance is the product of each pick's.
function fairWithoutTicket(legs: LegAnalysis[]): number | undefined {
  const games = new Set(legs.map((l) => l.match?.eventId));
  if (!legs.length || legs.some((l) => l.juicedProbability == null) || games.size !== legs.length) {
    return undefined;
  }
  return legs.reduce((p, l) => p * (l.juicedProbability as number), 1);
}

export function toSlipCheckView(res: SlipCheckResponse): SlipCheckView {
  const { analysis } = res;
  const { ticket, withoutPromo } = analysis;
  const legs = analysis.legs.map((l): SlipCheckLeg => ({
    label: l.label,
    fair: fairOf(l.juicedProbability),
    book: fairOf(l.marketProbability),
    note: l.status === "priced" ? undefined : l.reason ?? "Couldn't price this pick.",
  }));
  return {
    book: res.draft.platform || "Your slip",
    title: analysis.legs.length === 1 ? analysis.legs[0].label : `${analysis.legs.length}-leg parlay`,
    bookPays: ticket ? pays(ticket) : undefined,
    fair: fairOf(ticket ? ticket.winProbability : fairWithoutTicket(analysis.legs)),
    evPct: ticket?.evPct,
    withoutPromo: withoutPromo ? { bookPays: pays(withoutPromo), evPct: withoutPromo.evPct } : undefined,
    perHundred: res.nominalStake,
    legs,
    warnings: analysis.warnings,
  };
}

/** One line for the thread list and history: "Novig pays +192 · 2.92x · 34.2%; fair +230 · …; EV -11.4%". */
export function slipCheckSummary(view: SlipCheckView): string {
  const parts = [
    view.bookPays ? `${view.book} pays ${view.bookPays}` : view.book,
    view.fair ? `fair ${view.fair}` : undefined,
    view.evPct != null ? `EV ${evText(view.evPct)}` : undefined,
  ];
  return parts.filter(Boolean).join("; ");
}

export function evText(evPct: number): string {
  const pct = evPct * 100;
  return `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%`;
}

function friendlyError(error: unknown): string {
  if (error instanceof JuicedHttpError) {
    if (error.serverMessage) return error.serverMessage;
    if (error.status === 400) return "We couldn't read a bet in that picture. Try a clear screenshot of the bet slip.";
    if (error.status === 429) return "You've checked a lot of slips today. Please try again tomorrow.";
    if (error.status === 401) return "Please close and reopen SportsGPT, then try again.";
  }
  return "Slip checks are busy right now. Please try again in a minute.";
}

export async function checkSlip(image: SlipImage): Promise<SlipCheckView> {
  const form = new FormData();
  // React Native's FormData takes a file as { uri, name, type }.
  form.append("image", { uri: image.uri, name: image.fileName ?? "slip.jpg", type: image.mimeType } as unknown as Blob);
  try {
    const res = await juicedRequest<SlipCheckResponse>("/bet-slips/check", { method: "POST", body: form }, CHECK_TIMEOUT_MS);
    return toSlipCheckView(res);
  } catch (error) {
    console.warn("[slip-check] request failed", error);
    throw new Error(friendlyError(error));
  }
}
