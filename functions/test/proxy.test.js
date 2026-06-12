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

test("rejects missing api key", async () => {
  await assert.rejects(
    handleProxyInvocation({ data: { operation: "bestBets" }, apiKey: "", fetchImpl: async () => {}, enforceLimit: async () => {} }),
    /MONEYLINE_API_KEY is not configured/
  );
});

test("aiChat builds POST to /v1/ai/chat with body", () => {
  const r = buildUpstreamRequest("aiChat", { body: { scope: "large" } });
  assert.equal(r.method, "POST");
  assert.equal(r.url, "https://mlapi.bet/v1/ai/chat");
  assert.equal(r.body, JSON.stringify({ scope: "large" }));
});

test("aiChat defaults missing body to empty object", () => {
  const r = buildUpstreamRequest("aiChat", {});
  assert.equal(r.body, "{}");
});

test("bestBets builds GET with limit and bookmaker", () => {
  const r = buildUpstreamRequest("bestBets", { limit: 4, bookmaker: "draftkings" });
  assert.equal(r.method, "GET");
  assert.equal(r.url, "https://mlapi.bet/v1/best-bets?limit=4&bookmaker=draftkings");
  assert.equal(r.body, undefined);
});

test("bestBets defaults limit to 8", () => {
  const r = buildUpstreamRequest("bestBets", {});
  assert.equal(r.url, "https://mlapi.bet/v1/best-bets?limit=8");
});

test("eventBestBets requires eventId", () => {
  assert.throws(() => buildUpstreamRequest("eventBestBets", {}), /eventId is required/);
});

test("eventBestBets builds GET with encoded eventId and optional bookmaker", () => {
  const r = buildUpstreamRequest("eventBestBets", { eventId: "ev/1", bookmaker: "fanduel" });
  assert.equal(r.url, "https://mlapi.bet/v1/events/ev%2F1/best-bets?bookmaker=fanduel");
  const r2 = buildUpstreamRequest("eventBestBets", { eventId: "ev1" });
  assert.equal(r2.url, "https://mlapi.bet/v1/events/ev1/best-bets");
});

test("aiChat invokes enforceLimit with uid; bestBets does not", async () => {
  const calls = [];
  const fetchImpl = async () => ({ ok: true, text: async () => JSON.stringify({ success: true }) });
  const enforceLimit = async (uid) => calls.push(uid);
  await handleProxyInvocation({ data: { operation: "aiChat", body: {} }, uid: "u1", apiKey: "k", fetchImpl, enforceLimit });
  await handleProxyInvocation({ data: { operation: "bestBets" }, uid: "u1", apiKey: "k", fetchImpl, enforceLimit });
  assert.deepEqual(calls, ["u1"]);
});

test("sends x-api-key header upstream", async () => {
  let seenHeaders;
  const fetchImpl = async (_url, init) => {
    seenHeaders = init.headers;
    return { ok: true, text: async () => JSON.stringify({ success: true }) };
  };
  await handleProxyInvocation({ data: { operation: "bestBets" }, uid: "u1", apiKey: "secret-key", fetchImpl, enforceLimit: async () => {} });
  assert.equal(seenHeaders["x-api-key"], "secret-key");
});

test("non-OK upstream surfaces upstream error message", async () => {
  const fetchImpl = async () => ({ ok: false, status: 502, text: async () => JSON.stringify({ error: { message: "boom" } }) });
  await assert.rejects(
    handleProxyInvocation({ data: { operation: "bestBets" }, uid: "u1", apiKey: "k", fetchImpl, enforceLimit: async () => {} }),
    /boom/
  );
});

test("non-JSON OK response is rejected", async () => {
  const fetchImpl = async () => ({ ok: true, text: async () => "<html>" });
  await assert.rejects(
    handleProxyInvocation({ data: { operation: "bestBets" }, uid: "u1", apiKey: "k", fetchImpl, enforceLimit: async () => {} }),
    /non-JSON/
  );
});

test("limit rejection propagates before upstream fetch", async () => {
  let fetched = false;
  const fetchImpl = async () => { fetched = true; return { ok: true, text: async () => "{}" }; };
  const enforceLimit = async () => { throw new Error("limit hit"); };
  await assert.rejects(
    handleProxyInvocation({ data: { operation: "aiChat", body: {} }, uid: "u1", apiKey: "k", fetchImpl, enforceLimit }),
    /limit hit/
  );
  assert.equal(fetched, false);
});
