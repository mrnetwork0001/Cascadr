// Records the real Cascadr web app for the demo film, on live production data.
//   node scripts/capture.mjs              (needs the Next dev server on :4010, which proxies /api)
//   ONLY=why,graph node scripts/capture.mjs   re-records just those clips (marks/meta are merged)
// Output: .cache/frames/<clip>/ (JPEG screencast + frames.json), .cache/marks.json (event times),
// .cache/meta.json (per clip: element rects in CSS px, points, device scale) and stills in
// public/stills/. scripts/encode.mjs turns the frames into public/footage/<clip>.mp4 (30 fps).
//
// The window is 1600x900 CSS px at device scale 2, so frames and stills are 3200x1800 and a
// rect {x,y,w,h} in CSS px maps to video pixels by multiplying by 2.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { launch, sleep } from "./cdp.mjs";

const BASE = process.env.BASE || "http://localhost:4010";
const ROOT = resolve(new URL("..", import.meta.url).pathname);
const FRAMES = join(ROOT, ".cache/frames");
const STILLS = join(ROOT, "public/stills");
const SCALE = 2;
const VIEW = { w: 1600, h: 900 };
const ONLY = process.env.ONLY?.split(",");
const want = (clip) => !ONLY || ONLY.includes(clip);
mkdirSync(FRAMES, { recursive: true });
mkdirSync(STILLS, { recursive: true });

const t0 = Date.now();
const log = (...a) => console.log(`+${((Date.now() - t0) / 1000).toFixed(0)}s`, ...a);
const readJson = (p) => (existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : {});
const marks = readJson(join(ROOT, ".cache/marks.json"));
const meta = readJson(join(ROOT, ".cache/meta.json"));
const mark = (k) => { marks[k] = Date.now() / 1000; log("mark", k); };

// A visible pointer for the film (headless Chrome draws none), a click ring, an eased
// scroll helper, and the Next dev-mode overlays hidden.
const OVERLAY = `(() => {
  window.__ease = (el, prop, to, ms) => new Promise((done) => {
    const from = el[prop]; const start = performance.now();
    const f = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    const step = (now) => { const p = Math.min(1, (now - start) / ms); el[prop] = from + (to - from) * f(p); if (p < 1) requestAnimationFrame(step); else done(el[prop]); };
    requestAnimationFrame(step);
  });
  const add = () => {
    if (document.getElementById('__cur')) return;
    const s = document.createElement('style'); s.id = '__curcss';
    s.textContent = 'nextjs-portal,#__next-build-watcher{display:none!important}#__cur{position:fixed;left:-40px;top:-40px;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;background:rgba(255,255,255,.97);box-shadow:0 0 0 2px rgba(11,26,50,.62),0 4px 14px rgba(11,26,50,.35);z-index:2147483647;pointer-events:none;opacity:0;transition:opacity .3s ease,transform .12s ease-out,left .8s cubic-bezier(.22,1,.36,1),top .8s cubic-bezier(.22,1,.36,1)}#__cur.down{transform:scale(.7)}.__ring{position:fixed;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;border:2px solid rgba(11,26,50,.55);z-index:2147483646;pointer-events:none;animation:__r .6s ease-out forwards}@keyframes __r{from{transform:scale(.3);opacity:1}to{transform:scale(1.5);opacity:0}}';
    document.head.appendChild(s);
    const c = document.createElement('div'); c.id = '__cur'; document.body.appendChild(c);
  };
  window.__overlay = add;
  if (document.body) add(); else addEventListener('DOMContentLoaded', add);
})()`;

const b = await launch({ width: VIEW.w, height: VIEW.h + 87, extraArgs: [`--force-device-scale-factor=${SCALE}`] });
const hardStop = setTimeout(() => { log("HARD TIMEOUT"); b.close(); process.exit(2); }, 1_200_000);
const js = (e) => b.js(e);

