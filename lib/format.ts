/**
 * Formatting helpers. Every one of these is deterministic given its input —
 * anything reading the wall clock is called from effects only, so the server
 * and first client render agree and hydration stays quiet.
 */

/** 24h HH:MM:SS, the only time format a trading desk wants to read. */
export function clock(d: Date = new Date()): string {
  return d.toTimeString().slice(0, 8);
}

export function stamp(d: Date = new Date()): string {
  return `${clock(d)}.${String(d.getMilliseconds()).padStart(3, "0")}`;
}

export function usd(n: number, dp = 2): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  });
}

export function compactUsd(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(0);
}

/** Always signed — a P&L cell with no sign is a bug report waiting to happen. */
export function signedPct(n: number, dp = 2): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(dp)}%`;
}

export function signedUsd(n: number, dp = 2): string {
  return `${n >= 0 ? "+" : "-"}$${usd(Math.abs(n), dp)}`;
}

export function pct(n: number, dp = 0): string {
  return `${(n * 100).toFixed(dp)}%`;
}
