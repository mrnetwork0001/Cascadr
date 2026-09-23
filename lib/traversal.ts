import { DOWNSTREAM, NODE_BY_ID } from "@/lib/mock/graph";
import type { Contagion, ExposurePath, GraphEdge } from "@/lib/types";

/**
 * Each additional hop dilutes the shock: a fab outage hits its direct
 * customers hard and their customers' customers much less. Stand-in for the
 * learned propagation weights the GraphRAG chain will eventually produce.
 */
const HOP_DECAY = 0.62;
const MAX_HOPS = 3;

/** Below this the path is noise and we drop it rather than clutter the blotter. */
const MIN_SCORE = 0.08;

/**
 * Breadth-first walk of the downstream cone from `originId`, scoring every
 * reachable node by the product of edge dependencies, decayed per hop.
 * Keeps only the strongest path per target — that is the one the analyst
 * wants to read as the rationale.
 */
export function traverseContagion(
  originId: string,
  /** Severity of the originating event, 0..1. Scales every downstream score. */
  shock: number
): ExposurePath[] {
  const best = new Map<string, ExposurePath>();

  const queue: Array<{ id: string; hops: string[]; score: number; via: GraphEdge | null }> =
    [{ id: originId, hops: [originId], score: shock, via: null }];

  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (cur.hops.length > MAX_HOPS + 1) continue;

    for (const edge of DOWNSTREAM.get(cur.id) ?? []) {
      // Cycles are possible in real supply graphs (Samsung both supplies and
      // competes); never revisit a node inside the same path.
      if (cur.hops.includes(edge.target)) continue;

      const score = cur.score * edge.dependency * HOP_DECAY;
      if (score < MIN_SCORE) continue;

      const hops = [...cur.hops, edge.target];
      const prev = best.get(edge.target);
      if (!prev || score > prev.score) {
        best.set(edge.target, {
          target: edge.target,
          hops,
          score,
          rationale: describe(edge, hops.length - 1),
        });
      }
      queue.push({ id: edge.target, hops, score, via: edge });
    }
  }

  return Array.from(best.values()).sort((a, b) => b.score - a.score);
}

function describe(edge: GraphEdge, hops: number): string {
  const src = NODE_BY_ID.get(edge.source)?.name ?? edge.source;
  const dep = Math.round(edge.dependency * 100);
  return `${dep}% of ${edge.component} sourced from ${src} · ${hops}-hop exposure`;
}

/** Maps a continuous exposure score onto the four terminal alert states. */
export function scoreToContagion(score: number): Contagion {
  if (score >= 0.55) return "CRITICAL";
  if (score >= 0.32) return "STRESSED";
  if (score >= MIN_SCORE) return "WATCH";
  return "NOMINAL";
}

/**
 * Expected drawdown on the tokenized equity, in percent. Deliberately convex:
 * the market prices small disruptions away but re-rates severe ones.
 */
export function impliedDrawdownPct(score: number): number {
  return -(score ** 1.4) * 14.5;
}