// --- finders ------------------------------------------------------------------------
const panel = (title) => `[...document.querySelectorAll('section')].find((s) => s.querySelector(':scope > header h2')?.textContent.trim() === ${JSON.stringify(title)})`;
const PANELS = {
  news: panel("Live News · Agent Input"),
  contagion: panel("Contagion · Selected Decision"),
  graph: panel("Supply Chain Knowledge Graph"),
  positions: panel("Paper Positions"),
  log: panel("Agent Log"),
};
const LOG_SCROLLER = `${PANELS.log}?.querySelector('.overflow-y-auto')`;
const INSPECTOR = `document.querySelector('section[aria-label$=" details"]')`;
const INSPECTOR_SCROLLER = `${INSPECTOR}?.querySelector('.overflow-y-auto')`;
const POS_SCROLLER = `${PANELS.positions}?.querySelector('.overflow-auto')`;
/** The graph's node objects (with live x/y), read from GraphCanvas's memoised graph data. */
const GRAPH_DATA = `(() => { const el = document.querySelector('.cascadr-graph'); if (!el) return null; const k = Object.keys(el).find((k) => k.startsWith('__reactFiber')); let f = el[k]; while (f && !(f.memoizedProps && f.memoizedProps.nodes && f.memoizedProps.onSelect)) f = f.return; let h = f?.memoizedState; while (h) { const v = h.memoizedState; if (Array.isArray(v) && v[0] && Array.isArray(v[0].nodes) && Array.isArray(v[0].links)) return v[0]; h = h.next; } return null; })()`;
/** The force-graph instance (its ref), for graph2ScreenCoords. */
const GRAPH_FG = `(() => { const el = document.querySelector('.cascadr-graph'); if (!el) return null; const k = Object.keys(el).find((k) => k.startsWith('__reactFiber')); let f = el[k]; while (f && !(f.memoizedProps && f.memoizedProps.nodes && f.memoizedProps.onSelect)) f = f.return; let h = f?.memoizedState; while (h) { const v = h.memoizedState; if (v && typeof v === 'object' && 'current' in v && v.current && typeof v.current.graph2ScreenCoords === 'function') return v.current; h = h.next; } return null; })()`;

const rectOf = async (finder) => {
  const r = await b.rectOf(finder);
  return r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null;
};
async function panelRects() {
  const out = {};
  for (const [k, f] of Object.entries(PANELS)) out[k] = await rectOf(f);
  return out;
}

// --- pointer ------------------------------------------------------------------------
async function overlay() { await js(`window.__overlay && window.__overlay()`); }
/** Shows the film pointer at a point without gliding there. */
async function cursorAt(x, y) {
  await js(`(() => { const k = document.getElementById('__cur'); if (!k) return; const t = k.style.transition; k.style.transition = 'opacity .3s ease'; k.style.left = '${x}px'; k.style.top = '${y}px'; k.offsetWidth; k.style.transition = t; k.style.opacity = '1'; })()`);
}
async function cursorHide() { await js(`(() => { const k = document.getElementById('__cur'); if (k) { k.style.opacity = '0'; } })()`); }
/** Glides the film pointer to (x, y) and moves the real mouse there (hover states). */
async function glide(x, y, settle = 900) {
  await js(`(() => { const k = document.getElementById('__cur'); if (k) { k.style.opacity = '1'; k.style.left = '${x}px'; k.style.top = '${y}px'; } })()`);
  await sleep(820);
  await b.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  await sleep(Math.max(0, settle - 820));
}
/** A real mouse click at (x, y), with the press ring on the film pointer. */
async function clickAt(x, y) {
  await js(`(() => { const k = document.getElementById('__cur'); k?.classList.add('down'); const r = document.createElement('div'); r.className = '__ring'; r.style.left = '${x}px'; r.style.top = '${y}px'; document.body.appendChild(r); setTimeout(() => { k?.classList.remove('down'); r.remove(); }, 650); })()`);
  await b.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: 1 });
  await sleep(90);
  await b.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", buttons: 0, clickCount: 1 });
}
const centerOf = (finder) => js(`(() => { const e = ${finder}; if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`);
/** Parks the real mouse over the status bar, where nothing reacts to it. */
const parkMouse = () => b.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: VIEW.w - 6, y: VIEW.h - 4 });

/** Eased scroll of an element (finder) or the page (null) to `to` px over `ms`. */
const ease = (finder, to, ms, prop = "scrollTop") =>
  js(`window.__ease(${finder ?? "document.scrollingElement"}, '${prop}', ${to}, ${ms})`);

