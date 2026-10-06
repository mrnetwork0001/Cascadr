"use client";

import { useEffect, useRef } from "react";

/**
 * The hero's background plate, drawn in canvas 2D: a chain of glass spheres
 * (supply-chain nodes) joined by thin glass rods, on a pale studio backdrop
 * with soft travelling caustics. Every few seconds a light pulse leaves the
 * first node and runs down the chain - the cascade - dimming at each hop by
 * the graph's live hop decay, as the contagion model does.
 *
 * Built in layers so each frame repaints as little as possible: the backdrop
 * is painted once per size; the wall caustics are a small canvas the
 * compositor scales up; only the chain's own box is redrawn at full
 * resolution. ~30 fps, DPR capped at 2 (dropped to 1 and 20 fps if frames
 * prove slow), paused when the tab is hidden or the hero is off-screen, and
 * a single still frame for reduced motion, following the preference live.
 * No assets: everything is computed here.
 */

const TAU = Math.PI * 2;
const FRAME_COLOR = "#E6EDF6";

/** A pulse leaves the first node every PERIOD seconds, from FIRST on. */
const PULSE_FIRST = 2.6;
const PULSE_PERIOD = 8.5;
const HOP_START = 0.4;
const HOP_EVERY = 1.3;
const HOP_TRAVEL = 1.05;

/**
 * Over a sample of frames taken once the entrance has settled, an average
 * draw (ms) or gap between draws (ms) above these means the machine is
 * struggling, and the plate goes light.
 */
const SLOW_DRAW_MS = 12;
const SLOW_GAP_MS = 58;
const SAMPLE_FROM = 2.5;
const SAMPLE_FRAMES = 30;

interface Node {
  x: number;
  y: number;
  r: number;
  ph: number;
}

type Ball = { x: number; y: number; r: number };

interface Patch {
  c: HTMLCanvasElement;
  g: CanvasRenderingContext2D;
  p1: CanvasPattern;
  p2: CanvasPattern;
  mask: CanvasGradient;
  /** Texture tile size in patch pixels. */
  tile: number;
}

