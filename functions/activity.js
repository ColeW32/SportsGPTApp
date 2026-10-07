"use strict";

const { FieldValue } = require("firebase-admin/firestore");

// One doc per user per UTC month: activeUsers/{YYYY-MM}/users/{uid}. The MoneyLine
// revenue page counts each month's docs as SportsGPT's monthly active users.
// Every cold launch loads suggested prompts through the proxy, so a launch counts.
const COLLECTION = "activeUsers";

function monthKey(now = new Date()) {
  return now.toISOString().slice(0, 7);
}

function makeRecordActivity(db, now = () => new Date()) {
  return async function recordActivity(uid) {
    if (!uid) return;
    const at = now();
    try {
      await db.collection(COLLECTION).doc(monthKey(at)).collection("users").doc(uid)
        .set({ lastSeenAt: FieldValue.serverTimestamp() }, { merge: true });
    } catch (error) {
      // Counting must never cost the user their answer.
      console.error("Active-user record failed", { uid, month: monthKey(at), message: error?.message });
    }
  };
}

module.exports = { makeRecordActivity, monthKey, ACTIVE_USERS_COLLECTION: COLLECTION };
