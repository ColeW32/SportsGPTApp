// Port of Sportsbook.all (SportsGPTModels.swift:276-317).

export interface Sportsbook {
  id: string;
  name: string;
  apiValue: string;
}

export const SPORTSBOOKS: Sportsbook[] = [
  { id: "draftkings", name: "DraftKings", apiValue: "draftkings" },
  { id: "fanduel", name: "FanDuel", apiValue: "fanduel" },
  { id: "betmgm", name: "BetMGM", apiValue: "betmgm" },
  { id: "caesars", name: "Caesars", apiValue: "caesars" },
  { id: "pointsbet_us", name: "PointsBet (US)", apiValue: "pointsbet_us" },
  { id: "williamhill_us", name: "William Hill (US)", apiValue: "williamhill_us" },
  { id: "betrivers", name: "BetRivers", apiValue: "betrivers" },
  { id: "unibet_us", name: "Unibet (US)", apiValue: "unibet_us" },
  { id: "bovada", name: "Bovada", apiValue: "bovada" },
  { id: "betonlineag", name: "BetOnline.ag", apiValue: "betonlineag" },
  { id: "mybookieag", name: "MyBookie.ag", apiValue: "mybookieag" },
  { id: "lowvig", name: "LowVig.ag", apiValue: "lowvig" },
  { id: "barstool", name: "Barstool Sportsbook", apiValue: "barstool" },
  { id: "betus", name: "BetUS", apiValue: "betus" },
  { id: "wynnbet", name: "WynnBET", apiValue: "wynnbet" },
  { id: "superbook", name: "SuperBook", apiValue: "superbook" },
  { id: "bet365_us", name: "bet365 (US)", apiValue: "bet365_us" },
  { id: "espnbet", name: "ESPN BET", apiValue: "espnbet" },
  { id: "fanatics", name: "Fanatics", apiValue: "fanatics" },
  { id: "fliff", name: "Fliff", apiValue: "fliff" },
  { id: "hardrockbet", name: "Hard Rock Bet", apiValue: "hardrockbet" },
  { id: "hardrockbet_az", name: "Hard Rock Bet (AZ)", apiValue: "hardrockbet_az" },
  { id: "tipico_us", name: "Tipico (US)", apiValue: "tipico_us" },
  { id: "betanysports", name: "BetAnySports", apiValue: "betanysports" },
  { id: "betr_us", name: "Betr (US)", apiValue: "betr_us" },
  { id: "pinnacle", name: "Pinnacle", apiValue: "pinnacle" },
  { id: "betparx", name: "betParx", apiValue: "betparx" },
  { id: "ballybet", name: "Bally Bet", apiValue: "ballybet" },
  { id: "rebet", name: "Rebet", apiValue: "rebet" },
  { id: "prizepicks", name: "PrizePicks", apiValue: "prizepicks" },
  { id: "underdog", name: "Underdog Fantasy", apiValue: "underdog" },
  { id: "draftkings_pick6", name: "DraftKings Pick6", apiValue: "draftkings_pick6" },
  { id: "betr_picks", name: "Betr Picks", apiValue: "betr_picks" },
  { id: "betfair_exchange_us", name: "Betfair Exchange (US)", apiValue: "betfair_exchange_us" },
  { id: "sporttrade", name: "Sporttrade", apiValue: "sporttrade" },
  { id: "kalshi", name: "Kalshi", apiValue: "kalshi" },
  { id: "novig", name: "Novig", apiValue: "novig" },
  { id: "polymarket", name: "Polymarket", apiValue: "polymarket" },
  { id: "prophetx", name: "ProphetX", apiValue: "prophetx" },
  { id: "betopenly", name: "BetOpenly", apiValue: "betopenly" },
];

export function sportsbookById(id: string): Sportsbook | undefined {
  return SPORTSBOOKS.find((book) => book.id === id);
}