// --- recording ----------------------------------------------------------------------
let stopRec = null;
async function rec(name) {
  const dir = join(FRAMES, name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  stopRec = await b.screencast(dir);
  mark(`${name}:start`);
}
async function endRec(name) {
  if (!stopRec) return;
  mark(`${name}:end`);
  const frames = await stopRec();
  stopRec = null;
  const span = frames.length > 1 ? frames[frames.length - 1].t - frames[0].t : 0;
  log(`${name}: ${frames.length} frames over ${span.toFixed(1)}s (${(frames.length / Math.max(span, 0.001)).toFixed(1)} fps)`);
}
function setMeta(clip, data) {
  meta[clip] = { url: data.url, deviceScale: SCALE, viewport: VIEW, ...data };
}
const save = () => {
  writeFileSync(join(ROOT, ".cache/marks.json"), JSON.stringify(marks, null, 1));
  writeFileSync(join(ROOT, ".cache/meta.json"), JSON.stringify(meta, null, 1));
};

// --- the terminal, loaded and live --------------------------------------------------
async function terminalState() {
  return js(`(() => {
    const t = document.body.innerText;
    const log = ${PANELS.log};
    return {
      rows: log ? log.querySelectorAll('button[aria-expanded]').length : 0,
      aapl: !!${PANELS.positions}?.innerText.includes('AAPLUSDT'),
      canvas: !!document.querySelector('.cascadr-graph canvas'),
      quotes: /NVDA\\s+[\\d,.]+/.test(document.querySelector('header')?.innerText ?? t),
      errors: /stale ·|cannot reach|unavailable|loading graph|initialising/.test(t),
    };
  })()`);
}
async function openTerminal() {
  await b.goto(BASE + "/terminal", 3000);
  await overlay();
  await parkMouse();
  const end = Date.now() + 90_000;
  let s;
  while (Date.now() < end) {
    s = await terminalState();
    if (s.rows > 0 && s.aapl && s.canvas && s.quotes && !s.errors) break;
    await sleep(800);
  }
  if (!(s.rows > 0 && s.aapl && s.canvas && s.quotes && !s.errors)) throw new Error("terminal never loaded: " + JSON.stringify(s));
  await waitGraphSettled();
  await overlay();
  log("terminal ready", s);
}
/** Waits until the force layout has stopped moving (node positions stable for 1.5 s). */
async function waitGraphSettled() {
  let last = null;
  for (let i = 0; i < 40; i++) {
    await sleep(750);
    const p = await nodePoint("TSMC");
    if (p && last && Math.abs(p.x - last.x) < 0.5 && Math.abs(p.y - last.y) < 0.5) {
      await sleep(750);
      const q = await nodePoint("TSMC");
      if (Math.abs(q.x - p.x) < 0.5 && Math.abs(q.y - p.y) < 0.5) return;
    }
    last = p;
  }
  log("graph did not settle cleanly; continuing");
}
/** Viewport CSS px of a graph node's centre, from the live layout. */
const nodePoint = (id) =>
  js(`(() => { const d = ${GRAPH_DATA}; const g = ${GRAPH_FG}; const c = document.querySelector('.cascadr-graph canvas'); if (!d || !g || !c) return null; const n = d.nodes.find((n) => n.id === ${JSON.stringify(id)}); if (!n || n.x == null) return null; const p = g.graph2ScreenCoords(n.x, n.y); const r = c.getBoundingClientRect(); return { x: Math.round((r.left + p.x) * 10) / 10, y: Math.round((r.top + p.y) * 10) / 10, k: g.zoom() }; })()`);
/** Tells force-graph the pointer has left its canvas (it has no pointerleave of its own). */
const resetGraphHover = () =>
  js(`(() => { const c = document.querySelector('.cascadr-graph .force-graph-container') || document.querySelector('.cascadr-graph canvas')?.parentElement; c?.dispatchEvent(new PointerEvent('pointermove', { clientX: -500, clientY: -500, bubbles: true, pointerType: 'mouse' })); })()`);
/** Seconds to the agent's next news read, from the top bar ("next read m:ss"); null while reading. */
const nextRead = () => js(`(() => { const m = document.body.innerText.match(/next\\s*read\\s*(\\d+):(\\d{2})/); return m ? Number(m[1]) * 60 + Number(m[2]) : null; })()`);
/** Waits out an imminent news read, so new rows do not shift the log mid-take. */
async function quietFeed(needS) {
  const n = await nextRead();
  if (n != null && n > needS) return;
  const wait = Math.min(240, (n ?? 0) + 75);
  log(`a news read is due in ${n}s; waiting ${wait}s for it to land`);
  await sleep(wait * 1000);
}

try {
  // The real window: 1600x900 CSS px at device scale 2 (--force-device-scale-factor).
  await b.send("Emulation.clearDeviceMetricsOverride");
  await b.send("Page.addScriptToEvaluateOnNewDocument", { source: OVERLAY });
  await b.goto("about:blank", 300);
  const vp = await js(`({ w: innerWidth, h: innerHeight, dpr: devicePixelRatio })`);
  if (vp.w !== VIEW.w || vp.h !== VIEW.h || vp.dpr !== SCALE) throw new Error("unexpected viewport " + JSON.stringify(vp));

  // ===== 1. terminal at rest =========================================================
  await openTerminal();
  await sleep(2500);
  if (want("terminal")) {
    await b.shot(join(STILLS, "terminal.png"));
    await quietFeed(45);
    await rec("terminal");
    await sleep(14500);
    await endRec("terminal");
    setMeta("terminal", { url: "/terminal", rects: await panelRects(), notes: "Whole terminal at rest, live data; nothing clicked." });
  }

  // ===== 4. positions ================================================================
  if (want("positions")) {
    await b.shot(join(STILLS, "positions.png"), PANELS.positions);
    const sc = await js(`(() => { const s = ${POS_SCROLLER}; return s ? { sw: s.scrollWidth, cw: s.clientWidth } : null; })()`);
    log("positions scroller", sc);
    await rec("positions");
    await sleep(3500);
    let scrolled = false;
    if (sc && sc.sw > sc.cw + 8) {
      mark("posScroll");
      await ease(POS_SCROLLER, sc.sw - sc.cw, 1800, "scrollLeft");
      scrolled = true;
      await sleep(3200);
    } else {
      await sleep(5000);
    }
    await endRec("positions");
    setMeta("positions", {
      url: "/terminal",
      rects: await panelRects(),
      notes: scrolled
        ? "Paper Positions at rest for 3.5 s, then the table scrolls right (eased, 1.8 s) to show the exit column; the symbol column stays pinned. Crop to rects.positions."
        : "Paper Positions at rest. Crop to rects.positions.",
    });
    await js(`(() => { const s = ${POS_SCROLLER}; if (s) s.scrollLeft = 0; })()`);
    await sleep(600);
  }

  // ===== 2. why ======================================================================
  if (want("why")) {
    await quietFeed(45);
    // The first rows: pick the decision with the longest reasoning, favouring one that
    // names a company and carries the model's own trade call.
    const pick = await js(`(() => {
      const log = ${PANELS.log};
      const btns = [...log.querySelectorAll('button[aria-expanded]')];
      const rows = btns.slice(0, 12).map((btn, i) => {
        const k = Object.keys(btn).find((k) => k.startsWith('__reactFiber'));
        let f = btn[k]; while (f && !(f.memoizedProps && f.memoizedProps.d)) f = f.return;
        const d = f?.memoizedProps.d; if (!d) return null;
        const score = (d.reasoning || '').length + (d.entities?.length ? 120 : 0) + (d.trade_plan?.engine === 'llm' ? 200 : 0);
        return { i, id: d.id, score, action: d.action, entities: d.entities, reasoning: (d.reasoning || '').length, headline: d.headline };
      }).filter(Boolean);
      rows.sort((a, b) => b.score - a.score);
      return rows[0];
    })()`);
    log("why pick", pick);
    const WHY_BTN = `[...${PANELS.log}.querySelectorAll('button[aria-expanded]')][${pick.i}]`;
    const ROW = `${WHY_BTN}.closest('li')`;
    const WHY_PANEL = `document.getElementById('why-${pick.id}')`;
    // The chosen row starts at the top of the log (the rows above it scrolled away).
    await js(`(() => { const s = ${LOG_SCROLLER}; const row = ${ROW}; s.scrollTop = 0; const top = row.getBoundingClientRect().top - s.getBoundingClientRect().top; s.scrollTop = Math.max(0, Math.round(top - 4)); })()`);
    await sleep(600);
    await cursorAt(1190, 860);
    await sleep(400);
    await rec("why");
    await sleep(1900);
    const at = await centerOf(WHY_BTN);
    if (!at || at.y < 0 || at.y > VIEW.h) throw new Error("why button off screen: " + JSON.stringify(at));
    await glide(at.x, at.y, 1100);
    await clickAt(at.x, at.y);
    mark("open");
    await sleep(400);
    if (!(await js(`!!${WHY_PANEL}`))) {
      log("real click did not open the why panel; clicking the button element");
      await js(`(${WHY_BTN}).click()`);
    }
    await sleep(500);
    const openRect = await rectOf(WHY_PANEL);
    // The film pointer fades once the panel is open; the real one rests on the status bar.
    await cursorHide();
    await parkMouse();
    // Scroll targets (log scrollTop): first the headline at the top with as much of the
    // panel as fits, then (if the panel is taller than what is left) its last line.
    const targets = await js(`(() => {
      const s = ${LOG_SCROLLER}; const row = ${ROW}; const p = ${WHY_PANEL};
      const sr = s.getBoundingClientRect(); const rr = row.getBoundingClientRect(); const pr = p.getBoundingClientRect();
      const rowTop = rr.top - sr.top + s.scrollTop; const panelBottom = pr.bottom - sr.top + s.scrollTop;
      const need = Math.round(panelBottom - s.clientHeight + 14);
      const first = need <= s.scrollTop ? s.scrollTop : Math.round(Math.min(need, rowTop - 6));
      return { first, second: need > first ? need : null, max: s.scrollHeight - s.clientHeight };
    })()`);
    log("why scroll", targets);
    await ease(LOG_SCROLLER, targets.first, 1500);
    mark("inview");
    await sleep(300);
    const inviewRects = { why: await rectOf(WHY_PANEL), whyRow: await rectOf(ROW) };
    await b.shot(join(STILLS, "why.png"));
    await sleep(2500);
    if (targets.second != null) {
      await ease(LOG_SCROLLER, Math.min(targets.second, targets.max), 1900);
      mark("panelEnd");
      await sleep(300);
    }
    const rects = { ...(await panelRects()), why: await rectOf(WHY_PANEL), whyRow: await rectOf(ROW) };
    await b.shot(join(STILLS, "why-panel.png"), WHY_PANEL);
    await sleep(2900);
    await endRec("why");
    setMeta("why", {
      url: "/terminal",
      decision: { id: pick.id, action: pick.action, entities: pick.entities, headline: pick.headline },
      rects,
      rectsAt: { open: { why: openRect }, inview: inviewRects },
      notes:
        "Clicked the row's \"why\" button (real mouse click) at mark open; the log then scrolls (eased) so the headline sits at the top (mark inview)" +
        (targets.second != null ? " and, after a hold, on to the panel's last line (mark panelEnd)" : "") +
        ". rects are the final hold; rectsAt.open.why is where the panel first opened (partly below the fold), rectsAt.inview at mark inview.",
    });
  }

  // ===== 3. graph ====================================================================
  if (want("graph")) {
    await openTerminal();
    await sleep(1500);
    let id = "TSMC";
    let p = await nodePoint(id);
    if (!p) { id = "NVDA"; p = await nodePoint(id); }
    if (!p) throw new Error("no graph node to click");
    const g = await rectOf(PANELS.graph);
    await cursorAt(g.x + g.w - 150, g.y + g.h - 70);
    await sleep(400);
    await rec("graph");
    await sleep(1800);
    p = await nodePoint(id);
    await glide(p.x, p.y, 1150);
    await clickAt(p.x, p.y);
    mark("select");
    const selectPoint = p;
    await sleep(300);
    if (!(await js(`!!${INSPECTOR}`))) throw new Error("inspector did not open on canvas click");
    // force-graph keeps hovering wherever the pointer last crossed the canvas; reset it
    // so no hover ring or tooltip follows the layout as it pans clear of the inspector.
    const ins0 = await rectOf(INSPECTOR);
    await b.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: ins0.x + ins0.w - 46, y: ins0.y + 150 });
    await resetGraphHover();
    await glide(ins0.x + ins0.w - 46, ins0.y + 150, 900);
    await sleep(1100);
    const inspectorAtSelect = await rectOf(INSPECTOR);
    // Down to the companies TSMC supplies.
    const supTop = await js(`(() => { const s = ${INSPECTOR_SCROLLER}; const h = [...s.querySelectorAll('p')].find((p) => /^Supplies/.test(p.textContent.trim())); return h ? Math.round(h.getBoundingClientRect().top - s.getBoundingClientRect().top + s.scrollTop - 10) : null; })()`);
    await ease(INSPECTOR_SCROLLER, supTop ?? 300, 1400);
    mark("supplies");
    await sleep(500);
    const REL = (name) => `[...${INSPECTOR_SCROLLER}.querySelectorAll('li > button[aria-expanded]')].find((b) => b.querySelector('span')?.textContent.trim() === ${JSON.stringify(name)})`;
    const relName = id === "TSMC" ? "NVDA" : "TSMC";
    const rel = await centerOf(REL(relName));
    await glide(rel.x - 60, rel.y, 1000);
    await clickAt(rel.x - 60, rel.y);
    mark("expand");
    await sleep(900);
    await js(`(() => { const k = document.getElementById('__cur'); if (k) k.style.opacity = '0'; })()`);
    await b.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: ins0.x + ins0.w + 40, y: ins0.y + ins0.h - 20 });
    // Slowly down through the evidence to the sources list.
    const srcTop = await js(`(() => { const s = ${INSPECTOR_SCROLLER}; const li = ${REL(relName)}.closest('li'); const h = [...li.querySelectorAll('p')].find((p) => /^Sources/.test(p.textContent.trim())); return h ? Math.round(h.getBoundingClientRect().top - s.getBoundingClientRect().top + s.scrollTop - 8) : null; })()`);
    const maxTop = await js(`(() => { const s = ${INSPECTOR_SCROLLER}; return s.scrollHeight - s.clientHeight; })()`);
    await ease(INSPECTOR_SCROLLER, Math.min(srcTop ?? maxTop, maxTop), 3200);
    mark("sources");
    await sleep(2500);
    const rects = { ...(await panelRects()), inspector: await rectOf(INSPECTOR) };
    await b.shot(join(STILLS, "graph-inspector.png"));
    await b.shot(join(STILLS, "graph-panel.png"), PANELS.graph);
    await endRec("graph");
    setMeta("graph", {
      url: "/terminal",
      node: id,
      relation: `${id} > ${relName}`,
      points: { node: selectPoint },
      rects,
      rectsAt: { select: { inspector: inspectorAtSelect } },
      notes: `Real mouse click on the ${id} disc in the force-graph canvas (screen point from graph2ScreenCoords); the inspector opens, scrolls to "Supplies", the ${id} > ${relName} link is expanded and the list scrolls to its sources. points.node is the click point in CSS px at mark select (the graph then pans the node clear of the inspector).`,
    });
  }

  // ===== 5. judges ===================================================================
  if (want("judges")) {
    await b.goto(BASE + "/judges", 4500);
    await overlay();
    await parkMouse();
    await js(`scrollTo(0, 0)`);
    await sleep(1200);
    const off = await js(`(() => { const y = (id) => Math.round(document.getElementById(id).getBoundingClientRect().top + scrollY); return { trace: y('trace'), log: y('log'), max: document.documentElement.scrollHeight - innerHeight }; })()`);
    log("judges offsets", off);
    await rec("judges");
    await sleep(2000);
    await ease(null, off.trace, 3200);
    mark("trace");
    await sleep(2500);
    // On through the trace's four cards to the paper-trading log.
    await ease(null, Math.min(off.log, off.max), 5200);
    mark("log");
    await sleep(3200);
    await endRec("judges");
    await js(`scrollTo(0, ${off.trace})`);
    await sleep(800);
    await b.shot(join(STILLS, "judges-trace.png"));
    await b.shot(join(STILLS, "judges-trace-section.png"), `document.getElementById('trace')`, { beyond: true });
    const secs = await js(`(() => { const r = (id) => { const e = document.getElementById(id).getBoundingClientRect(); return { x: Math.round(e.x), y: Math.round(e.y + scrollY), w: Math.round(e.width), h: Math.round(e.height) }; }; return { demo: r('demo'), trace: r('trace'), log: r('log') }; })()`);
    setMeta("judges", {
      url: "/judges",
      scroll: { trace: off.trace, log: Math.min(off.log, off.max), max: off.max },
      sections: secs,
      notes: "Page scroll positions in CSS px; sections are in document coordinates (y from the top of the page).",
    });
  }

  // ===== 6. landing ==================================================================
  if (want("landing")) {
    await b.goto(BASE + "/", 6500);
    await overlay();
    await parkMouse();
    await js(`scrollTo(0, 0)`);
    await sleep(1500);
    await rec("landing");
    await sleep(10500);
    await endRec("landing");
    await b.shot(join(STILLS, "landing.png"));
    setMeta("landing", { url: "/", notes: "The hero at rest (after its entrance), animated canvas; no scrolling." });
  }
} catch (e) {
  log("FAILED:", e.stack || e.message);
  if (stopRec) { try { await stopRec(); } catch {} }
  process.exitCode = 1;
} finally {
  save();
  log("console:", b.consoleLines.slice(0, 8));
  clearTimeout(hardStop);
  b.close();
}
