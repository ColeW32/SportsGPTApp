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
