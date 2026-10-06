import type { CSSProperties } from "react";
import Link from "next/link";
import { CascadrMark } from "@/components/brand/Logo";
import { CascadeBackground } from "@/components/landing/CascadeBackground";
import { HeroMenu } from "@/components/landing/HeroMenu";
import { HeroMotion } from "@/components/landing/HeroMotion";
import { Ago, LastRead } from "@/components/landing/LastRead";
import { ago } from "@/lib/format";
import type { Decision, Graph, Overview } from "@/lib/types";
import "./hero.css";

/**
 * Adds the entrance pre-state before first paint. It runs while the hero's
 * markup is being parsed, so it marks its own parent (the hero root) rather
 * than <html>, which the root layout owns. No WAAPI or reduced motion: the
 * class is never added and the hero renders finished. Self-heals after 4 s.
 */
const PRE_PAINT = `(function(){var s=document.currentScript,r=s&&s.parentElement;if(!r)return;if(!('animate' in Element.prototype))return;if(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches)return;r.classList.add('cx-pre');setTimeout(function(){r.classList.remove('cx-pre')},4000);})();`;

/** Comp coordinates for the absolute-position helpers (see hero.css). */
function at(x: number, y: number, sx?: number): CSSProperties {
  return { "--x": x, "--y": y, ...(sx != null ? { "--sx": sx } : {}) } as CSSProperties;
}
const sx = (v: number) => ({ "--sx": v }) as CSSProperties;

function every(seconds: number): string {
  if (seconds < 60) return `${seconds} s`;
  const m = Math.round(seconds / 60);
  return m < 60 ? `${m} min` : `${+(m / 60).toFixed(1)} h`;
}

/** Big figures. At this size and weight Inter's comma carries wide spacing,
 *  so the thousands separator is set in its own tightened span. */
const count = (n: number | undefined) => {
  if (n == null) return "—";
  const parts = n.toLocaleString("en-US").split(",");
  return parts.map((p, i) => (
    <span key={i}>
      {i > 0 && <span className="cx-sep">,</span>}
      {p}
    </span>
  ));
};

/**
 * The landing page's first screen: header and hero. Every figure and state on
 * it comes from the API via props; where a value is unknown it says so.
 */
