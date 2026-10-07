"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const { makeRecordActivity, monthKey } = require("../activity.js");

function fakeDb(fail = false) {
  const writes = [];
  const doc = (path) => ({
    collection: (name) => ({ doc: (id) => doc(`${path}/${name}/${id}`) }),
    set: async (data, opts) => {
      if (fail) throw new Error("unavailable");
      writes.push({ path, opts });
    }
  });
  return { writes, collection: (name) => ({ doc: (id) => doc(`${name}/${id}`) }) };
}

test("writes one doc per user under the UTC month", async () => {
  const db = fakeDb();
  await makeRecordActivity(db, () => new Date("2026-10-31T23:30:00Z"))("u1");
  assert.equal(db.writes[0].path, "activeUsers/2026-10/users/u1");
  assert.deepEqual(db.writes[0].opts, { merge: true });
});

test("a failed write is logged, never thrown", async () => {
  await makeRecordActivity(fakeDb(true))("u1");
});

test("skips calls with no user", async () => {
  const db = fakeDb();
  await makeRecordActivity(db)(undefined);
  assert.equal(db.writes.length, 0);
});

test("monthKey is the UTC month", () => {
  assert.equal(monthKey(new Date("2026-11-01T02:00:00Z")), "2026-11");
});
