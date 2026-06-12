"use strict";

const crypto = require("node:crypto");
const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { handleProxyInvocation } = require("./proxy.js");
const { makeEnforceAiChatLimit } = require("./limits.js");
const { processWebhookEvent } = require("./webhook.js");

const moneyLineApiKey = defineSecret("MONEYLINE_API_KEY");
const revenueCatWebhookSecret = defineSecret("REVENUECAT_WEBHOOK_SECRET");

initializeApp();

exports.moneylineProxy = onCall(
  {
    region: "us-central1",
    enforceAppCheck: true,
    secrets: [moneyLineApiKey]
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Sign-in is required.");
    }

    return handleProxyInvocation({
      data: request.data,
      uid: request.auth.uid,
      apiKey: moneyLineApiKey.value(),
      fetchImpl: fetch,
      enforceLimit: makeEnforceAiChatLimit(getFirestore())
    });
  }
);

exports.revenuecatWebhook = onRequest(
  {
    region: "us-central1",
    secrets: [revenueCatWebhookSecret]
  },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({ error: { message: "Method not allowed." } });
      return;
    }

    const secret = revenueCatWebhookSecret.value();
    const authHeader = req.get("Authorization") || "";
    const expected = Buffer.from(`Bearer ${secret}`);
    const actual = Buffer.from(authHeader);
    if (!secret || expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
      res.status(401).json({ error: { message: "Unauthorized." } });
      return;
    }

    try {
      const result = await processWebhookEvent(getFirestore(), req.body?.event);
      res.status(200).json({ result });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Webhook processing failed.";
      res.status(400).json({ error: { message } });
    }
  }
);
