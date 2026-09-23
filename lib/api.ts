/**
 * Client for the Cascadr backend.
 *
 * Every call degrades to null rather than throwing: the terminal must still
 * run its scripted demo when the Python service is not up, and a judge or a
 * reviewer should never see a blank screen because port 8010 is closed.
 * Callers treat null as "fall back to the local engine".
 */

import type { ExposurePath, Position } from "@/lib/types";

export const API_BASE =
  process.env.NEXT_PUBLIC_CASCADR_API ?? "http://localhost:8010";

export interface BackendHealth {
  status: string;
  graph_backend: string;
  paper_trading: boolean;
  trading_credentials: boolean;
  max_order_usdt: number;
}

export interface BackendExposure {
  target: string;
  name: string;
  ticker: string | null;
  symbol: string | null;
  hops: string[];
  score: number;
  contagion: string;
  implied_drawdown_pct: number;
  rationale: string;
  provenance: string;
  mark: number | null;
  tradable: boolean;
}

async function json<T>(
  path: string,
  init?: RequestInit,
  /**
   * A hung backend must not freeze the demo, but the ceiling has to clear the
   * slowest legitimate call. An LLM reasoning over a headline takes far longer
   * than a price lookup — at 6s the oracle silently timed out and its verdict
   * never reached the log.
   */
  timeoutMs = 8000
): Promise<T | null> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export function getHealth() {
  return json<BackendHealth>("/health");
}

export function getContagion(origin: string, shock: number, headline: string) {
  return json<{ exposures: BackendExposure[] }>("/contagion", {
    method: "POST",
    body: JSON.stringify({ origin, shock, headline }),
  });
}

/** Live marks keyed by graph node id, straight from Bitget via the backend. */
export async function getMarks(): Promise<Record<string, number>> {
  const res = await json<{
    instruments: { id: string; mark: number | null }[];
  }>("/market/tradable");
  if (!res) return {};
  return Object.fromEntries(
    res.instruments.filter((i) => i.mark != null).map((i) => [i.id, i.mark!])
  );
}

interface BackendPosition {
  id: string;
  symbol: string;
  side: string;
  notional_usdt: number;
  leverage: number;
  entry_price: number;
  opened_at: string;
  thesis: string;
  status: "OPEN" | "CLOSED";
  mark?: number;
  pnl_pct?: number;
  pnl_usdt?: number;
  age_hours?: number;
  would_exit?: string | null;
  close_reason?: string | null;
  realized_pnl_usdt?: number | null;
}

/** The persisted book, marked to the live tape. */
export async function getPositions(): Promise<{
  positions: Position[];
  unrealized: number;
  realized: number;
} | null> {
  const res = await json<{
    positions: BackendPosition[];
    unrealized_usdt: number;
    realized_usdt: number;
  }>("/positions");
  if (!res) return null;
  return {
    positions: res.positions.map((p) => ({
      id: p.id,
      symbol: p.symbol,
      side: p.side === "SHORT" ? "SHORT" : "LONG",
      notional: p.notional_usdt,
      leverage: p.leverage,
      entry: p.entry_price,
      mark: p.mark ?? p.entry_price,
      openedAt: p.opened_at.slice(11, 19),
      thesis: p.thesis,
      ageHours: p.age_hours,
      wouldExit: p.would_exit ?? null,
      status: p.status,
      closeReason: p.close_reason ?? null,
      realizedPnl: p.realized_pnl_usdt ?? null,
    })),
    unrealized: res.unrealized_usdt,
    realized: res.realized_usdt,
  };
}

export interface OracleVerdict {
  entities: string[];
  shock: number;
  severity: string;
  confidence: number;
  reasoning: string;
  uncertainty: string;
  engine: "llm" | "heuristic";
  model: string | null;
  detail: string;
}

/** Ask the oracle to read a raw headline. Null if the backend is unreachable. */
export async function getOracleVerdict(
  headline: string,
  source: string
): Promise<OracleVerdict | null> {
  const res = await json<{ verdict: OracleVerdict }>(
    "/oracle",
    { method: "POST", body: JSON.stringify({ headline, source }) },
    60_000 // reasoning models are slow; this is the decision, worth waiting for
  );
  return res?.verdict ?? null;
}

/** Backend exposures -> the shape the local engine already speaks. */
export function toExposurePaths(rows: BackendExposure[]): ExposurePath[] {
  return rows.map((r) => ({
    target: r.target,
    hops: r.hops,
    score: r.score,
    rationale: r.rationale,
  }));
}
