"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
} from "react";
import type {
  ForceGraphMethods,
  ForceGraphProps,
  LinkObject,
  NodeObject,
} from "react-force-graph-2d";
import { forceCollide, forceX, forceY } from "d3-force";
import { getLogo } from "@/lib/logos";
import { CONTAGION_COLOR, COLORS } from "@/lib/theme";
import type { Contagion, GraphEdge, GraphNode, Tier } from "@/lib/types";

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
  /** The graph served by the API. */
  nodes: GraphNode[];
  edges: GraphEdge[];
  contagion: Record<string, Contagion>;
  exposure: Record<string, number>;
  /** "SOURCE>TARGET" keys of edges on the selected decision's contagion paths. */
  activeEdges: Set<string>;
  selected: string | null;
  onSelect: (id: string | null) => void;
  /**
   * Screen pixels along each edge that overlays (banner, key, route chip)
   * cover. Zoom-to-fit keeps every company clear of them. Default 24 each.
   */
  fitPadding?: Partial<Insets>;
  /**
   * Width in px of a card covering the left of the canvas (the inspector).
   * A selected company hidden under it is panned into the uncovered part,
   * assuming nothing but a small margin covers the right meanwhile.
   */
  coverLeft?: number;
}

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** Live state the canvas painter reads; kept in a ref, never in graph data. */
interface PaintState {
  contagion: Record<string, Contagion>;
  exposure: Record<string, number>;
  activeEdges: Set<string>;
  selected: string | null;
  hover: string | null;
  reduced: boolean;
}

/* Light-glass palette for the canvas, derived from the theme tokens. */
const INK = COLORS.bright;
const INK_SOFT = COLORS.text;
const ACCENT = COLORS.accent;
const ACCENT_DEEP = "#2F5F9E";
const EDGE = "rgba(89,98,126,0.30)";
const EDGE_ARROW = "rgba(89,98,126,0.50)";
const LABEL_HALO = "rgba(246,248,252,0.94)";

/**
 * Tier tints for the hairline ring of an unaffected company, its key swatch
 * and the inspector's tier dot. Deliberately cool and neutral: amber, orange
 * and red on the graph only ever mean contagion, green only P&L elsewhere,
 * and the accent blue is kept for selection and the contagion route.
 */
export const TIER_TINT: Record<Tier, string> = {
  MATERIAL: "#5D52C8",
  SUPPLIER: "#2C86A6",
  MANUFACTURER: "#7A889C",
  LOGISTICS: "#A3AEBF",
  BRAND: "#1F2A44",
};

/** On-screen label sizes in px: the company name and its exposure under it. */
const NAME_PX = 10;
const SCORE_PX = 8.5;
/**
 * Screen pixels zoom-to-fit reserves for labels, which are drawn at a
 * constant screen size: below the lowest disc (gap, name, score) and beside
 * the outermost discs (half a long name such as PEGATRON past its disc).
 */
const LABEL_BELOW_PX = 4 + NAME_PX * 1.15 + SCORE_PX * 1.15;
const LABEL_SIDE_PX = 14;

/**
 * The frosted card every overlay on the graph uses (decision banner, key,
 * inspector, route chip): the global glass-strong surface plus an inner
 * highlight and a slightly deeper shadow so it lifts off the canvas.
 */
export const GRAPH_GLASS =
  "glass-strong shadow-[inset_1px_1px_0_rgba(255,255,255,0.6),0_0_0_1.3px_rgba(120,145,180,0.2),0_12px_30px_rgba(28,52,92,0.09)]";

/** True while the viewer has asked the OS for less motion; follows changes live. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return reduced;
}

/*
 * force-graph draws its hover tooltip into the container it creates; these
 * rules turn it into a small glass pill. Scoped to this component's wrapper.
 */
const TOOLTIP_CSS = `
.cascadr-graph .float-tooltip-kap{
  font:500 12px/1.35 var(--font-sans),Inter,Helvetica,Arial,sans-serif;
  letter-spacing:-0.01em;color:#0F182F;
  background:rgba(255,255,255,.88);
  border:1px solid rgba(255,255,255,.92);
  -webkit-backdrop-filter:blur(20px);backdrop-filter:blur(20px);
  box-shadow:0 0 0 1px rgba(120,145,180,.2),0 10px 24px rgba(28,52,92,.10);
  border-radius:12px;padding:6px 10px;max-width:min(320px,70%);
}
`;

