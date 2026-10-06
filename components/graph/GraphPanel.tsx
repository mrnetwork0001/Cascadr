"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Panel } from "@/components/terminal/Panel";
import { GRAPH_GLASS, GraphCanvas } from "@/components/graph/GraphCanvas";
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

/** Below this width the key starts folded, so it never covers a narrow graph. */
const KEY_OPEN_MIN_PX = 600;
/**
 * Width the header rail spends before its meta: the panel's padding, the
 * title in its 10.5px caps and the gap after it. What is left decides how
 * much of the graph's size the header can say on one line.
 */
const HEADER_TITLE_PX = 267;
/** Overlay geometry in px, mirrored from the classes below for zoom-to-fit. */
const EDGE_PX = 12;
const KEY_OPEN_W = 136;
const INSPECTOR_W = 372;

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

  // The key is open by default only where the graph has room for it; the
  // viewer's own toggle wins from then on.
  const stage = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [keyChoice, setKeyChoice] = useState<boolean | null>(null);
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Unless the viewer has chosen, the key also folds while the inspector is
  // open, so the two cards never crowd the graph between them.
  const keyRoomy = keyChoice ?? width >= KEY_OPEN_MIN_PX;
  const keyOpen = keyChoice ?? (keyRoomy && !node);

  // What the overlays cover, so the graph fits around them, and so a
  // company selected under the inspector is panned into view. The fit
  // ignores the inspector's auto-fold, so selecting does not re-zoom.
  const fitPadding = {
    top: decision ? 84 : 56,
    right: keyRoomy ? EDGE_PX * 2 + KEY_OPEN_W : 24,
    bottom: 20,
    left: 20,
  };
  const coverLeft = graph && node ? EDGE_PX + Math.min(INSPECTOR_W, width - EDGE_PX * 2) : 0;

  const prov = graph?.stats.edges_by_provenance ?? {};
  const breakdown = Object.entries(prov)
    .map(([k, v]) => `${v} ${k.toLowerCase()}`)
    .join(" · ");
  const counts = graph ? countsFor(graph, width) : null;
  return (
    <Panel
      title="Supply Chain Knowledge Graph"
      flush
      // Stacked (mobile) the panel needs its own height; in the desktop column
      // it fills whatever the positions blotter leaves.
      className="h-[440px] min-h-0 sm:h-[520px] lg:h-auto lg:flex-1"
      meta={
        graph ? (
          // Always one line, so this rail lines up with its neighbours'. The
          // evidence breakdown follows only where it fits: without room it
          // wraps onto a second line that the fixed height clips away.
          <span
            className="flex h-4 flex-wrap items-center justify-end gap-x-3 overflow-hidden whitespace-nowrap"
            title={`${graph.stats.nodes} companies · ${graph.stats.edges} sourced links${breakdown ? ` · ${breakdown}` : ""}`}
          >
            {counts && <span className="num min-w-0 truncate">{counts}</span>}
            {counts && breakdown && <span className="num shrink-0 text-muted">{breakdown}</span>}
          </span>
        ) : (
          <span className={`block truncate ${graphError ? "text-signal-red" : "text-muted"}`}>
            {graphError ?? "loading…"}
          </span>
        )
      }
    >
      <div ref={stage} className="relative h-full w-full">
        {graph ? (
          <GraphCanvas
            nodes={graph.nodes}
            edges={graph.edges}
            contagion={contagion}
            exposure={exposure}
            activeEdges={activeEdges}
            selected={node}
            onSelect={onNode}
            fitPadding={fitPadding}
            coverLeft={coverLeft}
          />
        ) : (
          <div className="flex h-full items-center justify-center gap-2 text-[11px] font-[470] uppercase tracking-[0.12em] text-muted">
            <span
              aria-hidden="true"
              className={`h-1.5 w-1.5 rounded-full ${graphError ? "bg-signal-red" : "bg-accent/70 motion-safe:animate-pulse"}`}
            />
            {graphError ? "graph unavailable — cannot reach the API" : "loading graph…"}
          </div>
        )}
        {decision && (
          // Capped at every width so it never runs under the key in the
          // opposite corner, folded (a pill) or open (a card).
          <div
            className={`${GRAPH_GLASS} absolute left-3 top-3 z-10 rounded-[18px] py-2 pl-3 pr-2 ${
              keyOpen
                ? "max-w-[calc(100%-11rem)] sm:max-w-[min(62%,520px,calc(100%-11rem))]"
                : "max-w-[calc(100%-9rem)] sm:max-w-[min(62%,520px,calc(100%-9rem))]"
            }`}
          >
            <div className="flex min-w-0 items-center gap-2">
              <span className="relative flex h-2 w-2 shrink-0" aria-hidden="true">
                {following && (
                  <span className="absolute -inset-[3px] rounded-full bg-accent/25 motion-safe:animate-pulse" />
                )}
                <span className={`relative h-2 w-2 rounded-full ${following ? "bg-accent" : "bg-muted/60"}`} />
              </span>
              <p className="min-w-0 truncate text-[10px] font-[520] uppercase tracking-[0.12em] text-muted">
                <span className="num">Decision #{decision.id}</span>
                <span className="text-muted/60"> · </span>
                {following ? "following latest" : "pinned"}
              </p>
              {!following && (
                <button
                  type="button"
                  onClick={onFollow}
                  className="group ml-auto flex h-6 shrink-0 items-center gap-1.5 rounded-full bg-cta pl-2.5 pr-[3px] text-[11px] font-[450] tracking-[-0.01em] text-white shadow-[0_6px_14px_rgba(11,26,50,0.18)] transition-transform duration-300 ease-[cubic-bezier(.2,.7,.3,1)] motion-safe:hover:-translate-y-px"
                >
                  Follow latest
                  <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-cta-knob" aria-hidden="true">
                    <svg viewBox="0 0 18 18" className="h-2.5 w-2.5" fill="none">
                      <path d="m6.6 3.6 6 5.4-6 5.4" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                </button>
              )}
            </div>
            <p className="mt-1 truncate pr-1 text-[12.5px] font-[450] leading-snug tracking-[-0.012em] text-ink" title={decision.headline}>
              {decision.headline}
            </p>
          </div>
        )}
        <GraphLegend open={keyOpen} onToggle={() => setKeyChoice(!keyOpen)} />
        {graph && node && (
          // Below the decision banner on wider screens; on a phone the card
          // takes the whole graph, like a sheet.
          <div
            className={`pointer-events-none absolute inset-x-3 bottom-3 z-20 flex flex-col justify-end ${
              decision ? "top-3 sm:top-20" : "top-3"
            }`}
          >
            <NodeInspector
              graph={graph}
              nodeId={node}
              quote={quotes.find((q) => q.id === node) ?? null}
              quoteStale={quotesError != null}
              onClose={() => onNode(null)}
            />
          </div>
        )}
      </div>
    </Panel>
  );
}

/**
 * The graph's size in as many words as the header has room for, from the
 * panel's measured width; nothing at all rather than a clipped number. Before
 * the first measurement the full wording is used and truncates if it must.
 */
function countsFor(graph: Graph, width: number): string | null {
  const { nodes, edges } = graph.stats;
  const room = width > 0 ? width - HEADER_TITLE_PX : Infinity;
  if (room >= 166) return `${nodes} companies · ${edges} sourced links`;
  if (room >= 122) return `${nodes} companies · ${edges} links`;
  if (room >= 86) return `${edges} sourced links`;
  if (room >= 40) return `${edges} links`;
  return null;
}
