"use client";

import { Panel } from "@/components/terminal/Panel";
import { signedPct, signedUsd, usd } from "@/lib/format";
import type { Position } from "@/lib/types";

/** Short P&L: price down is profit, scaled by leverage. */
function pnlOf(p: Position) {
  const move = (p.entry - p.mark) / p.entry;
  return { pct: move * p.leverage * 100, usd: move * p.notional * p.leverage };
}

const EXIT_TONE: Record<string, string> = {
  STOP_LOSS: "text-signal-red",
  TAKE_PROFIT: "text-signal-green",
  TIME_STOP: "text-amber",
};

export function PositionsBlotter({
  positions,
  pnl,
  realized = 0,
}: {
  positions: Position[];
  pnl: number;
  /** Booked P&L from positions the exit sweep has already closed. */
  realized?: number;
}) {
  return (
    <Panel
      title="Bitget Positions"
      flush
      meta={
        <span className="flex gap-3">
          <span className={pnl >= 0 ? "text-signal-green" : "text-signal-red"}>
            UPL {signedUsd(pnl)}
          </span>
          <span
            className={realized >= 0 ? "text-signal-green" : "text-signal-red"}
            title="Booked P&L from positions the exit sweep has closed"
          >
            RPL {signedUsd(realized)}
          </span>
        </span>
      }
    >
      <div className="h-full overflow-auto">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 bg-term-panel">
            <tr className="border-b border-term-line">
              <th className="col-head px-2 py-1 text-left">Symbol</th>
              <th className="col-head px-2 py-1 text-left">Side</th>
              <th className="col-head px-2 py-1 text-right">Notional</th>
              <th className="col-head px-2 py-1 text-right">Entry</th>
              <th className="col-head px-2 py-1 text-right">Mark</th>
              <th className="col-head px-2 py-1 text-right">P&amp;L</th>
              <th className="col-head px-2 py-1 text-right">%</th>
              <th className="col-head px-2 py-1 text-right">Age</th>
              <th className="col-head px-2 py-1 text-left">Exit</th>
            </tr>
          </thead>
          <tbody>
            {positions.length === 0 ? (
              <tr>
                <td
                  colSpan={9}
                  className="px-2 py-6 text-center text-2xs uppercase tracking-widest text-term-dim"
                >
                  flat · no open risk
                </td>
              </tr>
            ) : (
              positions.map((p) => {
                const r = pnlOf(p);
                const tone = r.usd >= 0 ? "text-signal-green" : "text-signal-red";
                return (
                  <tr
                    key={p.id}
                    className="border-b border-term-line/60 hover:bg-term-raised"
                    title={p.thesis}
                  >
                    <td className="px-2 py-1 font-semibold text-term-bright">
                      {p.symbol}
                    </td>
                    <td className="px-2 py-1">
                      <span className="text-signal-red">{p.side}</span>
                      <span className="ml-1 text-term-dim">{p.leverage}x</span>
                    </td>
                    <td className="num px-2 py-1 text-right text-term-text">
                      {usd(p.notional, 0)}
                    </td>
                    <td className="num px-2 py-1 text-right text-term-dim">
                      {usd(p.entry)}
                    </td>
                    <td className="num px-2 py-1 text-right text-term-text">
                      {usd(p.mark)}
                    </td>
                    <td className={`num px-2 py-1 text-right ${tone}`}>
                      {signedUsd(r.usd)}
                    </td>
                    <td className={`num px-2 py-1 text-right ${tone}`}>
                      {signedPct(r.pct)}
                    </td>
                    <td className="num px-2 py-1 text-right text-term-dim">
                      {p.ageHours !== undefined ? `${p.ageHours.toFixed(1)}h` : "—"}
                    </td>
                    <td className="px-2 py-1">
                      {p.wouldExit ? (
                        <span
                          className={`text-2xs font-semibold ${EXIT_TONE[p.wouldExit] ?? "text-amber"}`}
                        >
                          {p.wouldExit}
                        </span>
                      ) : (
                        <span className="text-2xs text-term-dim">hold</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
