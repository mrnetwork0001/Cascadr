"use client";

import { useEffect, useMemo, useState } from "react";
import { GraphCanvas } from "@/components/graph/GraphCanvas";
import { traverseContagion, scoreToContagion } from "@/lib/traversal";
import { NODES } from "@/lib/mock/graph";
import type { Contagion } from "@/lib/types";

/** The headline the preview is frozen on, matching scenario event 001. */
const ORIGIN = "TSMC";
const SHOCK = 0.88;

/**
 * Hero graph. Runs the same traversal the terminal runs — nothing here is a
 * hand-drawn mock — then cycles the highlighted route so the page has one
 * piece of motion without asking the visitor to press anything.
 */
export function GraphPreview() {
  const { contagion, exposure, routes } = useMemo(() => {
    const paths = traverseContagion(ORIGIN, SHOCK);

    const contagion: Record<string, Contagion> = Object.fromEntries(
      NODES.map((n) => [n.id, "NOMINAL" as Contagion])
    );
    const exposure: Record<string, number> = { [ORIGIN]: SHOCK };
    contagion[ORIGIN] = scoreToContagion(SHOCK);

    for (const p of paths) {
      exposure[p.target] = p.score;
      contagion[p.target] = scoreToContagion(p.score);
    }

    // Only the strongest few routes are worth cycling through.
    return { contagion, exposure, routes: paths.slice(0, 5).map((p) => p.hops) };
  }, []);

  const [i, setI] = useState(0);
  useEffect(() => {
    if (routes.length === 0) return;
    const id = setInterval(() => setI((v) => (v + 1) % routes.length), 2600);
    return () => clearInterval(id);
  }, [routes.length]);

  return (
    <GraphCanvas
      contagion={contagion}
      exposure={exposure}
      activePath={routes[i] ?? []}
      selected={null}
      onSelect={() => {}}
    />
  );
}
