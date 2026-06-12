// Wire types mirror the MoneyLine API JSON (field names must match the Swift CodingKeys).

export interface MoneyLineChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface MoneyLineChatRequest {
  context?: string;
  scope: string;
  responseFormat: string;
  filters?: { bookmakers: string[] };
  messages: MoneyLineChatMessage[];
}

export interface APIError {
  message: string;
}

export interface Outcome {
  name: string;
  bestOdds?: number | null;
  bookmakerId?: string | null;
  bookmakerName?: string | null;
}

export interface Market {
  marketType: string;
  outcomes: Outcome[];
}

export interface BestBetEvent {
  eventId: string;
  markets: Market[];
  leagueId?: string | null;
  sport?: string | null;
  startTime?: string | null;
}

export interface BestBetsResponse {
  success: boolean;
  data?: BestBetEvent[] | null;
  error?: APIError | null;
}

export interface EventBestBetsResponse {
  success: boolean;
  data?: BestBetEvent | null;
  error?: APIError | null;
}

export interface MetricsInfo {
  edgePct?: number | null;
  evPct?: number | null;
  ev?: number | null;
  profitPct?: number | null;
  guaranteedProfit?: number | null;
  impliedProb?: number | null;
  modelProb?: number | null;
}

export interface EventInfo {
  matchup?: string | null;
  startTime?: string | null;
}

export interface RecommendationInfo {
  recordIndex?: number | null;
  signalType?: string | null;
  signalLabel?: string | null;
  selection?: string | null;
  marketLabel?: string | null;
  market?: string | null;
  outcome?: string | null;
  point?: unknown;
  odds?: number | null;
  oddsDisplay?: string | null;
  bookmakerName?: string | null;
  bookmakerId?: string | null;
  sourceType?: string | null;
  confidence?: string | null;
  rationale?: string | null;
  reason?: string | null;
  metrics?: MetricsInfo | null;
  event?: EventInfo | null;
}

export interface PresentationInfo {
  responseType?: string | null;
  headline?: string | null;
  summary?: string | null;
  confidence?: string | null;
  entity?: { matchup?: string | null } | null;
  primaryPick?: RecommendationInfo | null;
  alternativePick?: RecommendationInfo | null;
  cards?: RecommendationInfo[] | null;
  sourceLabel?: string | null;
}

export interface AnalysisInfo {
  summary?: string | null;
  highlights?: string[] | null;
}

export interface MoneyLineAIData {
  answer?: string | null;
  analysis?: AnalysisInfo | null;
  presentation?: PresentationInfo | null;
  records?: unknown[] | null;
  context?: unknown;
  sources?: unknown;
}

export interface MoneyLineAIResponse {
  success: boolean;
  data?: MoneyLineAIData | null;
  error?: APIError | null;
}

// UI-side presentation model (port of the Swift AssistantPresentation).

export type Confidence = "high" | "medium" | "low";

export type MetricKind = "edge" | "ev" | "implied" | "model";

export interface MetricSnapshot {
  edgePct?: number;
  evPct?: number;
  impliedProb?: number;
  modelProb?: number;
}

export interface Fact {
  label: string;
  value: string;
  kind?: MetricKind;
}

export interface Recommendation {
  signalLabel?: string;
  selection: string;
  contextLabel?: string;
  eventStartTime?: Date;
  marketLabel?: string;
  oddsDisplay?: string;
  bookmakerName?: string;
  sourceType?: string;
  confidence?: Confidence;
  rationale?: string;
  facts: Fact[];
  metricSnapshot?: MetricSnapshot;
}

export interface AssistantPresentation {
  headline?: string;
  summary?: string;
  sourceLabel?: string;
  confidence?: Confidence;
  entityMatchup?: string;
  primaryPick?: Recommendation;
  alternativePick?: Recommendation;
  cards: Recommendation[];
  expandedExplanation?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  includeInAPIRequest: boolean;
  assistantPresentation?: AssistantPresentation;
}

export interface SuggestedPrompt {
  id: string;
  text: string;
  shortLabel: string;
}

export interface EventMatchup {
  primaryTeam: string;
  opponentTeam: string;
  sport?: string;
  leagueId?: string;
}

export interface SuggestedPromptSeed {
  prompts: SuggestedPrompt[];
  events: BestBetEvent[];
}