export function CascadeBackground({ decay = null }: { decay?: number | null }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLCanvasElement>(null);
  const wallRef = useRef<HTMLCanvasElement>(null);
  const chainRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const back = backRef.current;
    const wall = wallRef.current;
    const chain = chainRef.current;
    const ctx = chain?.getContext("2d");
    if (!root || !back || !wall || !chain || !ctx) return;

    const hop = Math.min(0.9, Math.max(0.45, decay ?? 0.62));
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");

    let W = 0;
    let H = 0;
    let dpr = 1;
    let u = 1;
    let nodes: Node[] = [];
    let box = { x: 0, y: 0, w: 0, h: 0 };
    let focus = { x: 0, y: 0 };
    let spheres: HTMLCanvasElement[] = [];
    let shadows: HTMLCanvasElement[] = [];
    let texture: HTMLCanvasElement | null = null;
    let patches: Patch[] = [];
    let shimmer: Patch | null = null;
    let causticsFrom = -1;
    let wallOpacity = -1;
    let idle = 0;

    let light = false;
    let frameMs = 1000 / 30;
    let timed = 0;
    let drawSum = 0;
    let gapSum = 0;

    let clock = 0;
    let lastNow = 0;
    let lastDraw = 0;
    let raf = 0;
    let running = false;
    let onscreen = true;
    let disposed = false;

    /* ------------------------------------------------------------ build */
    function rebuild(force = false) {
      const w = root!.clientWidth;
      const h = root!.clientHeight;
      const d = Math.min(light ? 1 : 2, window.devicePixelRatio || 1);
      if (!w || !h) return false;
      if (!force && w === W && h === H && d === dpr && spheres.length) return false;
      W = w;
      H = h;
      dpr = d;
      u = Math.min(W / 1280, H / 960);
      nodes = layout(W, H);

      // The backdrop: soft enough that 1x is indistinguishable, and painted once.
      const bd = Math.min(1, dpr);
      back!.width = Math.round(W * bd);
      back!.height = Math.round(H * bd);
      paintBackdrop(back!, W, H, bd);

      // The chain's box: everything a node can light, shadow or float into.
      const pad = 30 + 0.02 * Math.max(W, H) + 4 * u;
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      for (const n of nodes) {
        x0 = Math.min(x0, n.x - 1.75 * n.r);
        y0 = Math.min(y0, n.y - 1.75 * n.r);
        x1 = Math.max(x1, n.x + 1.8 * n.r);
        y1 = Math.max(y1, n.y + 1.76 * n.r);
      }
      x0 = Math.max(0, Math.floor(x0 - pad));
      y0 = Math.max(0, Math.floor(y0 - pad));
      x1 = Math.min(W, Math.ceil(x1 + pad));
      y1 = Math.min(H, Math.ceil(y1 + pad));
      box = { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
      Object.assign(chain!.style, { left: `${box.x}px`, top: `${box.y}px`, width: `${box.w}px`, height: `${box.h}px` });
      chain!.width = Math.round(box.w * dpr);
      chain!.height = Math.round(box.h * dpr);
      focus = {
        x: nodes.reduce((a, n) => a + n.x, 0) / nodes.length,
        y: nodes.reduce((a, n) => a + n.y, 0) / nodes.length,
      };

      spheres = nodes.map((n) => paintSphere(n.r, dpr));
      shadows = nodes.map((n) => paintShadow(n.r, dpr));
      buildPatches();
      return true;
    }

    function buildPatches() {
      patches = [];
      shimmer = null;
      if (!texture) return;
      const res = dpr * 0.5;
      patches = nodes
        .map((n) => makePatch(texture!, n.r * 0.85, res, n.r * 1.25 * res))
        .filter((p): p is Patch => p !== null);
      // Wide, faint caustics on the wall behind the chain, scaled up by the
      // compositor: they are soft, so a quarter of the resolution is plenty.
      const at =
        W <= H
          ? { x: W * 0.8, y: H * 0.48, r: Math.max(W, H) * 0.5 }
          : { x: W * 0.78, y: H * 0.5, r: Math.max(W, H) * 0.46 };
      const wres = dpr * 0.25;
      shimmer = makePatch(texture, at.r, wres, 300 * u * wres, wall!);
      Object.assign(wall!.style, {
        left: `${at.x - at.r}px`,
        top: `${at.y - at.r}px`,
        width: `${at.r * 2}px`,
        height: `${at.r * 2}px`,
      });
    }

    /* ------------------------------------------------------------- draw */
    function draw(t: number) {
      if (!ctx || !W) return;
      const fade = causticsFrom === -Infinity ? 1 : causticsFrom < 0 ? 0 : Math.min(1, (t - causticsFrom) / 2.5);

      if (shimmer) {
        const o = +(0.42 * fade).toFixed(3);
        if (o !== wallOpacity) {
          wallOpacity = o;
          wall!.style.opacity = String(o);
        }
        if (o > 0) renderPatch(shimmer, t, 0.55, 0.035);
      }

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      ctx.clearRect(0, 0, chain!.width, chain!.height);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";

      // An almost imperceptible push-in toward the chain.
      const s = 1 + 0.014 * (0.5 - 0.5 * Math.cos((TAU * t) / 38));
      ctx.setTransform(
        dpr * s,
        0,
        0,
        dpr * s,
        dpr * (focus.x * (1 - s) - box.x),
        dpr * (focus.y * (1 - s) - box.y),
      );

      // Nodes float a touch, each on its own phase.
      const pos: Ball[] = nodes.map((n) => ({
        x: n.x + 1.6 * u * Math.sin((TAU * t) / 11 + n.ph),
        y: n.y + 2.2 * u * Math.sin((TAU * t) / 13.5 + n.ph * 1.3),
        r: n.r,
      }));
      const glow = nodes.map((_, k) => nodeGlow(t, k));

      // Shadows on the backdrop, each with the light the sphere focuses.
      for (let k = 0; k < pos.length; k++) {
        const p = pos[k];
        const R = p.r * 1.5;
        ctx.drawImage(shadows[k], p.x + p.r * 0.5 - R, p.y + p.r * 0.62 - R, R * 2, R * 2);
      }

      // Moving caustics inside each shadow; brighter while a pulse passes.
      if (fade > 0) {
        for (let k = 0; k < patches.length && k < pos.length; k++) {
          const p = pos[k];
          const pr = p.r * 0.85;
          renderPatch(patches[k], t + k * 7.1, 1, 0);
          ctx.globalAlpha = Math.min(1, (0.8 + 0.6 * glow[k]) * fade);
          ctx.drawImage(patches[k].c, p.x + p.r * 0.5 - pr, p.y + p.r * 0.62 - pr, pr * 2, pr * 2);
        }
        ctx.globalAlpha = 1;
      }

      for (let k = 0; k + 1 < pos.length; k++) rod(pos[k], pos[k + 1]);

      for (let k = 0; k < pos.length; k++) {
        const p = pos[k];
        const R = p.r * 1.3;
        ctx.drawImage(spheres[k], p.x - R, p.y - R, R * 2, R * 2);
      }

      // The cascade: node glows and the bead running down each rod.
      for (let k = 0; k < pos.length; k++) if (glow[k] > 0.004) nodeLight(pos[k], glow[k]);
      for (let k = 0; k + 1 < pos.length; k++) bead(t, k, pos[k], pos[k + 1]);
    }

    /**
     * How much light reaches hop k: it falls with the graph's hop decay, as a
     * shock does, held above a floor so the eye can follow it to the end.
     */
    function reach(k: number): number {
      return 0.3 + 0.7 * Math.pow(hop, k);
    }

    /** 0..1 light on node k at time t. */
    function nodeGlow(t: number, k: number): number {
      if (t < PULSE_FIRST) return 0;
      let total = 0;
      // The current pulse and the tail of the previous one.
      for (let back = 0; back < 2; back++) {
        if (back && t - PULSE_FIRST < PULSE_PERIOD) break;
        const tau = ((t - PULSE_FIRST) % PULSE_PERIOD) + back * PULSE_PERIOD;
        const arrive = k === 0 ? 0 : HOP_START + (k - 1) * HOP_EVERY + HOP_TRAVEL;
        const x = tau - arrive;
        if (x < 0) continue;
        const env = x < 0.2 ? x / 0.2 : Math.exp(-(x - 0.2) / 0.9);
        total += reach(k) * env;
      }
      return Math.min(1, total);
    }

    function rodGeometry(a: Ball, b: Ball) {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      return {
        x0: a.x + ux * a.r * 0.97,
        y0: a.y + uy * a.r * 0.97,
        x1: b.x - ux * b.r * 0.97,
        y1: b.y - uy * b.r * 0.97,
        ux,
        uy,
        // Normal pointing up-left, toward the key light.
        nx: uy > 0 ? uy : -uy,
        ny: uy > 0 ? -ux : ux,
        w: Math.min(9, Math.max(2.4, Math.min(a.r, b.r) * 0.085)),
      };
    }

    function line(x0: number, y0: number, x1: number, y1: number) {
      ctx!.beginPath();
      ctx!.moveTo(x0, y0);
      ctx!.lineTo(x1, y1);
      ctx!.stroke();
    }

    function rod(a: Ball, b: Ball) {
      const c = ctx!;
      const g = rodGeometry(a, b);
      c.lineCap = "butt";
      // Body: a translucent glass cylinder.
      c.strokeStyle = "rgba(200,215,234,0.5)";
      c.lineWidth = g.w;
      line(g.x0, g.y0, g.x1, g.y1);
      // Silhouette edges.
      const e = g.w / 2 - 0.4;
      c.strokeStyle = "rgba(86,114,156,0.42)";
      c.lineWidth = 0.9;
      line(g.x0 + g.nx * e, g.y0 + g.ny * e, g.x1 + g.nx * e, g.y1 + g.ny * e);
      line(g.x0 - g.nx * e, g.y0 - g.ny * e, g.x1 - g.nx * e, g.y1 - g.ny * e);
      // Specular line on the lit side, and a fainter refracted one opposite.
      c.strokeStyle = "rgba(255,255,255,0.95)";
      c.lineWidth = Math.max(0.8, g.w * 0.2);
      line(g.x0 + g.nx * g.w * 0.2, g.y0 + g.ny * g.w * 0.2, g.x1 + g.nx * g.w * 0.2, g.y1 + g.ny * g.w * 0.2);
      c.strokeStyle = "rgba(255,255,255,0.45)";
      c.lineWidth = Math.max(0.6, g.w * 0.12);
      line(g.x0 - g.nx * g.w * 0.28, g.y0 - g.ny * g.w * 0.28, g.x1 - g.nx * g.w * 0.28, g.y1 - g.ny * g.w * 0.28);
    }

    function nodeLight(p: Ball, gl: number) {
      const c = ctx!;
      // A blue bloom around the node.
      let rg = c.createRadialGradient(p.x, p.y, p.r * 0.92, p.x, p.y, p.r * 1.7);
      rg.addColorStop(0, `rgba(96,146,212,${0.3 * gl})`);
      rg.addColorStop(1, "rgba(96,146,212,0)");
      c.fillStyle = rg;
      c.beginPath();
      c.arc(p.x, p.y, p.r * 1.7, 0, TAU);
      c.fill();
      // Light filling the glass: a white core, the rim catching blue.
      rg = c.createRadialGradient(p.x + p.r * 0.12, p.y + p.r * 0.22, 0, p.x, p.y, p.r);
      rg.addColorStop(0, `rgba(255,255,255,${0.75 * gl})`);
      rg.addColorStop(0.5, `rgba(214,231,252,${0.38 * gl})`);
      rg.addColorStop(0.86, `rgba(98,148,214,${0.3 * gl})`);
      rg.addColorStop(1, `rgba(74,120,176,${0.42 * gl})`);
      c.fillStyle = rg;
      c.beginPath();
      c.arc(p.x, p.y, p.r, 0, TAU);
      c.fill();
      c.strokeStyle = `rgba(255,255,255,${0.9 * gl})`;
      c.lineWidth = Math.max(1.2, p.r * 0.028);
      c.beginPath();
      c.arc(p.x, p.y, p.r - c.lineWidth, 0, TAU);
      c.stroke();
    }

    function bead(t: number, k: number, a: Ball, b: Ball) {
      if (t < PULSE_FIRST) return;
      const c = ctx!;
      const tau = (t - PULSE_FIRST) % PULSE_PERIOD;
      const q = (tau - (HOP_START + k * HOP_EVERY)) / HOP_TRAVEL;
      if (q <= 0 || q >= 1) return;
      const e = 0.5 - 0.5 * Math.cos(Math.PI * q);
      const g = rodGeometry(a, b);
      const x = g.x0 + (g.x1 - g.x0) * e;
      const y = g.y0 + (g.y1 - g.y0) * e;
      // Leaves one sphere and sinks into the next; dimmer with each hop.
      const I = reach(k + e) * Math.min(1, q / 0.12, (1 - q) / 0.12);
      const len = Math.hypot(g.x1 - g.x0, g.y1 - g.y0);
      const tail = Math.min(len * e, len * 0.45);
      const tx = x - g.ux * tail;
      const ty = y - g.uy * tail;
      // The rod fills with light behind the bead.
      const lg = c.createLinearGradient(tx, ty, x, y);
      lg.addColorStop(0, "rgba(74,120,176,0)");
      lg.addColorStop(0.7, `rgba(96,146,212,${0.38 * I})`);
      lg.addColorStop(1, `rgba(150,190,240,${0.8 * I})`);
      c.lineCap = "round";
      c.strokeStyle = lg;
      c.lineWidth = g.w * 0.95;
      line(tx, ty, x, y);
      const rb = Math.max(10, g.w * 3.2);
      const rg = c.createRadialGradient(x, y, 0, x, y, rb);
      rg.addColorStop(0, `rgba(255,255,255,${I})`);
      rg.addColorStop(0.16, `rgba(255,255,255,${0.95 * I})`);
      rg.addColorStop(0.32, `rgba(132,176,232,${0.7 * I})`);
      rg.addColorStop(0.62, `rgba(74,120,176,${0.2 * I})`);
      rg.addColorStop(1, "rgba(74,120,176,0)");
      c.fillStyle = rg;
      c.beginPath();
      c.arc(x, y, rb, 0, TAU);
      c.fill();
    }

    /* ------------------------------------------------------------- loop */
    function frame(now: number) {
      raf = 0;
      if (!running) return;
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.1, (now - lastNow) / 1000);
      lastNow = now;
      clock += dt;
      if (now - lastDraw < frameMs - 2) return;
      const gap = now - lastDraw;
      const fresh = lastDraw === 0;
      lastDraw = now;
      const t0 = performance.now();
      draw(clock);
      // Measure once; on a machine that struggles, trade resolution and
      // rate for staying calm (the plate is soft, so it barely shows).
      if (!light && !fresh && clock > SAMPLE_FROM && timed < SAMPLE_FRAMES) {
        drawSum += performance.now() - t0;
        gapSum += Math.min(gap, 250);
        if (++timed === SAMPLE_FRAMES && (drawSum / timed > SLOW_DRAW_MS || gapSum / timed > SLOW_GAP_MS)) {
          light = true;
          frameMs = 1000 / 20;
          if (rebuild(true)) draw(clock);
        }
      }
    }

    function canRun() {
      return !disposed && !reduce.matches && !document.hidden && onscreen;
    }

    function sync() {
      if (canRun()) {
        if (running) return;
        running = true;
        lastNow = performance.now();
        lastDraw = 0;
        raf = requestAnimationFrame(frame);
      } else {
        running = false;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        // Reduced motion holds one calm frame, with no pulse in flight.
        if (reduce.matches) {
          clock = 0;
          if (texture) causticsFrom = -Infinity;
          draw(0);
        }
      }
    }

    let pending = 0;
    function onResize() {
      if (pending) return;
      pending = requestAnimationFrame(() => {
        pending = 0;
        if (rebuild()) draw(clock);
      });
    }

    function loadCaustics() {
      texture = makeCausticTexture(256);
      buildPatches();
      wallOpacity = -1;
      // A still frame shows them at full strength; in motion they fade in.
      causticsFrom = reduce.matches ? -Infinity : clock;
      if (!running) draw(clock);
    }

    rebuild();
    draw(0);
    root.setAttribute("data-ready", "");

    // The caustic texture is the one costly computation; keep it off the
    // first frames so it never competes with the entrance.
    const win = window as Window & {
      requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
      cancelIdleCallback?: (h: number) => void;
    };
    const idleApi = typeof win.requestIdleCallback === "function" && typeof win.cancelIdleCallback === "function";
    const later = () => {
      if (!disposed) loadCaustics();
    };
    idle = idleApi ? win.requestIdleCallback!(later, { timeout: 1500 }) : window.setTimeout(later, 600);

    const ro = new ResizeObserver(onResize);
    ro.observe(root);
    const io = new IntersectionObserver((entries) => {
      onscreen = entries.some((e) => e.isIntersecting);
      sync();
    });
    io.observe(root);
    document.addEventListener("visibilitychange", sync);
    reduce.addEventListener("change", sync);
    sync();

    return () => {
      disposed = true;
      running = false;
      if (raf) cancelAnimationFrame(raf);
      if (pending) cancelAnimationFrame(pending);
      if (idleApi) win.cancelIdleCallback!(idle);
      else window.clearTimeout(idle);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", sync);
      reduce.removeEventListener("change", sync);
    };
  }, [decay]);

  return (
    <div ref={rootRef} className="cx-bg" aria-hidden="true">
      <canvas ref={backRef} className="cx-bg-back" />
      <canvas ref={wallRef} className="cx-bg-wall" />
      <i className="cx-bg-fade" />
      <canvas ref={chainRef} className="cx-bg-chain" />
    </div>
  );
}

