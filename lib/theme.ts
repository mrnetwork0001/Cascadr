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
