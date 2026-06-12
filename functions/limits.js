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
