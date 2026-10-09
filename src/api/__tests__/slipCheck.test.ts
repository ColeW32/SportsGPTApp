import { priceFormats } from "../format";
import { slipCheckSummary, toSlipCheckView, type SlipCheckResponse } from "../slipCheck";

jest.mock("../juicedClient", () => ({ juicedRequest: jest.fn(), JuicedHttpError: class extends Error {} }));

// Juiced's live answer for Cole's Novig order slip (2026-10-09): 2.92x, no amount entered.
const novig: SlipCheckResponse = {
  draft: { platform: "Novig", legs: [{}, {}, {}] },
  nominalStake: true,
  analysis: {
    warnings: [],
    correlation: { correlated: false },
    legs: [
      { status: "priced", reason: null, label: "Texas to win", juicedProbability: 0.7313, marketProbability: null, match: { eventId: "a" } },
      { status: "priced", reason: null, label: "Oregon to win", juicedProbability: 0.7877, marketProbability: null, match: { eventId: "b" } },
      { status: "priced", reason: null, label: "Alabama to win", juicedProbability: 0.5265, marketProbability: null, match: { eventId: "c" } },
    ],
    ticket: { stakeCents: 10000, finalPayoutCents: 29200, winProbability: 0.30329, evPct: -0.1144 },
    withoutPromo: null,
  },
};

test("priceFormats prints American, multiple and implied chance", () => {
  expect(priceFormats(2.92)).toBe("+192 · 2.92x · 34.2%");
  expect(priceFormats(1.3676)).toBe("-272 · 1.37x · 73.1%");
  expect(priceFormats(1)).toBeUndefined();
});

test("the slip's price and fair price read all three ways, with EV per $100", () => {
  const view = toSlipCheckView(novig);
  expect(view.title).toBe("3-leg parlay");
  expect(view.bookPays).toBe("+192 · 2.92x · 34.2%");
  expect(view.fair).toBe("+230 · 3.30x · 30.3%");
  expect(view.evPct).toBeCloseTo(-0.1144);
  expect(view.perHundred).toBe(true);
  expect(view.legs[0]).toEqual({ label: "Texas to win", fair: "-272 · 1.37x · 73.1%", book: undefined, note: undefined });
  expect(slipCheckSummary(view)).toBe("Novig pays +192 · 2.92x · 34.2%; fair +230 · 3.30x · 30.3%; EV -11.4%");
});

test("with no readable price, separate games still get a fair price; one game does not", () => {
  const noTicket = { ...novig, analysis: { ...novig.analysis, ticket: null } };
  expect(toSlipCheckView(noTicket).fair).toBe("+230 · 3.30x · 30.3%");
  const sameGame = {
    ...noTicket,
    analysis: { ...noTicket.analysis, legs: noTicket.analysis.legs.map((l) => ({ ...l, match: { eventId: "a" } })) },
  };
  expect(toSlipCheckView(sameGame).fair).toBeUndefined();
});

test("an unpriced pick says why", () => {
  const view = toSlipCheckView({
    ...novig,
    analysis: { ...novig.analysis, legs: [{ ...novig.analysis.legs[0], status: "unmatched", reason: "No game found.", juicedProbability: null }] },
  });
  expect(view.legs[0].note).toBe("No game found.");
  expect(view.title).toBe("Texas to win");
});