export function Hero({
  overview,
  featured,
  onDemo,
}: {
  overview: Overview | null;
  /** The latest decision with downstream exposure, if any. */
  featured: Decision | null;
  /** The graph without its evidence payload (not drawn in this hero). */
  drawable: Graph | null;
  /** Paper trades go to Bitget's demo exchange. */
  onDemo: boolean;
}) {
  const agent = overview?.agent ?? null;
  const state: "live" | "paused" | "unknown" = !agent ? "unknown" : agent.armed ? "live" : "paused";
  const title = state === "live" ? "Agent live" : state === "paused" ? "Agent paused" : "Status unknown";
  const lastRead = agent?.last_cycle ? ago(agent.last_cycle) : null;

  const shock = featured ? Math.min(1, Math.max(0, featured.shock)) : null;
  const shockText = shock == null ? null : shock.toFixed(2);
  const featuredAgo = featured?.at ? ago(featured.at) : null;

  // How many of the graph's stocks the paper venue can trade (Bitget's demo
  // exchange lists fewer than the live market). Unknown stays unknown.
  const tradable = overview?.instruments.tradable_on_venue ?? null;
  const tickers = overview?.instruments.graph_tickers ?? null;
  const venueLabel = !overview ? "Trading venue" : onDemo ? "Tradable on Bitget demo" : "Listed on Bitget now";
  const venueCount = tradable != null && tickers != null ? `${tradable}/${tickers}` : null;
  const venueSpoken = `${tradable} of the graph's ${tickers} stocks`;
  const venueTitle = venueCount
    ? `${venueSpoken} ${onDemo ? "can be traded on Bitget's demo exchange, where the paper trades go" : "are listed on Bitget"}`
    : undefined;

  return (
    <header className="cx-hero" suppressHydrationWarning>
      <script dangerouslySetInnerHTML={{ __html: PRE_PAINT }} />
      <CascadeBackground decay={overview?.graph.hop_decay ?? null} />
      <div className="cx-tint" aria-hidden="true" />

      <div className="cx-stack">
        {/* ------------------------------------------------------- header */}
        <div className="cx-row">
          <Link href="/" className="cx-brand cx-l cx-t" style={at(68, 47)} aria-label="Cascadr home">
            <CascadrMark className="cx-mark" />
            <b className="cx-sx" style={sx(0.95)}>
              Cascadr
            </b>
          </Link>

          <HeroMenu>
            <nav className="cx-nav" aria-label="Sections">
              {/* next/link, not <a>: a bare hash link leaves a history entry
                  the App Router cannot pop back through from /terminal. */}
              <Link className="cx-nlink cx-n1" href="#how">
                <PulseGlyph />
                <span>Agent</span>
              </Link>
              <span className="cx-ndiv" aria-hidden="true" />
              <Link className="cx-nlink cx-n2" href="#edge">
                <ResearchGlyph />
                <span>Research</span>
              </Link>
            </nav>
            <Link href="/terminal" className="cx-cta cx-l cx-t cx-r" style={at(58, 30)}>
              <span>Launch terminal</span>
              <i className="cx-knob" aria-hidden="true">
                <Chevron />
              </i>
            </Link>
          </HeroMenu>
        </div>

        {/* --------------------------------------------------------- hero */}
        <div className="cx-blk">
          <p className="cx-eyebrow cx-l cx-c cx-sx" style={at(65.7, -209.2, 0.93)}>
            Supply-chain contagion agent
          </p>
          <h1 className="cx-h1 cx-l cx-c" style={at(62.6, -167.3)}>
            <span className="cx-sx" style={sx(0.955)}>
              Trade the
            </span>
            <br />
            <span className="cx-sx" style={sx(0.965)}>
              Second Order
            </span>
          </h1>
          <div className="cx-tagrow">
            <Link className="cx-play cx-l cx-c" style={at(66, 34)} href="#cascade" aria-label="See a real decision">
              <svg viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path
                  d="M7 1.6v10.6M2.7 7.9 7 12.2l4.3-4.3"
                  stroke="#0b1526"
                  strokeWidth="1.9"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </Link>
            <p className="cx-tag cx-l cx-c cx-sx" style={at(131, 48.7, 0.9)}>
              Markets price the headline. Cascadr prices the cascade.
            </p>
          </div>

          {/* The agent's live status, straight from /overview. */}
          <aside className="cx-panel cx-l cx-c cx-r" style={at(58, -165)} data-state={state} aria-label="Agent status">
            <p className="cx-ptitle">
              <span className="cx-sx" style={sx(0.8707)}>
                {title}
              </span>
            </p>
            <i className="cx-dot" aria-hidden="true" />
            <span className="cx-badge" aria-hidden="true">
              <CascadrMark />
            </span>
            <p className="cx-psub cx-sx" style={sx(0.89)}>
              {state === "unknown" || !overview ? (
                <>
                  Live status
                  <br />
                  could not be read
                  <br />
                  right now
                </>
              ) : (
                <>
                  {overview.graph.nodes} companies
                  <br />
                  {state === "live" ? `read every ${every(overview.agent.poll_seconds)}` : "reading switched off"}
                  <br />
                  {overview.agent.last_cycle && lastRead ? (
                    <>
                      last read <LastRead iso={overview.agent.last_cycle} initial={lastRead} />
                    </>
                  ) : (
                    "no read recorded yet"
                  )}
                </>
              )}
            </p>
            {/* Where the paper trades go, and how much of the graph that venue can trade. */}
            <p className="cx-kv cx-venue" title={venueTitle}>
              <span>{venueLabel}</span>
              {venueCount ? (
                <b>
                  <span aria-hidden="true">{venueCount}</span>
                  <span className="sr-only">{venueSpoken}</span>
                </b>
              ) : (
                <b>
                  <span aria-hidden="true">—</span>
                  <span className="sr-only">could not be read</span>
                </b>
              )}
            </p>
            {/* The shock of the most recent decision that reached downstream
                companies - not necessarily the newest headline, so it says how old it is. */}
            <p className="cx-kv cx-scale" title={featured ? `Decision #${featured.id}: ${featured.headline}` : undefined}>
              <span>
                Cascade shock
                {featured && featuredAgo ? (
                  <>
                    {" · "}
                    <Ago iso={featured.at} initial={featuredAgo} />
                  </>
                ) : null}
              </span>
              {shockText ? (
                <b>{shockText}</b>
              ) : (
                <b>
                  <span aria-hidden="true">—</span>
                  <span className="sr-only">not available</span>
                </b>
              )}
            </p>
            {featured && shock != null ? (
              <div
                className="cx-track"
                role="meter"
                aria-valuemin={0}
                aria-valuemax={1}
                aria-valuenow={shock}
                aria-valuetext={`${shockText} of 1`}
                aria-label={`Shock the LLM gave the most recent headline with downstream exposure (decision #${featured.id}), on a 0 to 1 scale`}
                title={featured.headline}
              >
                <i style={{ width: `${shock * 100}%` }} />
              </div>
            ) : (
              <div className="cx-track" aria-hidden="true">
                <i style={{ width: 0 }} />
              </div>
            )}
          </aside>
        </div>

        {/* -------------------------------------------------- stats + meet */}
        <div className="cx-row cx-foot">
          <div className="cx-stats cx-l cx-b" style={at(64, 60.4)}>
            <dl className="cx-stat">
              <dt className="cx-lbl cx-sx" style={sx(0.96)}>
                Headlines
                <br />
                read by
                <br />
                the agent
              </dt>
              <dd className="cx-num">{count(agent?.headlines_seen)}</dd>
            </dl>
            <span className="cx-slash" aria-hidden="true" />
            <dl className="cx-stat">
              <dt className="cx-lbl cx-sx" style={sx(0.95)}>
                Source-cited
                <br />
                links
              </dt>
              <dd className="cx-num">{count(overview?.graph.edges)}</dd>
            </dl>
          </div>

          <Link className="cx-meet cx-l cx-b cx-r" style={at(59, 66)} href="#how">
            <span className="cx-thumb" aria-hidden="true">
              <GlassNode />
            </span>
            <b>Meet the agent</b>
            <i className="cx-knob" aria-hidden="true">
              <Chevron />
            </i>
          </Link>
        </div>
      </div>

      <HeroMotion />
    </header>
  );
}

