"use client";

import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import type {
  ForceGraphMethods,
  ForceGraphProps,
  LinkObject,
  NodeObject,
} from "react-force-graph-2d";
import { forceCollide } from "d3-force";
import { EDGES, NODES } from "@/lib/mock/graph";
import { getLogo } from "@/lib/logos";
import { CONTAGION_COLOR, COLORS, TIER_COLOR } from "@/lib/theme";
import type { Contagion, GraphEdge, GraphNode } from "@/lib/types";

type NodeDatum = NodeObject<GraphNode>;
/**
 * force-graph owns `source`/`target`: they arrive as ids and are swapped for
 * node references once the layout loads, so the link type must not pin them
 * to strings the way GraphEdge does.
 */
type EdgeAttrs = Omit<GraphEdge, "source" | "target">;
type LinkDatum = LinkObject<GraphNode, EdgeAttrs>;

type FGComponent = ComponentType<
  ForceGraphProps<NodeDatum, LinkDatum> & {
    ref?: React.MutableRefObject<
      ForceGraphMethods<NodeDatum, LinkDatum> | undefined
    >;
  }
>;

interface Props {
  contagion: Record<string, Contagion>;
  exposure: Record<string, number>;
  activePath: string[];
  selected: string | null;
  onSelect: (id: string | null) => void;
}

/** Live state the canvas painter reads; kept in a ref, never in graph data. */
interface PaintState {
  contagion: Record<string, Contagion>;
  exposure: Record<string, number>;
  activePath: string[];
  selected: string | null;
}

