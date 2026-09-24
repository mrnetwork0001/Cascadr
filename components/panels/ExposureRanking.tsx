"use client";

import { Panel } from "@/components/terminal/Panel";
import { signedPct } from "@/lib/format";
import { CONTAGION_CLASS, CONTAGION_COLOR, PROVENANCE_CLASS } from "@/lib/theme";
import type { Decision } from "@/lib/types";

/**
 * The contagion one real decision implies, as computed by the server when the
 * decision was recorded: the origin at the shock the LLM assigned, then every
 * downstream company, strongest first.
 */
export function ExposureRanking({
  decision,
  loading,
  error,
  onNode,
  node,
}: {
  decision: Decision | null;
  loading: boolean;
  error: string | null;
  onNode: (id: string | null) => void;
  node: string | null;
}) {
  const rows = decision?.exposures ?? [];
  return (
    <Panel
      title="Contagion · Selected Decision"
      meta={decision ? `decision #${decision.id}` : "none"}
      flush
      className="h-full"
    >
      <div className="h-full overflow-y-auto">
        {!decision ? (
          <p className="px-3 py-6 text-center text-2xs uppercase tracking-widest text-term-dim">
            {error ? "cannot reach the agent" : loading ? "loading…" : "no decision has implied any exposure yet"}
          </p>
        ) : rows.length === 0 ? (
          <p className="px-3 py-6 text-center text-2xs uppercase tracking-widest text-term-dim">
            this headline names no graph company — no contagion
          </p>
        ) : (
          <ul>
            {rows.map((r) => {
              const isSel = node === r.target;
              return (
                <li key={r.target}>
                  <button
                    type="button"
                    onClick={() => onNode(isSel ? null : r.target)}
                    className={`w-full border-b border-term-line/60 px-2 py-1 text-left hover:bg-term-raised ${
                      isSel ? "bg-term-raised" : ""
                    }`}
                  >
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-xs font-semibold text-term-bright">
                        {r.ticker ?? r.target.replace(/_/g, " ")}
                      </span>
                      <span className="truncate text-2xs text-term-dim">{r.name}</span>
                      {r.is_origin ? (
                        <span className="border border-signal-red/50 px-1 text-2xs text-signal-red">ORIGIN</span>
                      ) : (
                        r.provenance && (
                          <span
                            className={`border px-1 text-2xs ${PROVENANCE_CLASS[r.provenance] ?? "text-term-dim border-term-edge"}`}
                            title="Weakest evidence class along this path"
                          >
                            {r.provenance}
                          </span>
                        )
                      )}
                      <span className={`num ml-auto text-xs ${CONTAGION_CLASS[r.contagion]}`}>
                        {(r.score * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-1.5">
                      <div className="h-[3px] flex-1 bg-term-line">
                        <div
                          className="h-full"
                          style={{
                            width: `${Math.min(100, r.score * 100)}%`,
                            backgroundColor: CONTAGION_COLOR[r.contagion],
                          }}
                        />
                      </div>
                      <span
                        className="num w-12 text-right text-2xs text-signal-red"
                        title="Model-implied move; also the position's take-profit"
                      >
                        {signedPct(r.implied_drawdown_pct, 1)}
                      </span>
                      <span className={`w-16 text-right text-2xs font-semibold ${CONTAGION_CLASS[r.contagion]}`}>
                        {r.contagion}
                      </span>
                    </div>
                    {!r.is_origin && (
                      <p className="mt-0.5 truncate text-2xs text-term-dim">{r.hops.join(" → ")}</p>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Panel>
  );
}
