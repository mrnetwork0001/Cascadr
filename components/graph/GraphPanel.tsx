"use client";

import { Panel } from "@/components/terminal/Panel";
import { GraphCanvas } from "@/components/graph/GraphCanvas";
import { GraphLegend } from "@/components/graph/GraphLegend";
import { NodeInspector } from "@/components/graph/NodeInspector";
import { EDGES, NODES } from "@/lib/mock/graph";
import type { Contagion } from "@/lib/types";

interface Props {
  contagion: Record<string, Contagion>;
  exposure: Record<string, number>;
  activePath: string[];
  prices: Record<string, number>;
  selected: string | null;
  onSelect: (id: string | null) => void;
}

export function GraphPanel({
  contagion,
  exposure,
  activePath,
  prices,
  selected,
  onSelect,
}: Props) {
  const breached = Object.values(contagion).filter((c) => c !== "NOMINAL").length;

  return (
    <Panel
      title="Supply Chain Knowledge Graph"
      flush
      // Stacked (mobile) the panel needs its own height; in the desktop column
      // it fills whatever the positions blotter leaves.
      className="h-[440px] min-h-0 sm:h-[520px] lg:h-auto lg:flex-1"
      meta={
        <span className="flex items-center gap-3">
          <span>
            {NODES.length} nodes · {EDGES.length} edges
          </span>
          <span className={breached > 0 ? "text-signal-red" : "text-term-dim"}>
            {breached} breached
          </span>
        </span>
      }
    >
      <div className="relative h-full w-full">
        <GraphCanvas
          contagion={contagion}
          exposure={exposure}
          activePath={activePath}
          selected={selected}
          onSelect={onSelect}
        />
        <GraphLegend />
        {selected && (
          <NodeInspector
            nodeId={selected}
            contagion={contagion[selected] ?? "NOMINAL"}
            exposure={exposure[selected] ?? 0}
            price={prices[selected]}
            onClose={() => onSelect(null)}
          />
        )}
      </div>
    </Panel>
  );
}
