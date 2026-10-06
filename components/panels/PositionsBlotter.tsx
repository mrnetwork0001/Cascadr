"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Panel } from "@/components/terminal/Panel";
import { signedPct, signedUsd, usd } from "@/lib/format";
import type { PositionsResponse } from "@/lib/types";

const EXIT_TONE: Record<string, string> = {
  STOP_LOSS: "text-signal-red",
  TAKE_PROFIT: "text-signal-green",
  TIME_STOP: "text-amber",
};

/*
 * Soft pills take their tint from the text colour the tone class sets. Small
 * coloured type (pill labels, P&L figures) is deepened toward ink so it keeps
 * AA contrast on the light glass.
 */
const SOFT: CSSProperties = {
  backgroundColor: "color-mix(in srgb, currentColor 9%, transparent)",
  borderColor: "color-mix(in srgb, currentColor 24%, transparent)",
};
const DEEP: CSSProperties = { color: "color-mix(in srgb, currentColor 78%, #020C21)" };

function Pill({ tone, children, title }: { tone: string; children: ReactNode; title?: string }) {
  return (
    <span
      className={`inline-flex h-[19px] shrink-0 items-center whitespace-nowrap rounded-full border px-2 text-[10px] font-[560] uppercase leading-none tracking-[0.08em] ${tone}`}
      style={SOFT}
      title={title}
    >
      <span style={DEEP}>{children}</span>
    </span>
  );
}

function Tone({ tone, children, className = "" }: { tone: string; children: ReactNode; className?: string }) {
  return (
    <span className={`${tone} ${className}`}>
      <span style={DEEP}>{children}</span>
    </span>
  );
}

/*
 * Green and red are kept for a real gain or loss. A figure that shows as zero
 * at two decimals is flat: neutral ink and no sign, never a green "+$0.00".
 * Each figure is judged on its own value, so its sign and colour always match.
 */
const isFlat = (v: number) => Math.abs(v) < 0.005;
const pnlTone = (v: number | null | undefined) =>
  v == null ? "text-muted" : isFlat(v) ? "text-ink-soft" : v > 0 ? "text-signal-green" : "text-signal-red";
const pnlUsd = (v: number) => (isFlat(v) ? `$${usd(0)}` : signedUsd(v));
const pnlPct = (v: number) => (isFlat(v) ? "0.00%" : signedPct(v));

const HEADERS = ["Symbol", "Side", "By", "Notional", "Entry", "Mark / Exit", "P&L", "Move", "ROE", "Age", "Exit"];
const CELL = "h-11 border-b border-term-line/70 px-2.5 first:pl-4 last:pr-4 whitespace-nowrap";
/*
 * The symbol column stays put while a narrow screen scrolls the book sideways;
 * it only takes a frosted backing once something is actually sliding under it.
 */
const PINNED = "sticky left-0 z-[1]";
const PINNED_SCROLLED = "bg-[#F8FAFD] shadow-[1px_0_0_rgba(120,145,180,0.22)]";

/**
 * The paper book exactly as the backend holds it, marked to Bitget's live
 * mark price. P&L is units x price move; ROE is that P&L over the margin
 * posted, which is where leverage appears.
 */