/* ===================================================================== */

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

/**
 * Where the nodes sit. Landscape follows the hero's own anchoring (the
 * headline hugs the left, the glass column the right), so the chain keeps
 * clear of the type at every aspect: it starts above the headline's end and
 * descends through the gaps around the panel to the bottom-right.
 */
function layout(W: number, H: number): Node[] {
  const u = Math.min(W / 1280, H / 960);
  if (W > H) {
    return [
      // Free-standing, above the headline's end and clear of the nav.
      { x: W / 2 + 165 * u, y: H / 2 - 238 * u, r: 110 * u, ph: 0.3 },
      // Under the status panel, so its frosted glass has something to frost.
      { x: W - 330 * u, y: H / 2 + 40 * u, r: 56 * u, ph: 2.1 },
      // In the gap between the panel and the meet pill.
      { x: W - 250 * u, y: H - 270 * u, r: 72 * u, ph: 4.0 },
      { x: W - 50 * u, y: H - 212 * u, r: 36 * u, ph: 5.2 },
    ];
  }
  // Portrait: the type spans the width, so the chain keeps to the bands it
  // leaves free - the top-right, beside the headline's end, under the panel
  // and beside the figures.
  const m = Math.min(W, H * 0.62);
  return [
    { x: W * 0.78, y: H * 0.19, r: m * 0.19, ph: 0.3 },
    { x: W * 0.95, y: H * 0.355, r: m * 0.06, ph: 2.1 },
    { x: W * 0.74, y: H * 0.52, r: m * 0.13, ph: 4.0 },
    { x: W * 0.88, y: H * 0.745, r: m * 0.07, ph: 5.2 },
  ];
}

