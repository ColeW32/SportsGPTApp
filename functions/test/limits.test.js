"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const { makeEnforceAiChatLimit, hasActiveEntitlement, FREE_REQUEST_LIMIT } = require("../limits.js");

const notSubscribed = async () => false;

function fakeDb(initialUserData) {
  let stored = initialUserData;
  const ref = {};
  return {
    collection: () => ({ doc: () => ref }),
    runTransaction: async (fn) => fn({
      get: async () => ({ data: () => stored, exists: stored !== undefined }),
      set: (_ref, data, _opts) => { stored = { ...(stored || {}), ...data }; }
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

test("malformed count is treated as 0", async () => {
  const db = fakeDb({ freeRequestCount: "lots" });
  await makeEnforceAiChatLimit(db)("u1");
  assert.equal(db.readBack().freeRequestCount, 1);
});

test(`free user at limit (${FREE_REQUEST_LIMIT}) is rejected with free-limit-reached`, async () => {
  const db = fakeDb({ freeRequestCount: FREE_REQUEST_LIMIT });
  await assert.rejects(makeEnforceAiChatLimit(db, notSubscribed)("u1"), (err) => {
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

test("user at limit with an active RevenueCat subscription is allowed and not counted", async () => {
  const db = fakeDb({ freeRequestCount: FREE_REQUEST_LIMIT });
  await makeEnforceAiChatLimit(db, async () => true)("u1");
  assert.equal(db.readBack().freeRequestCount, FREE_REQUEST_LIMIT);
});

test("under the limit never asks RevenueCat", async () => {
  let asked = false;
  await makeEnforceAiChatLimit(fakeDb({ freeRequestCount: 2 }), async () => { asked = true; return true; })("u1");
  assert.equal(asked, false);
});

function rcResponse(entitlements, ok = true) {
  return async () => ({ ok, status: ok ? 200 : 500, json: async () => ({ subscriber: { entitlements } }) });
}
const NOW = Date.parse("2026-09-17T00:00:00Z");

test("hasActiveEntitlement: future expiry is active", async () => {
  assert.equal(await hasActiveEntitlement("u", rcResponse({ "SportsGPT Pro": { expires_date: "2027-09-16T07:23:41Z" } }), NOW), true);
});

test("hasActiveEntitlement: past expiry is inactive", async () => {
  assert.equal(await hasActiveEntitlement("u", rcResponse({ "SportsGPT Pro": { expires_date: "2026-08-27T02:40:03Z" } }), NOW), false);
});

test("hasActiveEntitlement: lifetime (null expiry) is active", async () => {
  assert.equal(await hasActiveEntitlement("u", rcResponse({ "SportsGPT Pro": { expires_date: null } }), NOW), true);
});

test("hasActiveEntitlement: grace period counts as active", async () => {
  assert.equal(await hasActiveEntitlement("u", rcResponse({ "SportsGPT Pro": { expires_date: "2026-09-01T00:00:00Z", grace_period_expires_date: "2026-09-20T00:00:00Z" } }), NOW), true);
});

test("hasActiveEntitlement: no entitlement, HTTP error, or network error is inactive", async () => {
  assert.equal(await hasActiveEntitlement("u", rcResponse({}), NOW), false);
  assert.equal(await hasActiveEntitlement("u", rcResponse({}, false), NOW), false);
  assert.equal(await hasActiveEntitlement("u", async () => { throw new Error("boom"); }, NOW), false);
});
