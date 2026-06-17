// Fetches admin-managed sportsbook links from Juiced and resolves the right link
// for a recommended book, falling back to Rebet. Cached in-memory + AsyncStorage.
import AsyncStorage from "@react-native-async-storage/async-storage";

export interface SportsbookLink {
  bookmakerId: string;
  brand: string;
  url: string;
  logoUrl: string | null;
  badge: string;
}

const ENDPOINT = "https://api.juicedbets.io/v1/promos/sportsbook-links";
const CACHE_KEY = "sportsbookLinks.cache.v1";
const TTL_MS = 60 * 60 * 1000; // 1h

// Bundled fallback so a first launch / offline never shows a dead link.
export const REBET_FALLBACK: SportsbookLink = {
  bookmakerId: "rebet",
  brand: "Rebet",
  url: "https://rebet.app",
  logoUrl: null,
  badge: "LIVE",
};

let links: SportsbookLink[] = [];
let loadedAt = 0;

export function __resetSportsbookLinksForTest() {
  links = [];
  loadedAt = 0;
}

function byId(id: string | undefined): SportsbookLink | undefined {
  if (!id) return undefined;
  const key = id.trim().toLowerCase();
  return links.find((l) => l.bookmakerId === key);
}

export function getFallbackLink(): SportsbookLink {
  return byId("rebet") ?? REBET_FALLBACK;
}

export function getLinkForBook(bookmakerId: string | undefined): SportsbookLink {
  return byId(bookmakerId) ?? getFallbackLink();
}

function isValid(data: unknown): data is SportsbookLink[] {
  return (
    Array.isArray(data) &&
    data.every((d) => d && typeof d.bookmakerId === "string" && typeof d.url === "string")
  );
}

export async function loadSportsbookLinks(): Promise<void> {
  if (links.length && Date.now() - loadedAt < TTL_MS) return;

  // Warm from AsyncStorage first so the UI has something immediately. We
  // intentionally do NOT set loadedAt here: a cache-only state should keep
  // attempting the network fetch below rather than honoring the TTL.
  if (!links.length) {
    try {
      const cached = await AsyncStorage.getItem(CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (isValid(parsed)) links = parsed;
      }
    } catch {
      // ignore cache read errors
    }
  }

  try {
    const res = await fetch(ENDPOINT);
    if (!res.ok) return;
    const data = await res.json();
    if (isValid(data)) {
      links = data;
      loadedAt = Date.now();
      void AsyncStorage.setItem(CACHE_KEY, JSON.stringify(data));
    }
  } catch {
    // keep cached / bundled fallback on network or parse failure
  }
}