function noiseTile(): HTMLCanvasElement {
  const c = makeCanvas(96, 96);
  const g = c.getContext("2d");
  if (!g) return c;
  const img = g.createImageData(96, 96);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random() < 0.5 ? 0 : 255;
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = Math.round(Math.random() * 9);
  }
  g.putImageData(img, 0, 0);
  return c;
}

/** The studio backdrop, painted into `c`: pale blue-white, lit high on the right. */
function paintBackdrop(c: HTMLCanvasElement, W: number, H: number, dpr: number) {
  const g = c.getContext("2d", { alpha: false });
  if (!g) return;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const M = Math.max(W, H);
  g.fillStyle = FRAME_COLOR;
  g.fillRect(0, 0, W, H);

  const radial = (x: number, y: number, r: number, stops: [number, string][]) => {
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    for (const [o, col] of stops) rg.addColorStop(o, col);
    g.fillStyle = rg;
    g.fillRect(0, 0, W, H);
  };
  // Key light: a broad soft bloom high on the right of centre.
  radial(W * 0.66, H * 0.14, M * 0.8, [
    [0, "rgba(252,253,255,0.96)"],
    [0.3, "rgba(245,248,253,0.75)"],
    [0.66, "rgba(233,239,247,0.25)"],
    [1, "rgba(230,237,246,0)"],
  ]);
  // Cool fall-off low on the left.
  radial(W * 0.02, H * 1.02, M * 0.62, [
    [0, "rgba(204,216,233,0.5)"],
    [1, "rgba(204,216,233,0)"],
  ]);
  // A faint second light low on the right, where the chain ends.
  radial(W * 0.92, H * 0.88, M * 0.42, [
    [0, "rgba(250,252,255,0.55)"],
    [1, "rgba(250,252,255,0)"],
  ]);
  // The sweep where the backdrop curves away: a soft horizontal sheen.
  const lg = g.createLinearGradient(0, H * 0.5, 0, H);
  lg.addColorStop(0, "rgba(255,255,255,0)");
  lg.addColorStop(0.5, "rgba(255,255,255,0.16)");
  lg.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = lg;
  g.fillRect(0, H * 0.5, W, H * 0.5);
  // Fine grain so the gradients never band.
  const pat = g.createPattern(noiseTile(), "repeat");
  if (pat) {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = pat;
    g.fillRect(0, 0, c.width, c.height);
  }
}

