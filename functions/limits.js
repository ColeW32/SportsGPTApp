"use strict";

const { HttpsError } = require("firebase-functions/v2/https");

const FREE_REQUEST_LIMIT = 10;
const ENTITLEMENT_ID = "SportsGPT Pro";
// The app's public iOS SDK key (ships in the app bundle, not a secret). It can read
// a subscriber's entitlements, which is all this check needs.
const REVENUECAT_PUBLIC_KEY = "appl_BvJoKxnxXfCaydUglCnEpRkfWFu";
const REVENUECAT_TIMEOUT_MS = 5000;

async function hasActiveEntitlement(uid, fetchImpl = fetch, now = Date.now()) {
  try {
    const response = await fetchImpl(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(uid)}`, {
      headers: { Authorization: `Bearer ${REVENUECAT_PUBLIC_KEY}` },
      signal: AbortSignal.timeout(REVENUECAT_TIMEOUT_MS)
    });
    if (!response.ok) {
      console.error("RevenueCat entitlement lookup failed", { uid, status: response.status });
      return false;
    }
    const entitlement = (await response.json())?.subscriber?.entitlements?.[ENTITLEMENT_ID];
    if (!entitlement) {
      return false;
    }
    const expires = entitlement.grace_period_expires_date || entitlement.expires_date;
    // A null expiry is a lifetime purchase.
    return expires === null || Date.parse(expires) > now;
  } catch (error) {
    console.error("RevenueCat entitlement lookup errored", { uid, message: error?.message });
    return false;
  }
}

function makeEnforceAiChatLimit(db, checkEntitlement = hasActiveEntitlement) {
  return async function enforceAiChatLimit(uid) {
    if (!uid) {
      throw new HttpsError("unauthenticated", "Sign-in is required.");
    }

    const ref = db.collection("users").doc(uid);
    const allowed = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const data = snap.data() || {};

      if (data.isPremium === true) {
        return true;
      }

      const count = typeof data.freeRequestCount === "number" ? data.freeRequestCount : 0;
      if (count >= FREE_REQUEST_LIMIT) {
        return false;
      }

      tx.set(ref, { freeRequestCount: count + 1 }, { merge: true });
      return true;
    });

    // Paying users are asked RevenueCat directly at the cap, so a missed webhook can
    // never lock out a subscriber. Checked outside the transaction so retries don't refetch.
    if (!allowed && !(await checkEntitlement(uid))) {
      throw new HttpsError("resource-exhausted", "You've used all your free asks.", { code: "free-limit-reached" });
    }
  };
}

module.exports = { makeEnforceAiChatLimit, hasActiveEntitlement, FREE_REQUEST_LIMIT };
