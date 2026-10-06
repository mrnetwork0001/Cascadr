"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { CascadrMark } from "@/components/brand/Logo";
import { clock, signedPct, usd } from "@/lib/format";
import type { Health, Quote } from "@/lib/types";

/*
 * Shell-scoped motion. The tape only scrolls when it does not fit, pauses
 * while it is hovered or focused, and becomes a plain sideways scroller for
 * anyone who asked for reduced motion. The agent's "armed" light breathes.
 */
const SHELL_CSS = `
@keyframes cz-shell-tape { from { transform: translate3d(0,0,0) } to { transform: translate3d(-50%,0,0) } }
@keyframes cz-shell-breathe { 0%,100% { transform: scale(1); opacity: .55 } 50% { transform: scale(2.1); opacity: 0 } }
.cz-shell-view:hover .cz-shell-track,
.cz-shell-view:focus-within .cz-shell-track,
.cz-shell-view:focus .cz-shell-track { animation-play-state: paused !important }
.cz-shell-halo { animation: cz-shell-breathe 2.4s cubic-bezier(.22,.7,.25,1) infinite }
@media (prefers-reduced-motion: reduce) {
  .cz-shell-track { animation: none !important; transform: none !important }
  .cz-shell-dup { display: none !important }
  .cz-shell-view { overflow-x: auto !important }
  .cz-shell-halo { animation: none; opacity: 0 }
}
`;

/*
 * Small coloured figures are deepened toward ink, as the panels do for P&L, so
 * the 24h change keeps AA contrast on the glass pill. The colour-mix reads the
 * tone class from the parent span, since currentColor in `color` is inherited.
 */
const DEEP: CSSProperties = { color: "color-mix(in srgb, currentColor 78%, #020C21)" };

/** Seconds each quote spends crossing the tape; slow enough to read. */
const SECONDS_PER_QUOTE = 4.5;
/** Space between quotes on the tape, in px. */
const ROW_GAP = 22;

/**
 * Logo, the live Bitget price tape, and the real agent's state. Every figure
 * is read from the API: prices and the 24h change are Bitget's own numbers,
 * refreshed every few seconds, never extrapolated in the browser.
 */
