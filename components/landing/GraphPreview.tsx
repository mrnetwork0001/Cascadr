"use client";

import { useEffect, useMemo, useState } from "react";
import { GraphCanvas } from "@/components/graph/GraphCanvas";
import type { Contagion, Decision, Graph } from "@/lib/types";

/**
 * Hero graph: the real graph, coloured by the contagion of the agent's most
 * recent decision that implied any exposure. The highlighted route cycles
 * through that decision's own paths - motion over real data, not a replay.
 */
export function GraphPreview({ graph, decision }: { graph: Graph; decision: Decision | null }) {
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
    if (routes.length < 2) return;
    const id = setInterval(() => setI((v) => (v + 1) % routes.length), 2600);
    return () => clearInterval(id);
  }, [routes.length]);

  const activeEdges = useMemo(() => {
    const s = new Set<string>();
    const hops = routes[i] ?? [];
    for (let k = 0; k + 1 < hops.length; k++) s.add(`${hops[k]}>${hops[k + 1]}`);
    return s;
  }, [routes, i]);

  return (
    <GraphCanvas
      nodes={graph.nodes}
      edges={graph.edges}
      contagion={contagion}
      exposure={exposure}
      activeEdges={activeEdges}
      selected={null}
      onSelect={() => {}}
    />
  );
}
