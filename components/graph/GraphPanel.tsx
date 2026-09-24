"use client";

import { useMemo } from "react";
import { Panel } from "@/components/terminal/Panel";
import { GraphCanvas } from "@/components/graph/GraphCanvas";
import { GraphLegend } from "@/components/graph/GraphLegend";
import { NodeInspector } from "@/components/graph/NodeInspector";
import type { Contagion, Decision, Graph, Quote } from "@/lib/types";

interface Props {
  graph: Graph | null;
  graphError: string | null;
  decision: Decision | null;
  following: boolean;
  onFollow: () => void;
  quotes: Quote[];
  quotesError: string | null;
  node: string | null;
  onNode: (id: string | null) => void;
}

/**
 * The graph served by the API, coloured by the contagion that one real
 * decision implies. Which decision is drawn is stated in the header, so the
 * picture is never mistaken for a live event that did not happen.
 */
export function GraphPanel({ graph, graphError, decision, following, onFollow, quotes, quotesError, node, onNode }: Props) {
  const { contagion, exposure, activeEdges } = useMemo(() => {
    const c: Record<string, Contagion> = {};
    const x: Record<string, number> = {};
    const a = new Set<string>();
    for (const e of decision?.exposures ?? []) {
      c[e.target] = e.contagion;
      x[e.target] = e.score;
      for (let i = 0; i + 1 < e.hops.length; i++) a.add(`${e.hops[i]}>${e.hops[i + 1]}`);
    }
    return { contagion: c, exposure: x, activeEdges: a };
  }, [decision]);

  const prov = graph?.stats.edges_by_provenance ?? {};
  return (
    <Panel
      title="Supply Chain Knowledge Graph"
      flush
      // Stacked (mobile) the panel needs its own height; in the desktop column
      // it fills whatever the positions blotter leaves.
      className="h-[440px] min-h-0 sm:h-[520px] lg:h-auto lg:flex-1"
      meta={
        graph ? (
          <span className="flex flex-wrap items-center gap-x-3">
            <span>
              {graph.stats.nodes} companies · {graph.stats.edges} sourced links
            </span>
            <span className="hidden text-term-dim md:inline">
              {Object.entries(prov)
                .map(([k, v]) => `${v} ${k.toLowerCase()}`)
                .join(" · ")}
            </span>
          </span>
        ) : (
          <span className="text-signal-red">{graphError ?? "loading"}</span>
        )
      }
    >
      <div className="relative h-full w-full">
        {graph ? (
          <GraphCanvas
            nodes={graph.nodes}
            edges={graph.edges}
            contagion={contagion}
            exposure={exposure}
            activeEdges={activeEdges}
            selected={node}
            onSelect={onNode}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-2xs uppercase tracking-widest text-term-dim">
            {graphError ? "graph unavailable — cannot reach the API" : "loading graph…"}
          </div>
        )}
        {decision && (
          <div className="absolute left-2 top-2 max-w-[70%] border border-term-line bg-term-panel/90 px-2 py-1 backdrop-blur-sm">
            <p className="col-head flex items-center gap-2">
              <span>
                Showing decision #{decision.id} · {following ? "following latest" : "pinned"}
              </span>
              {!following && (
                <button type="button" onClick={onFollow} className="text-amber underline underline-offset-2 hover:text-term-bright">
                  follow latest
                </button>
              )}
            </p>
            <p className="truncate text-2xs text-term-text">{decision.headline}</p>
          </div>
        )}
        <GraphLegend />
        {graph && node && (
          <NodeInspector
            graph={graph}
            nodeId={node}
            quote={quotes.find((q) => q.id === node) ?? null}
            quoteStale={quotesError != null}
            onClose={() => onNode(null)}
          />
        )}
      </div>
    </Panel>
  );
}
