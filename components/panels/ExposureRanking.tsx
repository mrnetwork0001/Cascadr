"use client";

import { Panel } from "@/components/terminal/Panel";
import { NODES } from "@/lib/mock/graph";
import { impliedDrawdownPct } from "@/lib/traversal";
import { CONTAGION_CLASS, CONTAGION_COLOR } from "@/lib/theme";
import { signedPct } from "@/lib/format";
import type { Contagion } from "@/lib/types";

interface Props {
  exposure: Record<string, number>;
  contagion: Record<string, Contagion>;
  selected: string | null;
  onSelect: (id: string | null) => void;
}

/**
 * Ranked read-out of the traversal: who is exposed, how badly, and what the
 * model thinks that is worth in price terms. Sorted hottest-first because the
 * only rows that matter are the top few.
 */
export function ExposureRanking({ exposure, contagion, selected, onSelect }: Props) {
  const rows = NODES.map((n) => ({ node: n, score: exposure[n.id] ?? 0 }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);

  return (
    <Panel title="Contagion Exposure" meta={`${rows.length} flagged`} flush>
      <div className="h-full overflow-y-auto">
        {rows.length === 0 ? (
          <p className="py-6 text-center text-2xs uppercase tracking-widest text-term-dim">
            graph nominal
          </p>
        ) : (
          <ul>
            {rows.map(({ node, score }) => {
              const status = contagion[node.id] ?? "NOMINAL";
              const isSel = selected === node.id;
              return (
                <li key={node.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(isSel ? null : node.id)}
                    className={`w-full border-b border-term-line/60 px-2 py-1 text-left hover:bg-term-raised ${
                      isSel ? "bg-term-raised" : ""
                    }`}
                  >
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-xs font-semibold text-term-bright">
                        {node.ticker ?? node.id.replace(/_/g, " ")}
                      </span>
                      <span className="truncate text-2xs text-term-dim">
                        {node.name}
                      </span>
                      <span className={`num ml-auto text-xs ${CONTAGION_CLASS[status]}`}>
                        {(score * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-1.5">
                      {/* Exposure bar doubles as the severity colour key. */}
                      <div className="h-[3px] flex-1 bg-term-line">
                        <div
                          className="h-full transition-[width] duration-500"
                          style={{
                            width: `${Math.min(100, score * 100)}%`,
                            backgroundColor: CONTAGION_COLOR[status],
                          }}
                        />
                      </div>
                      <span className="num w-12 text-right text-2xs text-signal-red">
                        {signedPct(impliedDrawdownPct(score), 1)}
                      </span>
                      <span
                        className={`w-14 text-right text-2xs font-semibold ${CONTAGION_CLASS[status]}`}
                      >
                        {status}
                      </span>
                    </div>
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
