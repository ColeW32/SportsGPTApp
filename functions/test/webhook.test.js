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
  assert.equal(db.writes.length, 1);
  assert.equal(db.writes[0].c, "users");
  assert.equal(db.writes[0].id, "uid1");
  assert.deepEqual(db.writes[0].data, { isPremium: true, lastRevenueCatEvent: "INITIAL_PURCHASE" });
  assert.deepEqual(db.writes[0].opts, { merge: true });
});

test("RENEWAL, UNCANCELLATION, NON_RENEWING_PURCHASE, PRODUCT_CHANGE grant premium", async () => {
  for (const type of ["RENEWAL", "UNCANCELLATION", "NON_RENEWING_PURCHASE", "PRODUCT_CHANGE"]) {
    const db = fakeDb();
    await processWebhookEvent(db, { type, app_user_id: "uid1" });
    assert.equal(db.writes[0].data.isPremium, true, type);
  }
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

test("unknown event types are ignored", async () => {
  const db = fakeDb();
  const result = await processWebhookEvent(db, { type: "TEST", app_user_id: "uid1" });
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

test("missing app_user_id is ignored", async () => {
  const db = fakeDb();
  const result = await processWebhookEvent(db, { type: "RENEWAL" });
  assert.equal(result, "ignored");
});

test("TRANSFER grants premium to every non-anonymous transferred_to id", async () => {
  const db = fakeDb();
  const result = await processWebhookEvent(db, {
    type: "TRANSFER",
    transferred_from: ["$RCAnonymousID:old"],
    transferred_to: ["new-firebase-uid", "$RCAnonymousID:skipme"],
  });
  assert.equal(result, "updated");
  assert.equal(db.writes.length, 1);
  assert.equal(db.writes[0].id, "new-firebase-uid");
  assert.deepEqual(db.writes[0].data, { isPremium: true, lastRevenueCatEvent: "TRANSFER" });
});

test("TRANSFER with only anonymous recipients is ignored", async () => {
  const db = fakeDb();
  const result = await processWebhookEvent(db, {
    type: "TRANSFER",
    transferred_to: ["$RCAnonymousID:abc"],
  });
  assert.equal(result, "ignored");
  assert.equal(db.writes.length, 0);
});

test("TRANSFER with missing transferred_to is ignored", async () => {
  const db = fakeDb();
  const result = await processWebhookEvent(db, { type: "TRANSFER" });
  assert.equal(result, "ignored");
});
