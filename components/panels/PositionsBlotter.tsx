"use client";

import { Panel } from "@/components/terminal/Panel";
import { signedPct, signedUsd, usd } from "@/lib/format";
import type { PositionsResponse } from "@/lib/types";

const EXIT_TONE: Record<string, string> = {
  STOP_LOSS: "text-signal-red",
  TAKE_PROFIT: "text-signal-green",
  TIME_STOP: "text-amber",
};

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
  const pnlTone = (v: number | null) => (v == null ? "text-term-dim" : v >= 0 ? "text-signal-green" : "text-signal-red");

  return (
    <Panel
      title="Paper Positions"
      flush
      className="h-full"
      meta={
        error && !book ? (
          <span className="text-signal-red">unavailable</span>
        ) : (
          <span className="flex gap-3">
            <span className={pnlTone(upl)} title={book?.market_error ?? undefined}>
              UPL {upl != null ? signedUsd(upl) : "—"}
            </span>
            <span className={pnlTone(rpl)}>RPL {rpl != null ? signedUsd(rpl) : "—"}</span>
            {book?.market_error && <span className="text-signal-red">no marks</span>}
            {error && <span className="text-signal-red" title={error}>stale</span>}
            {book && (
              <span className={book.paper ? "text-amber" : "text-signal-red"}>
                {!book.paper ? "LIVE" : book.venue === "bitget-demo" ? "PAPER · BITGET DEMO" : "PAPER · SIMULATED"}
              </span>
            )}
          </span>
        )
      }
    >
      <div className="h-full overflow-auto">
        <table className="w-full min-w-[720px] border-collapse">
          <thead className="sticky top-0 bg-term-panel">
            <tr className="border-b border-term-line">
              {["Symbol", "Side", "By", "Notional", "Entry", "Mark / Exit", "P&L", "Move", "ROE", "Age", "Exit"].map((h, i) => (
                <th key={h} className={`col-head px-2 py-1 ${i >= 3 && i <= 9 ? "text-right" : "text-left"}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {open.length === 0 && closed.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-2 py-6 text-center text-2xs uppercase tracking-widest text-term-dim">
                  {book ? "flat · the agent has not opened a position" : error ? "book unavailable" : "loading the book…"}
                </td>
              </tr>
            ) : (
              <>
                {open.map((p) => {
                  const tone = p.pnl_usdt == null ? "text-term-dim" : p.pnl_usdt >= 0 ? "text-signal-green" : "text-signal-red";
                  return (
                    <tr key={p.id} className="border-b border-term-line/60 hover:bg-term-raised" title={p.thesis}>
                      <td className="px-2 py-1 font-semibold text-term-bright">{p.symbol}</td>
                      <td className="px-2 py-1">
                        <span className="text-signal-red">{p.side}</span>
                        <span className="ml-1 text-term-dim">{p.leverage}x</span>
                      </td>
                      <td className="px-2 py-1 text-2xs text-term-dim">{p.source}</td>
                      <td className="num px-2 py-1 text-right">{usd(p.notional_usdt, 0)}</td>
                      <td className="num px-2 py-1 text-right text-term-dim">{usd(p.entry_price)}</td>
                      <td className="num px-2 py-1 text-right">{p.mark != null ? usd(p.mark) : "—"}</td>
                      <td className={`num px-2 py-1 text-right ${tone}`}>{p.pnl_usdt != null ? signedUsd(p.pnl_usdt) : "—"}</td>
                      <td className={`num px-2 py-1 text-right ${tone}`}>{p.pnl_pct != null ? signedPct(p.pnl_pct) : "—"}</td>
                      <td className={`num px-2 py-1 text-right ${tone}`}>{p.roe_pct != null ? signedPct(p.roe_pct) : "—"}</td>
                      <td className="num px-2 py-1 text-right text-term-dim">{p.age_hours.toFixed(1)}h</td>
                      <td className="px-2 py-1 text-2xs">
                        {p.mark == null ? (
                          // Exit rules cannot be checked without a price.
                          <span className="text-amber">unpriced</span>
                        ) : p.would_exit ? (
                          <span className={`font-semibold ${EXIT_TONE[p.would_exit] ?? "text-amber"}`}>{p.would_exit}</span>
                        ) : (
                          <span className="text-term-dim">hold</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {closed.map((p) => {
                  const tone = (p.realized_pnl_usdt ?? 0) >= 0 ? "text-signal-green/70" : "text-signal-red/70";
                  return (
                    <tr key={p.id} className="border-b border-term-line/40 text-term-dim" title={p.thesis}>
                      <td className="px-2 py-1">{p.symbol}</td>
                      <td className="px-2 py-1 text-2xs">closed</td>
                      <td className="px-2 py-1 text-2xs">{p.source}</td>
                      <td className="num px-2 py-1 text-right">{usd(p.notional_usdt, 0)}</td>
                      <td className="num px-2 py-1 text-right">{usd(p.entry_price)}</td>
                      <td className="num px-2 py-1 text-right">{p.exit_price != null ? usd(p.exit_price) : "—"}</td>
                      <td className={`num px-2 py-1 text-right ${tone}`}>
                        {p.realized_pnl_usdt != null ? signedUsd(p.realized_pnl_usdt) : "—"}
                      </td>
                      <td className="px-2 py-1" />
                      <td className="px-2 py-1" />
                      <td className="num px-2 py-1 text-right">{p.age_hours.toFixed(1)}h</td>
                      <td className="px-2 py-1 text-2xs">{p.close_reason}</td>
                    </tr>
                  );
                })}
              </>
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