/** One glass sphere, pre-rendered at device resolution with room for its rim bloom. */
function paintSphere(r: number, dpr: number): HTMLCanvasElement {
  const R = r * 1.3;
  const c = makeCanvas(R * 2 * dpr, R * 2 * dpr);
  const g = c.getContext("2d");
  if (!g) return c;
  g.scale(dpr, dpr);
  g.translate(R, R);

  // Rim bloom just outside the silhouette.
  let rg = g.createRadialGradient(0, 0, r * 0.97, 0, 0, r * 1.28);
  rg.addColorStop(0, "rgba(255,255,255,0.55)");
  rg.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = rg;
  g.beginPath();
  g.arc(0, 0, r * 1.28, 0, TAU);
  g.fill();

  g.save();
  g.beginPath();
  g.arc(0, 0, r, 0, TAU);
  g.clip();

  // Refraction turns the room upside down: the dimmer floor shows at the
  // top of the ball, the bright key light pools at the bottom.
  const lg = g.createLinearGradient(0, -r, 0, r);
  lg.addColorStop(0, "rgba(166,187,214,0.52)");
  lg.addColorStop(0.36, "rgba(204,218,236,0.3)");
  lg.addColorStop(0.62, "rgba(238,244,251,0.4)");
  lg.addColorStop(1, "rgba(255,255,255,0.8)");
  g.fillStyle = lg;
  g.fillRect(-r, -r, r * 2, r * 2);

  // The inverted horizon: a soft darker band across the upper third.
  g.save();
  g.scale(1, 0.3);
  rg = g.createRadialGradient(-0.1 * r, (-0.3 * r) / 0.3, 0, -0.1 * r, (-0.3 * r) / 0.3, r);
  rg.addColorStop(0, "rgba(104,132,172,0.2)");
  rg.addColorStop(1, "rgba(104,132,172,0)");
  g.fillStyle = rg;
  g.fillRect(-r, -r / 0.3, r * 2, (r * 2) / 0.3);
  g.restore();

  // Light focused through the glass, pooling low and right.
  rg = g.createRadialGradient(0.16 * r, 0.54 * r, 0, 0.16 * r, 0.54 * r, 0.64 * r);
  rg.addColorStop(0, "rgba(255,255,255,0.92)");
  rg.addColorStop(0.45, "rgba(255,255,255,0.38)");
  rg.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = rg;
  g.fillRect(-r, -r, r * 2, r * 2);

  // A trace of the accent in the body of the glass.
  rg = g.createRadialGradient(-0.25 * r, -0.15 * r, 0, -0.25 * r, -0.15 * r, r);
  rg.addColorStop(0, "rgba(74,120,176,0.07)");
  rg.addColorStop(1, "rgba(74,120,176,0)");
  g.fillStyle = rg;
  g.fillRect(-r, -r, r * 2, r * 2);

  // Fresnel: toward the silhouette the glass reflects the room, bluer and darker.
  rg = g.createRadialGradient(0, 0, r * 0.6, 0, 0, r);
  rg.addColorStop(0, "rgba(118,144,182,0)");
  rg.addColorStop(0.7, "rgba(118,144,182,0.12)");
  rg.addColorStop(0.93, "rgba(96,124,166,0.34)");
  rg.addColorStop(1, "rgba(80,108,150,0.52)");
  g.fillStyle = rg;
  g.fillRect(-r, -r, r * 2, r * 2);

  // Internal reflection hugging the lower inside edge.
  fadedArc(g, r * 0.9, 0.1 * Math.PI, 0.86 * Math.PI, Math.max(1, r * 0.032), 0.8);

  // A softbox reflection: a soft rounded window high on the left.
  g.save();
  g.rotate(-0.6);
  const bw = r * 0.46;
  const bh = r * 0.2;
  const bx = -bw / 2;
  const by = -r * 0.74;
  const wl = g.createLinearGradient(0, by, 0, by + bh);
  wl.addColorStop(0, "rgba(255,255,255,0.62)");
  wl.addColorStop(1, "rgba(255,255,255,0.08)");
  g.fillStyle = wl;
  roundRect(g, bx, by, bw, bh, bh * 0.45);
  g.fill();
  g.restore();
  g.restore();

  // Silhouette.
  g.strokeStyle = "rgba(78,104,146,0.36)";
  g.lineWidth = 1;
  g.beginPath();
  g.arc(0, 0, r - 0.5, 0, TAU);
  g.stroke();

  // Rim light: a crisp white edge on the lower right from the backlight,
  // and a fainter one high on the left from the key.
  const rimW = Math.max(1.2, r * 0.024);
  fadedArc(g, r - rimW * 0.6, -0.2 * Math.PI, 0.7 * Math.PI, rimW, 0.95);
  const keyW = Math.max(0.8, r * 0.014);
  fadedArc(g, r - keyW, 0.96 * Math.PI, 1.5 * Math.PI, keyW, 0.6);

  // Specular highlight, and a small one where the key exits.
  g.save();
  g.translate(-0.4 * r, -0.47 * r);
  g.rotate(-0.68);
  g.scale(1, 0.55);
  rg = g.createRadialGradient(0, 0, 0, 0, 0, 0.21 * r);
  rg.addColorStop(0, "rgba(255,255,255,1)");
  rg.addColorStop(0.35, "rgba(255,255,255,0.86)");
  rg.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = rg;
  g.beginPath();
  g.arc(0, 0, 0.21 * r, 0, TAU);
  g.fill();
  g.restore();
  rg = g.createRadialGradient(0.5 * r, 0.56 * r, 0, 0.5 * r, 0.56 * r, 0.07 * r);
  rg.addColorStop(0, "rgba(255,255,255,0.85)");
  rg.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = rg;
  g.beginPath();
  g.arc(0.5 * r, 0.56 * r, 0.07 * r, 0, TAU);
  g.fill();
  return c;
}

