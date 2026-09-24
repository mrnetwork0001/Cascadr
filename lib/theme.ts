import type { Contagion, Tier } from "@/lib/types";

/**
 * Canvas rendering needs raw hex, Tailwind needs class names, and both must
 * agree. These constants are the single source; tailwind.config.ts mirrors them.
 */
export const COLORS = {
  void: "#05070a",
  panel: "#0d1117",
  line: "#1e2732",
  edge: "#2b3644",
  dim: "#5c6b7f",
  text: "#b9c6d4",
  bright: "#e6eef7",
  amber: "#ffa726",
  green: "#00e08a",
  red: "#ff3b52",
  cyan: "#22d3ee",
  violet: "#a78bfa",
  slate: "#94a3b8",
} as const;

export const TIER_COLOR: Record<Tier, string> = {
  MATERIAL: COLORS.violet,
  SUPPLIER: COLORS.cyan,
  MANUFACTURER: COLORS.amber,
  LOGISTICS: COLORS.slate,
  BRAND: COLORS.green,
};

export const CONTAGION_COLOR: Record<Contagion, string> = {
  NOMINAL: COLORS.dim,
  WATCH: COLORS.amber,
  STRESSED: "#ff8c42",
  CRITICAL: COLORS.red,
};

/** Tailwind text classes for the same four states, for DOM-side rendering. */
export const CONTAGION_CLASS: Record<Contagion, string> = {
  NOMINAL: "text-term-dim",
  WATCH: "text-amber",
  STRESSED: "text-[#ff8c42]",
  CRITICAL: "text-signal-red",
};

export const LEVEL_CLASS: Record<string, string> = {
  INFO: "text-term-dim",
  ORACLE: "text-signal-violet",
  GRAPH: "text-signal-cyan",
  RISK: "text-amber",
  EXEC: "text-signal-red",
  FILL: "text-signal-green",
};

/** Decision outcome badges. Each outcome names what actually happened. */
export const ACTION_CLASS: Record<string, string> = {
  DECLINED: "text-term-dim border-term-edge",
  TRADED: "text-signal-green border-signal-green/50",
  BLOCKED_BY_RISK: "text-amber border-amber/50",
  REJECTED_BY_VENUE: "text-amber border-amber/50",
  NO_MARKET_PRICE: "text-amber border-amber/50",
  ALREADY_HOLDING: "text-signal-cyan border-signal-cyan/40",
  NO_TRADABLE_EXPOSURE: "text-signal-cyan border-signal-cyan/40",
  EXECUTION_FAILED: "text-signal-red border-signal-red/50",
  ANALYSED: "text-signal-violet border-signal-violet/40",
  BLOCKED: "text-amber border-amber/50",
};

export const ACTION_LABEL: Record<string, string> = {
  DECLINED: "DECLINED",
  TRADED: "TRADED",
  BLOCKED_BY_RISK: "RISK-BLOCKED",
  REJECTED_BY_VENUE: "FILL REJECTED",
  NO_MARKET_PRICE: "NO PRICE",
  ALREADY_HOLDING: "ALREADY SHORT",
  NO_TRADABLE_EXPOSURE: "NO TRADE",
  EXECUTION_FAILED: "EXEC FAILED",
  ANALYSED: "ANALYSED",
  BLOCKED: "NO TRADE",
};

/** How strongly a figure is evidenced, strongest first. */
export const PROVENANCE_CLASS: Record<string, string> = {
  DISCLOSED: "text-signal-green border-signal-green/40",
  REPORTED: "text-signal-cyan border-signal-cyan/40",
  QUALITATIVE: "text-amber border-amber/40",
  INFERRED: "text-signal-violet border-signal-violet/40",
  ESTIMATED: "text-signal-red border-signal-red/40",
};
