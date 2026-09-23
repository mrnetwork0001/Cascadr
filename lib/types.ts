/**
 * Domain model for the Cascadr knowledge graph.
 *
 * These shapes are the contract the Python/Neo4j backend will eventually fill:
 * `GraphNode` maps to a `:Company` node, `GraphEdge` to a `[:SUPPLIES]`
 * relationship, and `ExposurePath` to the result of a Cypher traversal.
 */

export type Tier =
  | "MATERIAL"
  | "SUPPLIER"
  | "MANUFACTURER"
  | "LOGISTICS"
  | "BRAND";

/** Contagion severity assigned to a node by the traversal, worst last. */
export type Contagion = "NOMINAL" | "WATCH" | "STRESSED" | "CRITICAL";

export const CONTAGION_RANK: Record<Contagion, number> = {
  NOMINAL: 0,
  WATCH: 1,
  STRESSED: 2,
  CRITICAL: 3,
};

export type GraphNode = {
  /** Stable key, also the Neo4j node id. */
  id: string;
  name: string;
  /**
   * Underlying equity ticker. Tradable on Bitget as the stock perpetual
   * future `${ticker}USDT` — see lib/instruments.ts. Absent for names with
   * no listed US contract (Foxconn, SK Hynix, CATL, Maersk...).
   */
  ticker?: string;
  tier: Tier;
  country: string;
  /** Annual revenue in USD billions — drives node radius. */
  revenueB: number;
  /** Reference mark for the perp. */
  price?: number;
}

export type Relation = "SUPPLIES" | "ASSEMBLES" | "SHIPS" | "FABRICATES";

export type GraphEdge = {
  source: string;
  target: string;
  relation: Relation;
  /** What flows across this edge, e.g. "3nm wafers". */
  component: string;
  /**
   * Share of the target's input for this component that the source provides,
   * 0..1. This is the weight the contagion score propagates through.
   */
  dependency: number;
}

/** One hop-by-hop route from the shocked node to an exposed tradable node. */
export interface ExposurePath {
  target: string;
  hops: string[];
  /** Product of edge dependencies along the path, decayed per hop. */
  score: number;
  rationale: string;
}

export type LogLevel = "INFO" | "ORACLE" | "GRAPH" | "RISK" | "EXEC" | "FILL";

export interface LogEntry {
  id: string;
  ts: string;
  level: LogLevel;
  text: string;
  /** Raw payload rendered as a collapsed JSON block (Bitget order bodies). */
  payload?: Record<string, unknown>;
}

export type Side = "SHORT" | "LONG";

export interface Position {
  id: string;
  symbol: string;
  side: Side;
  /** Notional in USDT. */
  notional: number;
  leverage: number;
  entry: number;
  mark: number;
  openedAt: string;
  thesis: string;
  /** Present only when the position came from the backend's persisted book. */
  ageHours?: number;
  /** Exit rule that would fire right now, if any. */
  wouldExit?: string | null;
  status?: "OPEN" | "CLOSED";
  closeReason?: string | null;
  realizedPnl?: number | null;
}

export interface NewsItem {
  id: string;
  ts: string;
  source: string;
  headline: string;
  /** Entities the NLP oracle resolved to graph nodes. */
  entities: string[];
  confidence: number;
  severity: "LOW" | "MEDIUM" | "HIGH" | "SEVERE";
}