/** The sphere's soft shadow on the backdrop, with the light it focuses at its core. */
function paintShadow(r: number, dpr: number): HTMLCanvasElement {
  const R = r * 1.5;
  const c = makeCanvas(R * 2 * dpr, R * 2 * dpr);
  const g = c.getContext("2d");
  if (!g) return c;
  g.scale(dpr, dpr);
  g.translate(R, R);
  g.scale(1.08, 0.94);
  let rg = g.createRadialGradient(0, 0, 0, 0, 0, r * 1.18);
  rg.addColorStop(0, "rgba(62,90,134,0.13)");
  rg.addColorStop(0.5, "rgba(62,90,134,0.11)");
  rg.addColorStop(0.8, "rgba(62,90,134,0.05)");
  rg.addColorStop(1, "rgba(62,90,134,0)");
  g.fillStyle = rg;
  g.beginPath();
  g.arc(0, 0, r * 1.18, 0, TAU);
  g.fill();
  // The point the sphere focuses the key light to.
  rg = g.createRadialGradient(0, 0, 0, 0, 0, r * 0.34);
  rg.addColorStop(0, "rgba(255,255,255,0.75)");
  rg.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = rg;
  g.beginPath();
  g.arc(0, 0, r * 0.34, 0, TAU);
  g.fill();
  return c;
}

