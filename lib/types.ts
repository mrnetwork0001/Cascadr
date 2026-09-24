/**
 * Shapes returned by the Cascadr API. These mirror backend/app/models.py and
 * the endpoint payloads in backend/app/main.py exactly - the frontend holds
 * no data of its own, it only displays what the API serves.
 */

export type Tier = "MATERIAL" | "SUPPLIER" | "MANUFACTURER" | "LOGISTICS" | "BRAND";

export type Contagion = "NOMINAL" | "WATCH" | "STRESSED" | "CRITICAL";

export type Provenance =
  | "DISCLOSED"
  | "REPORTED"
  | "INFERRED"
  | "QUALITATIVE"
  | "ESTIMATED";

export interface Source {
  url: string;
  publisher: string;
  date: string;
  quote: string;
}

export interface GraphNode {
  id: string;
  name: string;
  tier: Tier;
  country: string;
  revenue_b: number;
  revenue_period: string | null;
  revenue_source: string | null;
  revenue_note: string | null;
  ticker: string | null;
}

export interface GraphEdge {
  source: string;
  target: string;
  relation: string;
  component: string;
  dependency: number;
  provenance: Provenance;
  citation: string | null;
  basis: string;
  as_of: string;
  confidence: string;
  sources: Source[];
  weight_note: string;
  notes: string;
  counter_evidence: Source[];
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  concentration: Record<string, ConcentrationFact[]>;
  stats: { nodes: number; edges: number; edges_by_provenance: Record<string, number> };
}

export interface ConcentrationFact {
  /** Largest single customer's share of revenue; null where the filing discloses none. */
  pct: number | null;
  customer?: string;
  fiscal_year?: string;
  quote?: string;
  url?: string;
  form?: string;
  accession?: string;
  filing_date?: string;
}

/** One edge a recorded score was multiplied through, as it stood then. */
export interface PathLink {
  source: string;
  target: string;
  component: string;
  dependency: number;
  provenance: Provenance;
  weight_note?: string;
}

/** One company's exposure implied by a recorded decision (server-computed). */
export interface Exposure {
  target: string;
  name: string;
  ticker: string | null;
  origin: string;
  hops: string[];
  score: number;
  contagion: Contagion;
  implied_drawdown_pct: number;
  provenance: string;
  is_origin: boolean;
  // Recorded with the decision (absent on decisions from before they were
  // stored), so the score can be re-derived exactly as it was computed.
  rationale?: string;
  links?: PathLink[];
  hop_decay?: number;
}

export type DecisionAction =
  | "DECLINED"
  | "TRADED"
  | "BLOCKED_BY_RISK"
  | "REJECTED_BY_VENUE"
  | "NO_MARKET_PRICE"
  | "ALREADY_HOLDING"
  | "NO_TRADABLE_EXPOSURE"
  | "EXECUTION_FAILED"
  | "ANALYSED"
  | "BLOCKED"; // legacy label from before the outcomes were split

/** A real headline the agent read, and what the LLM decided about it. */
export interface Decision {
  id: number;
  at: string;
  headline: string;
  source: string;
  url: string | null;
  published: string | null;
  engine: "llm" | "heuristic" | string;
  model: string | null;
  entities: string[];
  shock: number;
  severity: string;
  confidence: number;
  reasoning: string;
  uncertainty: string;
  action: DecisionAction;
  detail: string;
  provider: string | null;
  exposures: Exposure[];
}

export type FeedItem =
  | ({ kind: "decision" } & Decision)
  | {
      kind: "position";
      at: string;
      event: string;
      detail: string;
      position_id: string;
      symbol: string | null;
      origin: string | null;
      source: string | null;
    };

export interface Position {
  id: string;
  symbol: string;
  side: "SHORT" | "LONG";
  size: number;
  notional_usdt: number;
  leverage: number;
  entry_price: number;
  opened_at: string;
  thesis: string;
  origin: string;
  client_oid: string;
  paper: boolean;
  source: "agent" | "manual" | string;
  close_attempts: number;
  status: "OPEN" | "CLOSED";
  policy: { max_hold_hours: number; stop_loss_pct: number; take_profit_pct: number | null };
  closed_at: string | null;
  exit_price: number | null;
  close_reason: string | null;
  realized_pnl_usdt: number | null;
  mark?: number | null;
  pnl_pct?: number;
  roe_pct?: number;
  pnl_usdt?: number;
  would_exit?: string | null;
  age_hours: number;
}

export interface PositionsResponse {
  positions: Position[];
  open: number;
  /** null when any open position has no live mark: unknown, not zero. */
  unrealized_usdt: number | null;
  realized_usdt: number;
  paper: boolean;
  market_error: string | null;
}

export interface Quote {
  id: string;
  ticker: string;
  symbol: string;
  last: number | null;
  mark: number | null;
  open24h: number | null;
  high24h: number | null;
  low24h: number | null;
  change24h_pct: number | null;
  volume_usdt: number | null;
  ts: number | null;
}

export interface Health {
  status: "ok" | "degraded";
  graph_backend: string;
  paper_trading: boolean;
  trading_credentials: boolean;
  admin_endpoints: boolean;
  llm: {
    configured: boolean;
    base_url: string | null;
    model: string | null;
    provider: string;
    api_format: string | null;
    trust_mode: string;
  };
  autonomous: {
    armed: boolean;
    poll_seconds: number;
    shock_floor: number;
    trade_threshold: number;
    max_llm_per_hour: number;
    cycles: number;
    headlines_seen: number;
    reasoned: number;
    traded: number;
    declined: number;
    last_cycle: string | null;
    last_error: string | null;
  };
  feeds: {
    queries: number;
    errors: number;
    last_error: { at: string; query: string; error: string } | null;
    last_ok: string | null;
    last_poll_errors: number;
    last_poll_queries: number;
  };
  sweep: {
    interval_seconds: number;
    runs: number;
    last_ok: string | null;
    consecutive_failures: number;
    healthy: boolean;
  };
}

export interface Overview {
  graph: {
    nodes: number;
    edges: number;
    edges_by_provenance: Record<string, number>;
    max_hops: number;
    hop_decay: number;
  };
  instruments: { graph_tickers: number; listed_on_bitget: number | null };
  agent: {
    armed: boolean;
    poll_seconds: number;
    shock_floor: number;
    trade_threshold: number;
    llm_model: string | null;
    cycles_since_restart: number;
    last_cycle: string | null;
    headlines_seen: number;
    decisions: Record<string, number>;
  };
  paper: {
    starting_equity: number;
    equity: number | null;
    realized_usdt: number;
    unrealized_usdt: number | null;
    open_positions: number;
    /** Bitget answered but an open position has no mark: equity unknown. */
    unpriced: boolean;
  };
  paper_trading: boolean;
  trading_credentials: boolean;
  /** Set when Bitget could not be reached; price-derived fields are null. */
  market_error: string | null;
}

export interface PaperReport {
  stats: {
    samples: number;
    hours_tracked: number;
    starting_equity?: number;
    current_equity?: number;
    total_return_pct?: number;
    sharpe_annualised?: number | null;
    max_drawdown_pct?: number;
    closed_trades?: number;
    win_rate_pct?: number | null;
    note?: string;
  };
}
