"use strict";

const PREMIUM_ON = new Set([
  "INITIAL_PURCHASE",
  "RENEWAL",
  "UNCANCELLATION",
  "NON_RENEWING_PURCHASE",
  "PRODUCT_CHANGE"
]);
const PREMIUM_OFF = new Set(["EXPIRATION"]);

async function processWebhookEvent(db, event) {
  if (!event || typeof event.type !== "string") {
    throw new Error("Missing event payload.");
  }

  // TRANSFER events carry no app_user_id — entitlements moved to the IDs in
  // transferred_to (e.g. a restore under a fresh anonymous Firebase UID). Without
  // this, migrated lifetime subscribers would stay capped at the free limit.
  if (event.type === "TRANSFER") {
    const recipients = (Array.isArray(event.transferred_to) ? event.transferred_to : []).filter(
      (id) => typeof id === "string" && id.length && !id.startsWith("$RCAnonymousID:")
    );
    if (!recipients.length) {
      return "ignored";
    }
    for (const id of recipients) {
      await db.collection("users").doc(id).set(
        { isPremium: true, lastRevenueCatEvent: "TRANSFER" },
        { merge: true }
      );
    }
    return "updated";
  }

  const uid = event.app_user_id;
  if (typeof uid !== "string" || !uid.length || uid.startsWith("$RCAnonymousID:")) {
    return "ignored";
  }

  let isPremium;
  if (PREMIUM_ON.has(event.type)) {
    isPremium = true;
  } else if (PREMIUM_OFF.has(event.type)) {
    isPremium = false;
  } else {
    return "ignored";
  }

  await db.collection("users").doc(uid).set(
    { isPremium, lastRevenueCatEvent: event.type },
    { merge: true }
  );
  return "updated";
}

module.exports = { processWebhookEvent };