/** A white arc whose light swells in the middle and dies away at both ends. */
function fadedArc(g: CanvasRenderingContext2D, radius: number, a0: number, a1: number, width: number, alpha: number) {
  const steps = 28;
  const span = (a1 - a0) / steps;
  g.lineWidth = width;
  g.lineCap = "butt";
  for (let i = 0; i < steps; i++) {
    const k = Math.sin((Math.PI * (i + 0.5)) / steps);
    g.strokeStyle = `rgba(255,255,255,${(alpha * Math.pow(k, 1.4)).toFixed(3)})`;
    g.beginPath();
    g.arc(0, 0, radius, a0 + span * i, a0 + span * (i + 1) + 0.002);
    g.stroke();
  }
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/**
 * A tileable water-caustic texture: white light, alpha = intensity. After the
 * well-known iterative caustic formulation (each pass bends the sample point
 * by the field it is sampling), evaluated once at a fixed instant.
 */
function makeCausticTexture(size: number): HTMLCanvasElement {
  const c = makeCanvas(size, size);
  const g = c.getContext("2d");
  if (!g) return c;
  const img = g.createImageData(size, size);
  const d = img.data;
  const time = 23.7;
  const inten = 0.005;
  const iters = 5;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = (x / size) * TAU - 250;
      const py = (y / size) * TAU - 250;
      let ix = px;
      let iy = py;
      let acc = 1;
      for (let n = 0; n < iters; n++) {
        const t = time * (1 - 3.5 / (n + 1));
        const nx = px + Math.cos(t - ix) + Math.sin(t + iy);
        const ny = py + Math.sin(t - iy) + Math.cos(t + ix);
        ix = nx;
        iy = ny;
        acc += 1 / Math.hypot(px / (Math.sin(ix + t) / inten), py / (Math.cos(iy + t) / inten));
      }
      acc /= iters;
      acc = 1.17 - Math.pow(acc, 1.4);
      // Lift the filaments, drop the haze between them.
      const raw = Math.min(1, Math.pow(Math.abs(acc), 8));
      const v = Math.pow(Math.min(1, Math.max(0, (raw - 0.12) / 0.45)), 1.3);
      const k = (y * size + x) * 4;
      d[k] = 255;
      d[k + 1] = 255;
      d[k + 2] = 255;
      d[k + 3] = Math.round(v * 255);
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

/** An offscreen patch where two drifting caustic layers are mixed and masked round. */
function makePatch(
  texture: HTMLCanvasElement,
  radius: number,
  res: number,
  tile: number,
  target?: HTMLCanvasElement,
): Patch | null {
  const size = Math.max(8, Math.ceil(radius * 2 * res));
  const c = target ?? makeCanvas(size, size);
  c.width = size;
  c.height = size;
  const g = c.getContext("2d");
  if (!g) return null;
  const p1 = g.createPattern(texture, "repeat");
  const p2 = g.createPattern(texture, "repeat");
  if (!p1 || !p2 || typeof p1.setTransform !== "function") return null;
  const mask = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  mask.addColorStop(0, "rgba(0,0,0,1)");
  mask.addColorStop(0.42, "rgba(0,0,0,0.62)");
  mask.addColorStop(1, "rgba(0,0,0,0)");
  return { c, g, p1, p2, mask, tile: Math.max(24, tile) };
}

/** Two copies of the texture drifting past each other: travelling caustics. */
function renderPatch(p: Patch, t: number, speed: number, shade: number) {
  const { g, c } = p;
  const w = c.width;
  const h = c.height;
  const sc = p.tile / 256;
  const v = p.tile * 0.05 * speed;
  g.globalCompositeOperation = "source-over";
  g.globalAlpha = 1;
  g.clearRect(0, 0, w, h);
  // An optional faint shade under the light, so it reads on a pale wall.
  if (shade > 0) {
    g.fillStyle = `rgba(70,98,140,${shade})`;
    g.fillRect(0, 0, w, h);
  }
  p.p1.setTransform(new DOMMatrix().translateSelf(t * v, t * v * 0.35).scaleSelf(sc));
  g.fillStyle = p.p1;
  g.fillRect(0, 0, w, h);
  p.p2.setTransform(
    new DOMMatrix()
      .translateSelf(w * 0.37 - t * v * 0.8, h * 0.21 + t * v * 0.55)
      .rotateSelf(33)
      .scaleSelf(sc * 1.37),
  );
  g.globalCompositeOperation = "lighter";
  g.fillStyle = p.p2;
  g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = "destination-in";
  g.fillStyle = p.mask;
  g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = "source-over";
}
