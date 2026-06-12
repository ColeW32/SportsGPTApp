"use strict";

const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");

const moneyLineApiKey = defineSecret("MONEYLINE_API_KEY");

const MONEYLINE_BASE_URL = "https://mlapi.bet";
const ALLOWED_OPERATIONS = new Set(["aiChat", "bestBets", "eventBestBets"]);

exports.moneylineProxy = onCall(
  {
    region: "us-central1",
    enforceAppCheck: false,
    secrets: [moneyLineApiKey]
  },
  async (request) => {
    return handleProxyInvocation(request.data);
  }
);

exports.moneylineProxyHttp = onRequest(
  {
    region: "us-central1",
    invoker: "public",
    secrets: [moneyLineApiKey]
  },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({ error: { message: "Method not allowed." } });
      return;
    }

    try {
      const json = await handleProxyInvocation(req.body);
      res.status(200).json(json);
    } catch (error) {
      if (error instanceof HttpsError) {
        const statusCode = httpStatusCode(error.code);
        res.status(statusCode).json({ error: { message: error.message } });
        return;
      }

      const message = error instanceof Error ? error.message : "Unexpected MoneyLine proxy error.";
      res.status(500).json({ error: { message } });
    }
  }
);

function buildUpstreamRequest(operation, data) {
  switch (operation) {
    case "aiChat":
      return {
        method: "POST",
        url: `${MONEYLINE_BASE_URL}/v1/ai/chat`,
        body: JSON.stringify(data.body || {})
      };
    case "bestBets": {
      const query = new URLSearchParams();
      query.set("limit", String(data.limit || 8));
      if (typeof data.bookmaker === "string" && data.bookmaker.length > 0) {
        query.set("bookmaker", data.bookmaker);
      }

      return {
        method: "GET",
        url: `${MONEYLINE_BASE_URL}/v1/best-bets?${query.toString()}`,
        body: undefined
      };
    }
    case "eventBestBets": {
      if (typeof data.eventId !== "string" || !data.eventId.length) {
        throw new HttpsError("invalid-argument", "eventId is required.");
      }

      const query = new URLSearchParams();
      if (typeof data.bookmaker === "string" && data.bookmaker.length > 0) {
        query.set("bookmaker", data.bookmaker);
      }

      const querySuffix = query.toString() ? `?${query.toString()}` : "";
      return {
        method: "GET",
        url: `${MONEYLINE_BASE_URL}/v1/events/${encodeURIComponent(data.eventId)}/best-bets${querySuffix}`,
        body: undefined
      };
    }
    default:
      throw new HttpsError("invalid-argument", "Unsupported MoneyLine proxy operation.");
  }
}

function safeParseJSON(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function httpStatusCode(code) {
  switch (code) {
    case "invalid-argument":
      return 400;
    case "unauthenticated":
      return 401;
    case "permission-denied":
      return 403;
    case "not-found":
      return 404;
    case "failed-precondition":
      return 412;
    default:
      return 500;
  }
}

async function handleProxyInvocation(data) {
  const operation = data?.operation;

  if (!ALLOWED_OPERATIONS.has(operation)) {
    throw new HttpsError("invalid-argument", "Unsupported MoneyLine proxy operation.");
  }

  const apiKey = moneyLineApiKey.value();
  if (!apiKey) {
    throw new HttpsError("failed-precondition", "MONEYLINE_API_KEY is not configured.");
  }

  const upstreamRequest = buildUpstreamRequest(operation, data);
  const response = await fetch(upstreamRequest.url, {
    method: upstreamRequest.method,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey
    },
    body: upstreamRequest.body
  });

  const text = await response.text();
  const json = safeParseJSON(text);

  if (!response.ok) {
    const upstreamMessage = json?.error?.message || text || `MoneyLine returned ${response.status}.`;
    throw new HttpsError("internal", upstreamMessage);
  }

  if (!json) {
    throw new HttpsError("internal", "MoneyLine returned a non-JSON response.");
  }

  return json;
}