/** Agent: a live signal trace - the agent reacting to a headline. */
function PulseGlyph() {
  return (
    <svg viewBox="0 0 20 21" fill="none" aria-hidden="true">
      <path
        d="M1.6 11.2h3.9l2.3-5.6 4.2 10.6 2.5-5h3.9"
        stroke="#202940"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Research: a bar chart stepping down - the move that reaches the next company. */
function ResearchGlyph() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      {[
        [1.2, 1.4],
        [7.8, 6.4],
        [14.4, 11.4],
      ].map(([x, y]) => (
        <rect key={x} x={x} y={y} width="4.4" height={18.6 - y} rx="1.4" stroke="#202940" strokeWidth="1.7" />
      ))}
    </svg>
  );
}

function Chevron() {
  return (
    <svg viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="m6.6 3.6 6 5.4-6 5.4" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * The meet pill's thumbnail: the cascade mark rebuilt in glass - three nodes
 * descending along one rod - drawn to match the background plate.
 */
function GlassNode() {
  const nodes: [number, number, number][] = [
    [21.5, 22.5, 13],
    [37, 38, 5.6],
    [48.5, 49.5, 9],
  ];
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <radialGradient id="cx-th-bg" cx="30%" cy="22%" r="90%">
          <stop offset="0" stopColor="#FBFCFE" />
          <stop offset="0.5" stopColor="#E7EEF6" />
          <stop offset="1" stopColor="#CCD8E7" />
        </radialGradient>
        <radialGradient id="cx-th-shadow">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.85" />
          <stop offset="0.3" stopColor="#FFFFFF" stopOpacity="0.2" />
          <stop offset="0.7" stopColor="#4A6A98" stopOpacity="0.11" />
          <stop offset="1" stopColor="#4A6A98" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="cx-th-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#B4C5DB" stopOpacity="0.6" />
          <stop offset="0.45" stopColor="#DCE6F2" stopOpacity="0.32" />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity="0.9" />
        </linearGradient>
        <radialGradient id="cx-th-rim">
          <stop offset="0.66" stopColor="#7A94B8" stopOpacity="0" />
          <stop offset="0.92" stopColor="#6F89AF" stopOpacity="0.3" />
          <stop offset="1" stopColor="#57749E" stopOpacity="0.6" />
        </radialGradient>
        <radialGradient id="cx-th-focus" cx="58%" cy="76%" r="36%">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.95" />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="64" height="64" fill="url(#cx-th-bg)" />
      {nodes.map(([x, y, r]) => (
        <ellipse key={`s${x}`} cx={x + r * 0.5} cy={y + r * 0.62} rx={r * 1.25} ry={r * 1.12} fill="url(#cx-th-shadow)" />
      ))}
      {/* the rod */}
      <path d="M21.5 22.5 48.5 49.5" stroke="#8DA3C2" strokeOpacity="0.55" strokeWidth="2.8" />
      <path d="M21.5 22.5 48.5 49.5" stroke="#F3F7FC" strokeWidth="1.7" />
      <path d="M21.1 22.9 48.1 49.9" stroke="#FFFFFF" strokeWidth="0.6" />
      {nodes.map(([x, y, r]) => (
        <g key={`n${x}`}>
          <circle cx={x} cy={y} r={r} fill="url(#cx-th-body)" />
          <circle cx={x} cy={y} r={r} fill="url(#cx-th-focus)" />
          <circle cx={x} cy={y} r={r} fill="url(#cx-th-rim)" />
          <circle cx={x} cy={y} r={r - 0.25} fill="none" stroke="#56739C" strokeOpacity="0.35" strokeWidth="0.5" />
          <ellipse
            cx={x - r * 0.4}
            cy={y - r * 0.46}
            rx={r * 0.3}
            ry={r * 0.17}
            transform={`rotate(-38 ${x - r * 0.4} ${y - r * 0.46})`}
            fill="#FFFFFF"
            fillOpacity="0.95"
          />
        </g>
      ))}
      <path d="M11.6 28.9A11.7 11.7 0 0 0 31.4 30.7" fill="none" stroke="#FFFFFF" strokeOpacity="0.9" strokeWidth="0.9" strokeLinecap="round" />
    </svg>
  );
}