export function GraphCanvas(props: Props) {
  const { nodes, edges, contagion, exposure, activeEdges, selected, onSelect, fitPadding, coverLeft = 0 } = props;
  const wrap = useRef<HTMLDivElement>(null);
  const fg = useRef<ForceGraphMethods<NodeDatum, LinkDatum>>();
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [hover, setHover] = useState<string | null>(null);
  const reduced = useReducedMotion();

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
   * Rebuilt only when the graph itself changes (a new node or edge set from
   * the API). force-graph mutates these objects in place with x/y and swaps
   * link endpoints for node references — handing it a fresh array on every
   * state change would reheat the simulation and make the graph jump. Live
   * state reaches the painter through the ref below instead.
   */
  const graphKey = useMemo(
    () =>
      nodes.map((n) => n.id).join(",") +
      "|" +
      edges.map((e) => `${e.source}>${e.target}:${e.dependency}`).join(","),
    [nodes, edges],
  );
  const data = useMemo(
    () => ({
      nodes: nodes.map((n) => ({ ...n })) as NodeDatum[],
      links: edges.map((e) => ({ ...e })) as LinkDatum[],
    }),
    // graphKey captures every change that matters; identity churn from
    // re-polling the same graph must not restart the layout.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [graphKey],
  );

  const state = useRef<PaintState>({
    contagion,
    exposure,
    activeEdges,
    selected,
    hover,
    reduced,
  });
  state.current = { contagion, exposure, activeEdges, selected, hover, reduced };

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

  // Scrolled out of view, the canvas stops redrawing.
  const [onScreen, setOnScreen] = useState(true);
  useEffect(() => {
    const el = wrap.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // The route flow and the critical halo are the only continuous motion; the
  // canvas keeps redrawing only while one of them is on screen.
  const animating =
    !reduced &&
    onScreen &&
    (activeEdges.size > 0 || Object.values(contagion).some((c) => c === "CRITICAL"));

  // The free part of the frame (inside the overlays), read by the layout
  // shaping, zoom-to-fit and focus below.
  const settled = useRef(false);
  const pad: Insets = {
    top: fitPadding?.top ?? 24,
    right: fitPadding?.right ?? 24,
    bottom: fitPadding?.bottom ?? 24,
    left: fitPadding?.left ?? 24,
  };
  const view = useRef({ pad, size });
  view.current = { pad, size };

  // Collision keeps icons and their ticker labels apart; charge and link
  // distance stay tight on purpose, because spreading the layout out makes
  // zoom-to-fit shrink every icon below legibility.
  const mounted = !!ForceGraph2D && size.w > 0;
  useEffect(() => {
    const g = fg.current;
    if (!g) return;
    g.d3Force("charge")?.strength(-160);
    g.d3Force("link")?.distance(44);
    g.d3Force(
      "collide",
      forceCollide<NodeDatum>((n) => outerRadiusOf(n) + 8)
        .strength(1)
        .iterations(3),
    );
    // A gentle pull toward one axis shapes the layout to the free part of
    // the frame it is drawn in: flatter for a wide panel, narrower for a
    // tall one. Square frames get no pull at all.
    const { pad: p, size: sz } = view.current;
    const ratio = Math.max(1, sz.w - p.left - p.right) / Math.max(1, sz.h - p.top - p.bottom);
    const pull = (r: number) => Math.min(0.05, Math.max(0, (r - 1) * 0.06));
    g.d3Force("shape-y", ratio > 1 ? forceY<NodeDatum>(0).strength(pull(ratio)) : null);
    g.d3Force("shape-x", ratio < 1 ? forceX<NodeDatum>(0).strength(pull(1 / ratio)) : null);
    // Runs once the canvas is mounted; reshaping on every resize would
    // reheat the layout under the viewer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  /*
   * Zoom-to-fit that knows about the overlays: the graph's box (with room for
   * the discs and the labels under them) is fitted into the part of the
   * canvas the overlays leave free, rather than the whole canvas. Discs scale
   * with the zoom, labels do not, so their room is reserved in screen pixels.
   */
  const fitView = (ms: number) => {
    const g = fg.current;
    if (!g) return;
    const bb = g.getGraphBbox();
    if (!bb || !Number.isFinite(bb.x[0]) || !Number.isFinite(bb.y[0])) return;
    const { pad: p, size: sz } = view.current;
    // The bounding box holds node centres; this is the largest disc's reach.
    const m = 20;
    const gw = bb.x[1] - bb.x[0] + 2 * m;
    const gh = bb.y[1] - bb.y[0] + 2 * m;
    const aw = Math.max(60, sz.w - p.left - p.right);
    const ah = Math.max(60, sz.h - p.top - p.bottom);
    const k = Math.max(
      0.05,
      Math.min((aw - 2 * LABEL_SIDE_PX) / gw, (ah - LABEL_BELOW_PX) / gh, 6),
    );
    const cx = (bb.x[0] + bb.x[1]) / 2;
    const cy = (bb.y[0] - m + bb.y[1] + m + LABEL_BELOW_PX / k) / 2;
    // centerAt() puts a graph point at the canvas centre; shift it so the box
    // centre lands on the centre of the free area instead.
    const sx = p.left + aw / 2 - sz.w / 2;
    const sy = p.top + ah / 2 - sz.h / 2;
    g.zoom(k, ms);
    g.centerAt(cx - sx / k, cy - sy / k, ms);
  };

  // Re-fit when the free area changes shape (a resize, the key opening).
  const fitSig = `${size.w}x${size.h}|${pad.top},${pad.right},${pad.bottom},${pad.left}`;
  useEffect(() => {
    if (!settled.current) return;
    const t = setTimeout(() => fitView(reduced ? 0 : 450), 120);
    return () => clearTimeout(t);
    // fitView reads the latest sizes through a ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitSig]);

  // Keep a newly selected company out from under the inspector.
  useEffect(() => {
    const g = fg.current;
    if (!g || !settled.current || !selected || coverLeft <= 0) return;
    const { size: sz } = view.current;
    // The panel folds its key while the inspector is open, so only a small
    // margin is lost on the right.
    const right = 24;
    const free = sz.w - coverLeft - right;
    if (free < 160) return;
    const n = data.nodes.find((d) => String(d.id) === selected);
    if (!n || n.x == null || n.y == null) return;
    const at = g.graph2ScreenCoords(n.x, n.y);
    const R = outerRadiusOf(n) * g.zoom();
    if (at.x - R > coverLeft + 8 && at.x + R < sz.w - right) return;
    const targetX = coverLeft + free / 2;
    const k = g.zoom();
    const c = g.centerAt();
    g.centerAt(c.x - (targetX - at.x) / k, c.y, reduced ? 0 : 500);
    // Runs on selection only: panning on every resize would fight the viewer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, coverLeft]);

  return (
    // The canvas is taken out of flow (absolute, inset 0) so its pixel width
    // can never prop the container open. In flow, a grid or flex parent could
    // not shrink below the canvas, the ResizeObserver never saw a smaller box,
    // and after rotating a phone to portrait the graph stayed landscape-wide
    // and ran 426px off the right edge.
    <div ref={wrap} className="cascadr-graph relative h-full w-full min-w-0 overflow-hidden">
      {/* A constant string, set raw so server and client markup match exactly. */}
      <style dangerouslySetInnerHTML={{ __html: TOOLTIP_CSS }} />
      {/* A soft studio light behind the graph; the panel's glass shows through. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 70% 60% at 50% 45%, rgba(255,255,255,0.55), rgba(255,255,255,0) 72%)",
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-50"
        style={{
          backgroundImage: "radial-gradient(rgba(120,145,180,0.28) 0.8px, transparent 1.2px)",
          backgroundSize: "22px 22px",
          WebkitMaskImage: "radial-gradient(ellipse 75% 70% at 50% 50%, #000 30%, transparent 85%)",
          maskImage: "radial-gradient(ellipse 75% 70% at 50% 50%, #000 30%, transparent 85%)",
        }}
      />
      {ForceGraph2D && size.w > 0 ? (
        <div className="absolute inset-0">
          <ForceGraph2D
            ref={fg}
            width={size.w}
            height={size.h}
            graphData={data}
            backgroundColor="rgba(0,0,0,0)"
            nodeRelSize={1}
            // With reduced motion the layout is solved before the first
            // frame, so nodes appear in place instead of drifting there.
            warmupTicks={reduced ? 160 : 0}
            cooldownTicks={reduced ? 0 : 140}
            autoPauseRedraw={!animating}
            onEngineStop={() => {
              settled.current = true;
              fitView(reduced ? 0 : 500);
            }}
            // --- edges ---------------------------------------------------------
            // Painted by hand (line, direction cue, route flow). linkWidth
            // still sizes the invisible hover area that drives the tooltip.
            linkCanvasObjectMode={() => "replace"}
            linkCanvasObject={(l, ctx, scale) => paintLink(l, ctx, scale, state.current)}
            linkWidth={2}
            linkLabel={(l) =>
              `${l.component} · ${Math.round((l.dependency ?? 0) * 100)}% dependency · ${l.provenance}`
            }
            // --- nodes ---------------------------------------------------------
            onNodeClick={(n) => onSelect(String(n.id))}
            onBackgroundClick={() => onSelect(null)}
            onNodeHover={(n) => setHover(n ? String(n.id) : null)}
            nodeCanvasObject={(node, ctx, scale) =>
              paintNode(node, ctx, scale, state.current)
            }
            // Labels go on last, over every disc and edge, so a neighbour
            // drawn later can never paint over a company's name.
            onRenderFramePost={(ctx, scale) =>
              paintLabels(data.nodes, ctx, scale, state.current, view.current.pad.top)
            }
            nodePointerAreaPaint={(node, color, ctx) => {
              if (node.x == null || node.y == null) return;
              ctx.fillStyle = color;
              ctx.beginPath();
              ctx.arc(node.x, node.y, outerRadiusOf(node) + 2, 0, 2 * Math.PI);
              ctx.fill();
            }}
          />
        </div>
      ) : (
        <div className="relative flex h-full items-center justify-center gap-2 text-[11px] font-[470] uppercase tracking-[0.12em] text-muted">
          <span className="h-1.5 w-1.5 rounded-full bg-accent/70 motion-safe:animate-pulse" aria-hidden="true" />
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

/** Radius tracks revenue, compressed so Apple does not dwarf Shin-Etsu off-screen. */
function radiusOf(node: NodeDatum): number {
  return 7 + Math.sqrt(node.revenue_b ?? 1) * 0.45;
}

/** The white glass rim around each logo. */
function rimOf(r: number): number {
  return Math.max(1.8, r * 0.17);
}

/** Logo plus rim: the disc as drawn, used for spacing, edges and hit-testing. */
function outerRadiusOf(node: NodeDatum): number {
  const r = radiusOf(node);
  return r + rimOf(r);
}

/** What to print under the icon: the tradable ticker where there is one. */
function labelOf(node: NodeDatum): string {
  return node.ticker ?? String(node.id).replace(/_/g, " ");
}

/* --- canvas helpers --------------------------------------------------------- */

let fontStack: string | null = null;
/** next/font hashes Inter's family name; read it once from the CSS variable. */
function uiFont(): string {
  if (fontStack) return fontStack;
  const fallback = `Inter, "Helvetica Neue", Helvetica, Arial, sans-serif`;
  if (typeof window === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue("--font-sans").trim();
  fontStack = v ? `${v}, ${fallback}` : fallback;
  return fontStack;
}

/** Shadows are not scaled by the canvas transform, so convert to bitmap pixels. */
function devicePx(scale: number): number {
  return scale * (typeof window === "undefined" ? 1 : window.devicePixelRatio || 1);
}

function rgba(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.replace(/(.)/g, "$1$1") : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/**
 * A label size in graph units that draws at `base` screen pixels across the
 * zooms a fitted view uses (phones fit at about 0.6). Zoomed out further,
 * labels shrink until they are dropped below 0.5; zoomed in close, they grow
 * with the discs.
 */
function fontPx(base: number, scale: number): number {
  return Math.max(base * 0.55, base / Math.max(scale, 0.58));
}

/* --- edges ------------------------------------------------------------------ */

function paintLink(
  link: LinkDatum,
  ctx: CanvasRenderingContext2D,
  scale: number,
  s: PaintState,
) {
  const a = link.source;
  const b = link.target;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return;
  if (a.x == null || a.y == null || b.x == null || b.y == null) return;

  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-3) return;
  const ux = dx / len;
  const uy = dy / len;

  // Lines stop short of each disc, so they read as connections, not spokes.
  const gap = 2.5 / scale;
  const ra = outerRadiusOf(a as NodeDatum) + gap;
  const rb = outerRadiusOf(b as NodeDatum) + gap;
  if (len <= ra + rb) return;
  const x0 = a.x + ux * ra;
  const y0 = a.y + uy * ra;
  const x1 = b.x - ux * rb;
  const y1 = b.y - uy * rb;

  const sId = endpointId(a);
  const tId = endpointId(b);
  const active = !!sId && !!tId && s.activeEdges.has(`${sId}>${tId}`);
  const touchesSelection = !!s.selected && (sId === s.selected || tId === s.selected);
  const px = 1 / scale;

  ctx.save();
  ctx.lineCap = "round";

  if (active) {
    // A soft wash under the route, then the route itself in the accent.
    ctx.strokeStyle = rgba(ACCENT, 0.14);
    ctx.lineWidth = 6 * px;
    line(ctx, x0, y0, x1, y1);
    ctx.strokeStyle = rgba(ACCENT, 0.75);
    ctx.lineWidth = 1.6 * px;
    line(ctx, x0, y0, x1, y1);

    if (!s.reduced) {
      // A short comet of light travels source -> target: the direction the
      // shock propagates. Period scales with length so speed is constant.
      const period = Math.max(1400, len * scale * 14);
      const t = (Date.now() % period) / period;
      const span = Math.min(0.45, (34 * px) / (len - ra - rb));
      const head = -span + t * (1 + span);
      const h0 = Math.max(0, head - span);
      const h1 = Math.min(1, head);
      if (h1 > h0) {
        const sx = x0 + (x1 - x0) * h0;
        const sy = y0 + (y1 - y0) * h0;
        const ex = x0 + (x1 - x0) * h1;
        const ey = y0 + (y1 - y0) * h1;
        const g = ctx.createLinearGradient(
          x0 + (x1 - x0) * (head - span),
          y0 + (y1 - y0) * (head - span),
          x0 + (x1 - x0) * head,
          y0 + (y1 - y0) * head,
        );
        g.addColorStop(0, rgba(ACCENT_DEEP, 0));
        g.addColorStop(0.75, rgba(ACCENT_DEEP, 0.85));
        g.addColorStop(1, "rgba(255,255,255,0.95)");
        ctx.strokeStyle = g;
        ctx.lineWidth = 2.6 * px;
        line(ctx, sx, sy, ex, ey);
      }
    }
    arrow(ctx, x1, y1, ux, uy, px, rgba(ACCENT_DEEP, 0.95), 1.15);
  } else {
    // Links of the selected company darken (ink, not accent: the accent line
    // means a contagion path, and the key says so).
    ctx.strokeStyle = touchesSelection ? "rgba(31,42,68,0.55)" : EDGE;
    ctx.lineWidth = (touchesSelection ? 1.3 : 1) * px;
    line(ctx, x0, y0, x1, y1);
    arrow(ctx, x1, y1, ux, uy, px, touchesSelection ? "rgba(31,42,68,0.75)" : EDGE_ARROW, 1);
  }
  ctx.restore();
}

function line(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number) {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

/** A small, screen-constant arrowhead whose tip touches the target's gap. */
function arrow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  ux: number,
  uy: number,
  px: number,
  color: string,
  k: number,
) {
  const L = 5.2 * px * k;
  const W = 2.5 * px * k;
  const bx = x - ux * L;
  const by = y - uy * L;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(bx - uy * W, by + ux * W);
  ctx.lineTo(x - ux * L * 0.72, y - uy * L * 0.72);
  ctx.lineTo(bx + uy * W, by - ux * W);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

/* --- nodes ------------------------------------------------------------------ */

function paintNode(
  node: NodeDatum,
  ctx: CanvasRenderingContext2D,
  scale: number,
  s: PaintState,
) {
  if (node.x == null || node.y == null) return;
  const x = node.x;
  const y = node.y;

  const id = String(node.id);
  const r = radiusOf(node);
  const R = r + rimOf(r);
  const px = 1 / scale;
  const dp = devicePx(scale);
  const status = s.contagion[id] ?? "NOMINAL";
  const hot = status !== "NOMINAL";
  const heat = CONTAGION_COLOR[status];
  const isSelected = s.selected === id;
  const isHover = s.hover === id && !isSelected;

  ctx.save();

  // 1. Contagion halo: a soft bloom in the severity colour. Critical breathes.
  if (hot) {
    const base = status === "CRITICAL" ? 12 : status === "STRESSED" ? 10 : 8;
    const phase =
      status === "CRITICAL" && !s.reduced ? (Math.sin(Date.now() / 520) + 1) / 2 : 0.5;
    const reach = R + (base + phase * 4) * Math.max(px * 2.2, 0.55);
    const g = ctx.createRadialGradient(x, y, R * 0.85, x, y, reach);
    const peak = status === "CRITICAL" ? 0.4 - phase * 0.12 : status === "STRESSED" ? 0.3 : 0.26;
    g.addColorStop(0, rgba(heat, peak));
    g.addColorStop(0.45, rgba(heat, peak * 0.4));
    g.addColorStop(1, rgba(heat, 0));
    ctx.beginPath();
    ctx.arc(x, y, reach, 0, 2 * Math.PI);
    ctx.fillStyle = g;
    ctx.fill();
  }

  // 2. Selection: an accent glow and a crisp accent ring just off the disc.
  if (isSelected) {
    const reach = R + 9 * Math.max(px * 1.6, 0.5);
    const g = ctx.createRadialGradient(x, y, R, x, y, reach);
    g.addColorStop(0, rgba(ACCENT, 0.24));
    g.addColorStop(1, rgba(ACCENT, 0));
    ctx.beginPath();
    ctx.arc(x, y, reach, 0, 2 * Math.PI);
    ctx.fillStyle = g;
    ctx.fill();
  }

  // 3. The glass disc: white with a soft top-left light and a navy drop shadow.
  ctx.shadowColor = isHover || isSelected ? "rgba(28,52,92,0.26)" : "rgba(28,52,92,0.18)";
  ctx.shadowBlur = R * (isHover ? 0.9 : 0.65) * dp;
  ctx.shadowOffsetY = R * 0.2 * dp;
  const disc = ctx.createRadialGradient(x - R * 0.35, y - R * 0.45, R * 0.1, x, y, R * 1.15);
  disc.addColorStop(0, "#FFFFFF");
  disc.addColorStop(0.55, "#F7F9FC");
  disc.addColorStop(1, "#E1E8F2");
  ctx.beginPath();
  ctx.arc(x, y, R, 0, 2 * Math.PI);
  ctx.fillStyle = disc;
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // 4. The company's own round icon, inset in the rim.
  const logo = getLogo(id);
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, 2 * Math.PI);
  ctx.clip();
  if (logo) {
    // Icons are square artwork designed to be cropped round.
    ctx.drawImage(logo, x - r, y - r, r * 2, r * 2);
  } else {
    ctx.fillStyle = "#EEF3F9";
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.fillStyle = INK_SOFT;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `600 ${r * 0.55}px ${uiFont()}`;
    ctx.fillText(labelOf(node).slice(0, 4), x, y);
  }
  // A faint dome of light over the icon, so it sits under glass.
  const dome = ctx.createLinearGradient(x, y - r, x, y + r * 0.2);
  dome.addColorStop(0, "rgba(255,255,255,0.30)");
  dome.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = dome;
  ctx.fillRect(x - r, y - r, r * 2, r * 1.2);
  ctx.restore();

  // Inner edge where icon meets rim.
  ctx.beginPath();
  ctx.arc(x, y, r, 0, 2 * Math.PI);
  ctx.lineWidth = px;
  ctx.strokeStyle = "rgba(15,27,49,0.10)";
  ctx.stroke();

  // 5. Hairline ring: tier colour while unaffected, severity once hit.
  ctx.beginPath();
  ctx.arc(x, y, R - px * 0.5, 0, 2 * Math.PI);
  if (hot) {
    ctx.lineWidth = 1.6 * px;
    ctx.strokeStyle = rgba(heat, 0.9);
  } else if (isHover) {
    ctx.lineWidth = 1.2 * px;
    ctx.strokeStyle = rgba(ACCENT, 0.7);
  } else {
    ctx.lineWidth = 1.1 * px;
    ctx.strokeStyle = rgba(TIER_TINT[node.tier] ?? TIER_TINT.MANUFACTURER, 0.6);
  }
  ctx.stroke();

  if (isSelected) {
    ctx.beginPath();
    ctx.arc(x, y, R + Math.max(2.6 * px, 1.1), 0, 2 * Math.PI);
    ctx.lineWidth = 1.8 * px;
    ctx.strokeStyle = ACCENT;
    ctx.stroke();
  }

  ctx.restore();
}

/* --- labels ----------------------------------------------------------------- */

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

function overlaps(a: Box, b: Box): boolean {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
}

function hitsDisc(b: Box, x: number, y: number, r: number): boolean {
  const dx = x - Math.max(b.x0, Math.min(x, b.x1));
  const dy = y - Math.max(b.y0, Math.min(y, b.y1));
  return dx * dx + dy * dy < r * r;
}

/**
 * Every company's name (and its exposure, when the decision gives it one),
 * set under its disc, or over, beside or off a corner of it where that is
 * taken. Placed in order of importance: the selected company, then those the
 * contagion reaches, then the largest. Those first two are always drawn; any
 * other label with no free spot is left off rather than drawn over a
 * neighbour (hovering any company still names it). Each sits on a soft halo
 * of the frame colour so it stays legible where it crosses an edge.
 */
function paintLabels(
  nodes: NodeDatum[],
  ctx: CanvasRenderingContext2D,
  scale: number,
  s: PaintState,
  topInset: number,
) {
  // Labels turn to mush when zoomed out; drop them rather than draw noise.
  if (scale < 0.5) return;
  const px = 1 / scale;
  const f = uiFont();
  const nameSize = fontPx(NAME_PX, scale);
  const scoreSize = fontPx(SCORE_PX, scale);
  const pad = 1.5 * px;

  const placed = nodes.filter((n) => n.x != null && n.y != null);
  const rank = (n: NodeDatum) => {
    const id = String(n.id);
    if (id === s.selected) return 0;
    return (s.contagion[id] ?? "NOMINAL") !== "NOMINAL" ? 1 : 2;
  };
  const order = [...placed].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      (s.exposure[String(b.id)] ?? 0) - (s.exposure[String(a.id)] ?? 0) ||
      radiusOf(b) - radiusOf(a) ||
      String(a.id).localeCompare(String(b.id)),
  );

  // The canvas in graph units, less a small margin: no label hangs off its
  // sides, and none is moved up under the overlays along its top.
  const t = ctx.getTransform();
  const dpr = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  const edge = 4 * dpr;
  const bounds = t.a && t.d
    ? {
        x0: (edge - t.e) / t.a,
        x1: (ctx.canvas.width - edge - t.e) / t.a,
        y0: (topInset * dpr - t.f) / t.d,
      }
    : { x0: -Infinity, x1: Infinity, y0: -Infinity };

  const taken: Box[] = [];
  ctx.save();
  ctx.textBaseline = "top";
  ctx.lineJoin = "round";
  ctx.strokeStyle = LABEL_HALO;
  ctx.lineWidth = nameSize * 0.36;

  for (const n of order) {
    const id = String(n.id);
    const x = n.x as number;
    const y = n.y as number;
    const isSelected = s.selected === id;
    const status = s.contagion[id] ?? "NOMINAL";
    const name = labelOf(n);
    const score = s.exposure[id];
    const scoreTxt = score && score > 0.05 ? `${(score * 100).toFixed(0)}%` : null;

    const nameFont = `${isSelected ? 600 : 500} ${nameSize}px ${f}`;
    const scoreFont = `600 ${scoreSize}px ${f}`;
    ctx.font = nameFont;
    let w = ctx.measureText(name).width;
    if (scoreTxt) {
      ctx.font = scoreFont;
      w = Math.max(w, ctx.measureText(scoreTxt).width);
    }
    const h = nameSize * 1.15 + (scoreTxt ? scoreSize * 1.15 : 0);
    const R = outerRadiusOf(n);
    const gap = (isSelected ? 3.6 : 2.6) * Math.max(px * 1.4, 0.6);
    // Where the label may go, in order of preference: under the disc, over
    // it, beside it, then off a corner. `ax` anchors the text for its alignment.
    const side = R + gap * 1.6;
    const corner = R * 0.72 + gap;
    const right = (top: number, dx: number) => ({ ax: x + dx, top, align: "left" as const, x0: x + dx });
    const left = (top: number, dx: number) => ({ ax: x - dx, top, align: "right" as const, x0: x - dx - w });
    const spots: { ax: number; top: number; align: CanvasTextAlign; x0: number }[] = [
      { ax: x, top: y + R + gap, align: "center", x0: x - w / 2 },
      { ax: x, top: y - R - gap - h, align: "center", x0: x - w / 2 },
      right(y - h / 2, side),
      left(y - h / 2, side),
      right(y + corner, corner),
      left(y + corner, corner),
      right(y - corner - h, corner),
      left(y - corner - h, corner),
    ];
    const boxOf = (sp: (typeof spots)[number]): Box => ({
      x0: sp.x0 - pad,
      x1: sp.x0 + w + pad,
      // Inter's caps sit a little inside the em box set by textBaseline "top".
      y0: sp.top + nameSize * 0.12 - pad,
      y1: sp.top + h - nameSize * 0.08 + pad,
    });
    const inside = (b: Box) => b.x0 >= bounds.x0 && b.x1 <= bounds.x1 && b.y0 >= bounds.y0;
    const clashes = (b: Box) =>
      taken.filter((o) => overlaps(b, o)).length +
      placed.filter((o) => o !== n && hitsDisc(b, o.x as number, o.y as number, outerRadiusOf(o) + pad)).length;

    // The selected company and every company the contagion reaches are
    // always named (the latter with their exposure, the point of the view):
    // without a free spot, they take the one that covers the least.
    const must = isSelected || status !== "NOMINAL";
    let spot = spots.find((sp) => inside(boxOf(sp)) && clashes(boxOf(sp)) === 0) ?? null;
    if (!spot && must) {
      const fair = spots.filter((sp) => inside(boxOf(sp)));
      spot = (fair.length ? fair : spots).reduce((a, b) => (clashes(boxOf(b)) < clashes(boxOf(a)) ? b : a));
    }
    if (!spot) continue;
    taken.push(boxOf(spot));

    ctx.textAlign = spot.align;
    ctx.font = nameFont;
    ctx.strokeText(name, spot.ax, spot.top);
    ctx.fillStyle = isSelected ? INK : INK_SOFT;
    ctx.fillText(name, spot.ax, spot.top);
    if (scoreTxt) {
      const ty = spot.top + nameSize * 1.15;
      ctx.font = scoreFont;
      ctx.strokeText(scoreTxt, spot.ax, ty);
      ctx.fillStyle = status !== "NOMINAL" ? CONTAGION_COLOR[status] : COLORS.dim;
      ctx.fillText(scoreTxt, spot.ax, ty);
    }
  }
  ctx.restore();
}