export function GraphCanvas(props: Props) {
  const { contagion, exposure, activePath, selected, onSelect } = props;
  const wrap = useRef<HTMLDivElement>(null);
  const fg = useRef<ForceGraphMethods<NodeDatum, LinkDatum>>();
  const [size, setSize] = useState({ w: 0, h: 0 });

  /**
   * force-graph touches `window` at import time, so it cannot be server
   * rendered. Imported here rather than via next/dynamic because dynamic()'s
   * wrapper is a plain function component and would swallow the ref we need
   * for layout tuning and zoom-to-fit.
   */
  const [ForceGraph2D, setForceGraph2D] = useState<FGComponent | null>(null);
  useEffect(() => {
    let live = true;
    import("react-force-graph-2d").then((m) => {
      if (live) setForceGraph2D(() => m.default as unknown as FGComponent);
    });
    return () => {
      live = false;
    };
  }, []);

  /**
   * Built exactly once. force-graph mutates these objects in place with x/y and
   * swaps link endpoints for node references — handing it a fresh array on
   * every state change would reheat the simulation and make the graph jump.
   * Live state reaches the painter through the ref below instead.
   */
  const data = useMemo(
    () => ({
      nodes: NODES.map((n) => ({ ...n })) as NodeDatum[],
      links: EDGES.map((e) => ({ ...e })) as LinkDatum[],
    }),
    []
  );

  const state = useRef<PaintState>({ contagion, exposure, activePath, selected });
  state.current = { contagion, exposure, activePath, selected };

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ w: Math.floor(width), h: Math.floor(height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Collision keeps icons and their ticker labels apart; charge and link
  // distance stay tight on purpose, because spreading the layout out makes
  // zoom-to-fit shrink every icon below legibility.
  useEffect(() => {
    const g = fg.current;
    if (!g) return;
    g.d3Force("charge")?.strength(-160);
    g.d3Force("link")?.distance(44);
    g.d3Force(
      "collide",
      forceCollide<NodeDatum>((n) => radiusOf(n) + 9).strength(1).iterations(3)
    );
  }, [ForceGraph2D]);

  const isActiveEdge = (l: LinkDatum) => {
    const path = state.current.activePath;
    if (path.length < 2) return false;
    const s = endpointId(l.source);
    const t = endpointId(l.target);
    if (!s || !t) return false;
    const i = path.indexOf(s);
    return i !== -1 && path[i + 1] === t;
  };

  return (
    <div ref={wrap} className="relative h-full w-full">
      {ForceGraph2D && size.w > 0 ? (
        <ForceGraph2D
          ref={fg}
          width={size.w}
          height={size.h}
          graphData={data}
          backgroundColor={COLORS.void}
          nodeRelSize={1}
          cooldownTicks={140}
          onEngineStop={() => fg.current?.zoomToFit(500, 24)}
          // --- edges ---------------------------------------------------------
          linkColor={(l) => (isActiveEdge(l) ? COLORS.red : "rgba(43,54,68,0.9)")}
          linkWidth={(l) => (isActiveEdge(l) ? 1.8 : 0.5)}
          linkDirectionalParticles={(l) => (isActiveEdge(l) ? 4 : 0)}
          linkDirectionalParticleWidth={2}
          linkDirectionalParticleColor={() => COLORS.red}
          linkDirectionalArrowLength={3}
          linkDirectionalArrowRelPos={0.92}
          linkDirectionalArrowColor={() => "rgba(92,107,127,0.9)"}
          linkLabel={(l) =>
            `${l.component} · ${Math.round((l.dependency ?? 0) * 100)}% dependency`
          }
          // --- nodes ---------------------------------------------------------
          onNodeClick={(n) => onSelect(String(n.id))}
          onBackgroundClick={() => onSelect(null)}
          nodeCanvasObject={(node, ctx, scale) =>
            paintNode(node, ctx, scale, state.current)
          }
          nodePointerAreaPaint={(node, color, ctx) => {
            if (node.x == null || node.y == null) return;
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(node.x, node.y, radiusOf(node) + 3, 0, 2 * Math.PI);
            ctx.fill();
          }}
        />
      ) : (
        <div className="flex h-full items-center justify-center text-2xs uppercase tracking-widest text-term-dim">
          initialising force layout…
        </div>
      )}
    </div>
  );
}

/** Links start out with string endpoints and are swapped for node refs on load. */
function endpointId(end: LinkDatum["source"]): string | null {
  if (end == null) return null;
  if (typeof end === "object") return String(end.id);
  return String(end);
}

/** Radius tracks revenue, compressed so Apple does not dwarf Lynas off-screen. */
function radiusOf(node: NodeDatum): number {
  return 7 + Math.sqrt(node.revenueB ?? 1) * 0.45;
}

/** What to print under the icon: the tradable ticker where there is one. */
function labelOf(node: NodeDatum): string {
  return node.ticker ?? String(node.id).replace(/_/g, " ");
}

function paintNode(
  node: NodeDatum,
  ctx: CanvasRenderingContext2D,
  scale: number,
  s: PaintState
) {
  if (node.x == null || node.y == null) return;

  const id = String(node.id);
  const r = radiusOf(node);
  const status = s.contagion[id] ?? "NOMINAL";
  const hot = status !== "NOMINAL";
  // The icon carries identity, so the ring carries state: tier colour while
  // unaffected, contagion colour once the cascade reaches it.
  const color = hot ? CONTAGION_COLOR[status] : TIER_COLOR[node.tier];
  const isSelected = s.selected === id;

  // Critical nodes breathe - the one animation on screen, so it reads as alarm.
  if (status === "CRITICAL") {
    const phase = (Math.sin(Date.now() / 260) + 1) / 2;
    ctx.beginPath();
    ctx.arc(node.x, node.y, r + 3 + phase * 5, 0, 2 * Math.PI);
    ctx.strokeStyle = `rgba(255,59,82,${0.55 - phase * 0.38})`;
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }

  // Disc behind the icon: carries the glow, and keeps the node visible while
  // the icon is still loading.
  if (hot) {
    ctx.shadowColor = color;
    ctx.shadowBlur = status === "CRITICAL" ? 20 : 12;
  }
  ctx.beginPath();
  ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
  ctx.fillStyle = COLORS.panel;
  ctx.fill();
  ctx.shadowBlur = 0;

  const logo = getLogo(id);
  if (logo) {
    // Icons are square artwork designed to be cropped round.
    ctx.save();
    ctx.beginPath();
    ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
    ctx.clip();
    ctx.drawImage(logo, node.x - r, node.y - r, r * 2, r * 2);
    ctx.restore();
  } else {
    ctx.fillStyle = COLORS.text;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `700 ${r * 0.55}px ui-monospace, monospace`;
    ctx.fillText(labelOf(node).slice(0, 4), node.x, node.y);
  }

  ctx.beginPath();
  ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
  ctx.lineWidth = isSelected ? 2.4 : hot ? 2 : 1.2;
  ctx.strokeStyle = isSelected ? COLORS.bright : color;
  ctx.stroke();

  // Labels turn to mush when zoomed out; drop them rather than draw noise.
  if (scale < 0.5) return;

  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.font = `600 ${fontPx(6.6, scale)}px ui-monospace, monospace`;
  ctx.fillStyle = hot ? color : COLORS.text;
  ctx.fillText(labelOf(node), node.x, node.y + r + 2.5);

  const score = s.exposure[id];
  if (score && score > 0.05) {
    ctx.font = `600 ${fontPx(5.8, scale)}px ui-monospace, monospace`;
    ctx.fillStyle = CONTAGION_COLOR[status];
    ctx.fillText(
      `${(score * 100).toFixed(0)}%`,
      node.x,
      node.y + r + 3.5 + fontPx(6.6, scale)
    );
  }
}

/** Keeps label size roughly constant on screen as the user zooms. */
function fontPx(base: number, scale: number): number {
  return Math.max(base * 0.6, base / Math.max(scale, 0.75));
}
