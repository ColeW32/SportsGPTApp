"use strict";

const { HttpsError } = require("firebase-functions/v2/https");

const MONEYLINE_BASE_URL = "https://mlapi.bet";
const ALLOWED_OPERATIONS = new Set(["aiChat", "bestBets", "eventBestBets"]);

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

async function handleProxyInvocation({ data, uid, apiKey, fetchImpl, enforceLimit }) {
  const operation = data?.operation;

  if (!ALLOWED_OPERATIONS.has(operation)) {
    throw new HttpsError("invalid-argument", "Unsupported MoneyLine proxy operation.");
  }

  if (!apiKey) {
    throw new HttpsError("failed-precondition", "MONEYLINE_API_KEY is not configured.");
  }

  if (operation === "aiChat") {
    // The ask is counted before the upstream call: an upstream failure burns one of
    // the user's free asks. Deliberate v1 tradeoff — refunding on failure would let
    // induced upstream errors bypass the cap.
    await enforceLimit(uid);
  }

  const upstreamRequest = buildUpstreamRequest(operation, data);
  const response = await fetchImpl(upstreamRequest.url, {
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

module.exports = { buildUpstreamRequest, handleProxyInvocation, MONEYLINE_BASE_URL };
