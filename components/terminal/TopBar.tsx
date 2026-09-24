"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { clock, signedPct, usd } from "@/lib/format";
import type { Health, Quote } from "@/lib/types";

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
  let agentText = "AGENT —";
  let agentClass = "border-term-edge text-term-dim";
  if (healthError) {
    // A failed poll means the last good state may no longer be true.
    agentText = health ? "AGENT ? · API unreachable" : "API UNREACHABLE";
    agentClass = "border-signal-red text-signal-red";
  } else if (a && !a.armed) {
    agentText = "AGENT OFF";
  } else if (a && now) {
    const next = a.last_cycle ? new Date(a.last_cycle).getTime() + a.poll_seconds * 1000 - now : null;
    const mmss = (ms: number) => {
      const s = Math.max(0, Math.round(ms / 1000));
      return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
    };
    agentText = next == null ? "AGENT ARMED · starting" : next > 0 ? `AGENT ARMED · next read ${mmss(next)}` : "AGENT ARMED · reading…";
    agentClass = "border-signal-green text-signal-green";
  }

  return (
    <header className="flex shrink-0 flex-wrap items-stretch border-b border-term-line bg-term-panel lg:flex-nowrap">
      <Link
        href="/"
        title="Back to overview"
        className="group flex items-center gap-2 border-r border-term-line px-3 py-2 transition-colors hover:bg-term-raised lg:py-0"
      >
        <Logo height={18} priority />
        <span className="hidden text-2xs uppercase tracking-widest text-term-dim group-hover:text-amber lg:inline">
          supply-chain contagion engine
        </span>
      </Link>

      {/* Live Bitget stock-perp tape. On narrow screens it drops to its own
          full-width row and scrolls sideways rather than clipping. */}
      <div className="no-scrollbar order-3 flex w-full min-w-0 items-center gap-4 overflow-x-auto border-t border-term-line px-3 py-1.5 lg:order-none lg:w-auto lg:flex-1 lg:overflow-hidden lg:border-t-0 lg:py-0">
        {quotes.length === 0 ? (
          <span className="text-2xs text-term-dim">{quotesError ? "prices unavailable" : "loading Bitget prices…"}</span>
        ) : (
          <>
          {quotesError && (
            <span className="shrink-0 border border-signal-red/60 px-1 text-2xs text-signal-red" title={quotesError}>
              STALE
            </span>
          )}
          {quotes.map((q) => {
            const chg = q.change24h_pct;
            const tone = chg == null ? "text-term-dim" : chg > 0 ? "text-signal-green" : chg < 0 ? "text-signal-red" : "text-term-dim";
            return (
              <span
                key={q.symbol}
                className={`flex shrink-0 items-baseline gap-1 ${quotesError ? "opacity-50" : ""}`}
                title={`${q.symbol} · Bitget last trade · 24h change${quotesError ? " · stale: last successful read" : ""}`}
              >
                <span className="text-2xs font-semibold text-term-text">{q.ticker}</span>
                <span className="num text-2xs text-term-bright">{q.last != null ? usd(q.last) : "—"}</span>
                <span className={`num text-2xs ${tone}`}>{chg != null ? signedPct(chg) : "—"}</span>
              </span>
            );
          })}
          </>
        )}
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-2 px-3 py-2 lg:ml-0 lg:border-l lg:border-term-line lg:py-0">
        <span className={`border px-1.5 py-0.5 text-2xs font-semibold ${agentClass}`}>{agentText}</span>
        <span className="num hidden w-[62px] text-right text-xs text-amber sm:inline">
          {now ? clock(new Date(now)) : "--:--:--"}
        </span>
      </div>
    </header>
  );
}