export function TopBar({
  quotes,
  quotesError,
  health,
  healthError,
}: {
  quotes: Quote[];
  quotesError: string | null;
  health: Health | null;
  healthError: string | null;
}) {
  // Rendered empty on the server: a wall-clock value would not survive hydration.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const a = health?.autonomous;
  let agent: AgentView = { label: "Agent", state: "—", detail: null, tone: "idle" };
  if (healthError) {
    // A failed poll means the last good state may no longer be true.
    agent = health
      ? { label: "Agent", state: "?", detail: "API unreachable", tone: "down" }
      : { label: "API", state: "Unreachable", detail: null, tone: "down" };
  } else if (a && !a.armed) {
    agent = { label: "Agent", state: "Off", detail: null, tone: "off" };
  } else if (a && now) {
    const next = a.last_cycle ? new Date(a.last_cycle).getTime() + a.poll_seconds * 1000 - now : null;
    const mmss = (ms: number) => {
      const s = Math.max(0, Math.round(ms / 1000));
      return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
    };
    agent = {
      label: "Agent",
      state: "Armed",
      detail:
        next == null ? (
          "starting"
        ) : next > 0 ? (
          <>
            next<span className="hidden sm:inline"> read</span> <span className="num inline-block min-w-[2.6em]">{mmss(next)}</span>
          </>
        ) : (
          "reading…"
        ),
      tone: "live",
    };
  }

  return (
    <header className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-2 sm:gap-x-2.5 lg:h-[46px] lg:flex-nowrap">
      <style dangerouslySetInnerHTML={{ __html: SHELL_CSS }} />

      <Link
        href="/"
        title="Back to overview"
        aria-label="Cascadr: back to overview"
        className="group flex h-[40px] shrink-0 items-center rounded-full pl-1 pr-2"
      >
        <CascadrMark size={30} />
        <b
          className="ml-[7px] text-[19px] leading-none text-ink"
          style={{ fontWeight: 520, letterSpacing: "-0.03em" }}
        >
          Cascadr
        </b>
        <span
          aria-hidden="true"
          className="ml-3.5 hidden h-[22px] w-px bg-[#CED5E0] xl:block"
        />
        <span className="ml-3.5 hidden whitespace-nowrap text-[12px] font-[470] tracking-[-0.01em] text-muted transition-colors group-hover:text-accent-deep xl:inline">
          Contagion terminal
        </span>
      </Link>

      <PriceTape quotes={quotes} quotesError={quotesError} />

      <div className="ml-auto flex shrink-0 items-center gap-2.5 lg:ml-0">
        <AgentPill view={agent} />
        <time
          className="num hidden w-[64px] text-right text-[13px] font-[470] text-muted-2 sm:block"
          title="Local time"
        >
          {now ? clock(new Date(now)) : "--:--:--"}
        </time>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------- price tape */

function PriceTape({ quotes, quotesError }: { quotes: Quote[]; quotesError: string | null }) {
  const viewRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);

  // Scroll the tape only when the quotes do not fit; measure the single copy.
  useEffect(() => {
    const view = viewRef.current;
    const row = rowRef.current;
    if (!view || !row || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      // The row carries one trailing gap so the loop is seamless; ignore it.
      const content = row.scrollWidth - ROW_GAP;
      setOverflows(content > view.clientWidth + 1);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(view);
    ro.observe(row);
    return () => ro.disconnect();
  }, [quotes.length]);

  const stale = Boolean(quotesError);
  const moving = overflows && quotes.length > 0;
  const fade = "linear-gradient(90deg, transparent, #000 22px, #000 calc(100% - 28px), transparent)";

  const items = quotes.map((q) => {
    const chg = q.change24h_pct;
    const tone = chg == null ? "text-muted" : chg > 0 ? "text-signal-green" : chg < 0 ? "text-signal-red" : "text-muted";
    return (
      <span
        key={q.symbol}
        className={`flex shrink-0 items-baseline gap-1.5 ${stale ? "opacity-50" : ""}`}
        title={`${q.symbol} · Bitget last trade · 24h change${stale ? " · stale: last successful read" : ""}`}
      >
        <span className="text-[11px] font-[600] tracking-[0.03em] text-ink-soft">{q.ticker}</span>
        <span className="num text-[12.5px] font-[460] text-ink">{q.last != null ? usd(q.last) : "—"}</span>
        <span className={`num text-[11.5px] font-[520] ${tone}`}>
          <span style={chg ? DEEP : undefined}>{chg != null ? signedPct(chg) : "—"}</span>
        </span>
      </span>
    );
  });

  return (
    <div
      // The focus ring sits on the pill: the tape's fade mask would clip it.
      className="glass-pill order-3 flex h-[40px] w-full min-w-0 items-center pl-4 pr-1.5 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent-deep lg:order-none lg:w-auto lg:flex-1"
    >
      <span className="shrink-0 text-[10.5px] font-[560] uppercase tracking-[0.12em] text-muted">Bitget</span>
      {stale && quotes.length > 0 && (
        <span
          className="ml-2 shrink-0 rounded-full bg-amber/10 px-2 py-[3px] text-[10px] font-[620] uppercase leading-none tracking-[0.12em] text-amber ring-1 ring-inset ring-amber/35"
          title={quotesError ?? undefined}
        >
          Stale
        </span>
      )}
      <span aria-hidden="true" className="mx-3 h-[18px] w-px shrink-0 bg-[#CED5E0]" />

      {quotes.length === 0 ? (
        <span className="min-w-0 truncate text-[12px] font-[450] text-muted">
          {quotesError ? "prices unavailable" : "loading Bitget prices…"}
        </span>
      ) : (
        <div
          ref={viewRef}
          role="region"
          aria-label="Bitget prices: last trade and 24 hour change"
          tabIndex={0}
          className="cz-shell-view no-scrollbar relative flex h-full min-w-0 flex-1 items-center overflow-x-auto overflow-y-hidden outline-none"
          style={moving ? { overflowX: "hidden", WebkitMaskImage: fade, maskImage: fade } : undefined}
        >
          <div
            className="cz-shell-track flex w-max items-center"
            style={
              moving
                ? { animation: `cz-shell-tape ${quotes.length * SECONDS_PER_QUOTE}s linear infinite` }
                : undefined
            }
          >
            <div ref={rowRef} className="flex shrink-0 items-center" style={{ gap: ROW_GAP, paddingRight: ROW_GAP }}>
              {items}
            </div>
            {moving && (
              <div aria-hidden="true" className="cz-shell-dup flex shrink-0 items-center" style={{ gap: ROW_GAP, paddingRight: ROW_GAP }}>
                {items}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------- agent pill */

interface AgentView {
  label: string;
  state: string;
  detail: ReactNode;
  tone: "live" | "off" | "down" | "idle";
}

/**
 * The agent's state as a glass pill with a knob, after the landing's controls.
 * The knob carries the state at a glance; the words carry it exactly.
 */
function AgentPill({ view }: { view: AgentView }) {
  const down = view.tone === "down";
  const knob =
    view.tone === "live" ? (
      <span className="grid h-[30px] w-[30px] place-items-center rounded-full bg-[#1A2B45]">
        <span className="relative block h-[7px] w-[7px]">
          <span className="cz-shell-halo absolute inset-0 rounded-full bg-[#BFD6F2]" />
          <span className="absolute inset-0 rounded-full bg-white" />
        </span>
      </span>
    ) : view.tone === "off" ? (
      <span className="grid h-[30px] w-[30px] place-items-center rounded-full bg-track ring-1 ring-inset ring-[rgba(120,145,180,0.25)]">
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <rect x="1.5" y="1" width="2.2" height="8" rx="1" fill="#1A2B45" />
          <rect x="6.3" y="1" width="2.2" height="8" rx="1" fill="#1A2B45" />
        </svg>
      </span>
    ) : down ? (
      <span className="grid h-[30px] w-[30px] place-items-center rounded-full bg-signal-red">
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M6 2.2v4.6" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" />
          <circle cx="6" cy="9.4" r="1.05" fill="#fff" />
        </svg>
      </span>
    ) : (
      <span className="grid h-[30px] w-[30px] place-items-center rounded-full bg-track ring-1 ring-inset ring-[rgba(120,145,180,0.25)]">
        <span className="block h-[1.8px] w-[10px] rounded-full bg-muted" />
      </span>
    );

  return (
    <div
      className="glass-pill flex h-[40px] shrink-0 items-center gap-2 pl-3.5 pr-[5px] sm:pl-4"
      title={down ? "The last health check failed; the agent's state is unknown" : undefined}
    >
      <span className="text-[10.5px] font-[560] uppercase tracking-[0.12em] text-muted">{view.label}</span>
      <span className={`whitespace-nowrap text-[13px] font-[540] tracking-[-0.01em] ${down ? "text-signal-red" : "text-ink"}`}>
        {view.state}
      </span>
      {view.detail != null && (
        <span className={`whitespace-nowrap text-[12px] font-[450] ${down ? "text-signal-red" : "text-muted"}`}>
          {view.detail}
        </span>
      )}
      <span className="ml-1">{knob}</span>
    </div>
  );
}
