"use client";

import { useEffect, useMemo, useState } from "react";
import { GraphCanvas, useReducedMotion } from "@/components/graph/GraphCanvas";
import type { Contagion, Decision, Graph } from "@/lib/types";

/** The graph overlays' glass with a shadow short enough to stay inside the stage. */
const ROUTE_GLASS =
  "glass-strong shadow-[inset_1px_1px_0_rgba(255,255,255,0.6),0_0_0_1.3px_rgba(120,145,180,0.2),0_3px_10px_rgba(28,52,92,0.07)]";

/**
 * Hero graph: the real graph, coloured by the contagion of the agent's most
 * recent decision that implied any exposure. The highlighted route cycles
 * through that decision's own paths - motion over real data, not a replay.
 * With reduced motion every path is drawn at once and nothing cycles.
 */
export function GraphPreview({ graph, decision }: { graph: Graph; decision: Decision | null }) {
  const reduced = useReducedMotion();
  const { contagion, exposure, routes } = useMemo(() => {
    const c: Record<string, Contagion> = {};
    const x: Record<string, number> = {};
    const r: string[][] = [];
    for (const e of decision?.exposures ?? []) {
      c[e.target] = e.contagion;
      x[e.target] = e.score;
      if (e.hops.length > 1) r.push(e.hops);
    }
    return { contagion: c, exposure: x, routes: r.slice(0, 6) };
  }, [decision]);

  const [i, setI] = useState(0);
  useEffect(() => {
    if (reduced || routes.length < 2) return;
    const id = setInterval(() => setI((v) => (v + 1) % routes.length), 2600);
    return () => clearInterval(id);
  }, [routes.length, reduced]);
  const current = routes.length ? i % routes.length : 0;

  const activeEdges = useMemo(() => {
    const s = new Set<string>();
    for (const hops of reduced ? routes : routes.slice(current, current + 1)) {
      for (let k = 0; k + 1 < hops.length; k++) s.add(`${hops[k]}>${hops[k + 1]}`);
    }
    return s;
  }, [routes, current, reduced]);

  // Route labels use the same names the canvas prints under each icon.
  const label = useMemo(() => {
    const m = new Map(graph.nodes.map((n) => [n.id, n.ticker ?? n.id.replace(/_/g, " ")]));
    return (id: string) => m.get(id) ?? id.replace(/_/g, " ");
  }, [graph.nodes]);

  const route = routes[current];
  return (
    <div className="relative h-full w-full">
      <GraphCanvas
        nodes={graph.nodes}
        edges={graph.edges}
        contagion={contagion}
        exposure={exposure}
        activeEdges={activeEdges}
        selected={null}
        onSelect={() => {}}
        // Room above for the caption pill the landing lays over the graph,
        // and below for the route chip (its 16px inset, its height, a gap).
        fitPadding={{ top: 52, bottom: routes.length ? 64 : 24 }}
      />
      {route && (
        // The stage clips at its rounded edge, so the chip sits a little
        // higher than the caption pill and casts a short shadow that ends
        // inside the stage instead of being cut off flat.
        <div
          className={`${ROUTE_GLASS} pointer-events-none absolute bottom-4 left-3 z-10 flex max-w-[calc(100%-1.5rem)] items-center gap-2.5 rounded-full py-1.5 pl-3 pr-3`}
        >
          <span className="shrink-0 text-[10px] font-[520] uppercase tracking-[0.12em] text-muted">
            {reduced && routes.length > 1 ? `${routes.length} paths` : "Path"}
          </span>
          {reduced && routes.length > 1 ? (
            <span className="truncate text-[12px] font-[500] tracking-[-0.01em] text-ink-soft">
              {routes.every((r) => r[0] === routes[0][0]) ? `from ${label(routes[0][0])}` : "drawn together"}
            </span>
          ) : (
            <span className="flex min-w-0 items-center gap-1 truncate text-[12px] font-[500] tracking-[-0.01em] text-ink-soft">
              {route.map((h, k) => (
                <span key={`${h}-${k}`} className="flex shrink-0 items-center gap-1">
                  {k > 0 && (
                    <svg viewBox="0 0 18 8" className="h-2 w-3.5 shrink-0" aria-hidden="true">
                      <path d="M1 4h11" stroke="#4A78B0" strokeWidth="1.6" strokeLinecap="round" />
                      <path d="M17 4 11.5 1.3l1.3 2.7-1.3 2.7z" fill="#2F5F9E" />
                    </svg>
                  )}
                  <span className={k === route.length - 1 ? "text-ink" : undefined}>{label(h)}</span>
                </span>
              ))}
            </span>
          )}
          {!reduced && routes.length > 1 && (
            <span className="flex shrink-0 items-center gap-1" aria-hidden="true">
              {routes.map((_, k) => (
                <span
                  key={k}
                  className={`h-1.5 rounded-full transition-all duration-500 ease-[cubic-bezier(.16,1,.3,1)] ${
                    k === current ? "w-3.5 bg-accent" : "w-1.5 bg-track"
                  }`}
                />
              ))}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