export function PositionsBlotter({
  book,
  error,
}: {
  book: PositionsResponse | null;
  error: string | null;
}) {
  const open = book?.positions.filter((p) => p.status === "OPEN") ?? [];
  const closed = book?.positions.filter((p) => p.status === "CLOSED").slice(0, 8) ?? [];
  // Only figures the API returned are shown: unknown is "—", never $0.00.
  const upl = book?.unrealized_usdt ?? null;
  const rpl = book?.realized_usdt ?? null;
  // Which edges have more of the book hidden past them on a narrow screen.
  const scroller = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  const measure = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    const left = el.scrollLeft > 0;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    setEdges((e) => (e.left === left && e.right === right ? e : { left, right }));
  }, []);
  useEffect(() => {
    const el = scroller.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => ro.disconnect();
  }, [measure]);
  const slid = edges.left;

  return (
    <Panel
      title="Paper Positions"
      flush
      className="h-full"
      meta={
        error && !book ? (
          <Tone tone="text-amber" className="font-[520]">unavailable</Tone>
        ) : (
          <span className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
            <span className="whitespace-nowrap" title={book?.market_error ?? undefined}>
              <span className="text-muted">UPL </span>
              <Tone tone={pnlTone(upl)} className="num font-[560]">
                {upl != null ? pnlUsd(upl) : "—"}
              </Tone>
            </span>
            <span className="whitespace-nowrap">
              <span className="text-muted">RPL </span>
              <Tone tone={pnlTone(rpl)} className="num font-[560]">
                {rpl != null ? pnlUsd(rpl) : "—"}
              </Tone>
            </span>
            {book?.market_error && (
              <Tone tone="text-amber" className="whitespace-nowrap font-[520]">
                no marks
              </Tone>
            )}
            {error && (
              <span title={error}>
                <Tone tone="text-amber" className="font-[520]">stale</Tone>
              </span>
            )}
            {book && <VenueChip paper={book.paper} venue={book.venue} />}
          </span>
        )
      }
    >
      <div className="relative h-full">
        <div ref={scroller} className="h-full overflow-auto" onScroll={measure}>
          <table className="w-full border-separate border-spacing-0 text-[12px]">
            <thead>
              <tr>
                {HEADERS.map((h, i) => (
                  <th
                    key={h}
                    scope="col"
                    className={`col-head sticky top-0 h-9 whitespace-nowrap border-b border-term-line bg-white/90 px-2.5 font-[520] tracking-[0.1em] backdrop-blur-md first:pl-4 last:pr-4 ${
                      i >= 3 && i <= 9 ? "text-right" : "text-left"
                    } ${i === 0 ? `left-0 z-20 ${slid ? "!bg-white shadow-[1px_0_0_rgba(120,145,180,0.22)]" : ""}` : "z-10"}`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            {(open.length > 0 || closed.length > 0) && (
              <tbody>
                {open.map((p) => {
                  return (
                    <tr key={p.id} className="motion-safe:transition-colors hover:bg-accent/[0.05]" title={p.thesis}>
                      <td
                        className={`${CELL} ${PINNED} ${slid ? PINNED_SCROLLED : ""} text-[12.5px] font-[560] tracking-[-0.01em] text-ink`}
                      >
                        {p.symbol}
                      </td>
                      <td className={CELL}>
                        <span className="text-[10.5px] font-[600] uppercase tracking-[0.1em] text-ink-soft">{p.side}</span>
                        <span className="num ml-1.5 text-[11px] text-muted">{p.leverage}x</span>
                      </td>
                      <td className={`${CELL} text-[10px] font-[520] uppercase tracking-[0.12em] text-muted`}>{p.source}</td>
                      <td className={`${CELL} num text-right text-ink-soft`}>{usd(p.notional_usdt, 0)}</td>
                      <td className={`${CELL} num text-right text-muted-2`}>{usd(p.entry_price)}</td>
                      <td className={`${CELL} num text-right text-ink-soft`}>{p.mark != null ? usd(p.mark) : "—"}</td>
                      <td className={`${CELL} num text-right font-[560]`}>
                        <Tone tone={pnlTone(p.pnl_usdt)}>{p.pnl_usdt != null ? pnlUsd(p.pnl_usdt) : "—"}</Tone>
                      </td>
                      <td className={`${CELL} num text-right`}>
                        <Tone tone={pnlTone(p.pnl_pct)}>{p.pnl_pct != null ? pnlPct(p.pnl_pct) : "—"}</Tone>
                      </td>
                      <td className={`${CELL} num text-right`}>
                        <Tone tone={pnlTone(p.roe_pct)}>{p.roe_pct != null ? pnlPct(p.roe_pct) : "—"}</Tone>
                      </td>
                      <td className={`${CELL} num text-right text-muted`}>{p.age_hours.toFixed(1)}h</td>
                      <td className={CELL}>
                        {p.mark == null ? (
                          // Exit rules cannot be checked without a price.
                          <Pill tone="text-amber" title="No live mark - exit rules cannot be checked">
                            unpriced
                          </Pill>
                        ) : p.would_exit ? (
                          <Pill tone={EXIT_TONE[p.would_exit] ?? "text-amber"}>{p.would_exit.replace(/_/g, " ")}</Pill>
                        ) : (
                          <span className="text-[11px] text-muted">hold</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {closed.length > 0 && (
                  <tr>
                    <th
                      scope="rowgroup"
                      colSpan={HEADERS.length}
                      className="h-8 border-b border-term-line/70 bg-white/40 px-4 text-left text-[10px] font-[520] uppercase tracking-[0.12em] text-muted"
                    >
                      <span className="sticky left-3 inline-block">Recently closed</span>
                    </th>
                  </tr>
                )}
                {closed.map((p) => {
                  return (
                    <tr key={p.id} className="text-muted motion-safe:transition-colors hover:bg-accent/[0.04]" title={p.thesis}>
                      <td className={`${CELL} ${PINNED} ${slid ? PINNED_SCROLLED : ""} text-[12.5px] font-[520] text-muted-2`}>
                        {p.symbol}
                      </td>
                      <td className={CELL}>
                        <Pill tone="text-term-dim">closed</Pill>
                      </td>
                      <td className={`${CELL} text-[10px] font-[520] uppercase tracking-[0.12em]`}>{p.source}</td>
                      <td className={`${CELL} num text-right`}>{usd(p.notional_usdt, 0)}</td>
                      <td className={`${CELL} num text-right`}>{usd(p.entry_price)}</td>
                      <td className={`${CELL} num text-right`}>{p.exit_price != null ? usd(p.exit_price) : "—"}</td>
                      <td className={`${CELL} num text-right`}>
                        {p.realized_pnl_usdt != null ? (
                          <Tone tone={pnlTone(p.realized_pnl_usdt)}>{pnlUsd(p.realized_pnl_usdt)}</Tone>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className={CELL} />
                      <td className={CELL} />
                      <td className={`${CELL} num text-right`}>{p.age_hours.toFixed(1)}h</td>
                      <td className={`${CELL} text-[11px]`}>{p.close_reason?.replace(/_/g, " ")}</td>
                    </tr>
                  );
                })}
              </tbody>
            )}
          </table>
          {open.length === 0 && closed.length === 0 && (
            // Kept outside the wide table so the message stays in view on a phone.
            <p className="sticky left-0 w-full px-4 py-8 text-center text-[10.5px] font-[520] uppercase tracking-[0.12em] text-muted">
              {book ? "flat · the agent has not opened a position" : error ? "book unavailable" : "loading the book…"}
            </p>
          )}
        </div>
        {/* A soft fade says the book continues to the right. */}
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-white/95 to-white/0 motion-safe:transition-opacity motion-safe:duration-300 ${
            edges.right ? "opacity-100" : "opacity-0"
          }`}
        />
      </div>
    </Panel>
  );
}

/** Where the book trades. Paper is the expected state; LIVE is the risk. */
function VenueChip({ paper, venue }: { paper: boolean; venue: string }) {
  if (!paper) return <Pill tone="text-signal-red">LIVE</Pill>;
  return (
    <span className="inline-flex h-[22px] items-center gap-1.5 whitespace-nowrap rounded-full border border-white/90 bg-white/75 px-2.5 text-[10px] font-[560] uppercase leading-none tracking-[0.1em] text-ink-soft shadow-[0_0_0_1px_rgba(120,145,180,0.22),0_2px_8px_rgba(28,52,92,0.05)]">
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-accent" />
      {venue === "bitget-demo" ? "PAPER · BITGET DEMO" : "PAPER · SIMULATED"}
    </span>
  );
}
