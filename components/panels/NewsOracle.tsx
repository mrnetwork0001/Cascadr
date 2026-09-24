"use client";

import { Panel } from "@/components/terminal/Panel";
import { ago } from "@/lib/format";
import { ACTION_CLASS, ACTION_LABEL } from "@/lib/theme";
import type { Decision } from "@/lib/types";

const SEVERITY_CLASS: Record<string, string> = {
  LOW: "text-term-dim",
  MEDIUM: "text-signal-cyan",
  HIGH: "text-amber",
  SEVERE: "text-signal-red",
};

/**
 * The real headlines the agent has read, newest first, each with what the
 * LLM decided about it. Click one to draw its contagion on the graph.
 */
export function NewsOracle({
  decisions,
  selectedId,
  following,
  onSelect,
  loading,
  error,
}: {
  decisions: Decision[];
  selectedId: number | null;
  following: boolean;
  onSelect: (id: number | null) => void;
  loading: boolean;
  error: string | null;
}) {
  return (
    <Panel
      title="Live News · Agent Input"
      meta={
        error ? <span className="text-signal-red">feed stale</span> : loading ? "…" : `${decisions.length} reasoned`
      }
      flush
      className="h-full"
    >
      <div className="h-full overflow-y-auto">
        {decisions.length === 0 ? (
          <p className="px-3 py-6 text-center text-2xs uppercase tracking-widest text-term-dim">
            {error ? "cannot reach the agent" : loading ? "loading…" : "no headlines reasoned yet"}
          </p>
        ) : (
          <ul className="divide-y divide-term-line">
            {decisions.map((d) => {
              const active = d.id === selectedId;
              return (
                <li key={d.id}>
                  <button
                    type="button"
                    // Clicking the pinned headline again resumes following the latest.
                    onClick={() => onSelect(active && !following ? null : d.id)}
                    aria-pressed={active}
                    className={`block w-full px-2 py-1.5 text-left hover:bg-term-raised ${
                      active ? "bg-term-raised" : ""
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="text-2xs text-term-dim">{ago(d.published ?? d.at)}</span>
                      <span className="truncate text-2xs font-semibold uppercase tracking-wider text-signal-violet">
                        {d.source}
                      </span>
                      <span
                        className={`ml-auto shrink-0 border px-1 text-2xs font-semibold ${
                          ACTION_CLASS[d.action] ?? "text-term-dim border-term-edge"
                        }`}
                      >
                        {ACTION_LABEL[d.action] ?? d.action}
                      </span>
                    </div>
                    <p className="mt-1 text-xs leading-[15px] text-term-bright">{d.headline}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-2xs">
                      {d.entities.length ? (
                        d.entities.map((e) => (
                          <span key={e} className="border border-signal-cyan/40 px-1 text-signal-cyan">
                            {e.replace(/_/g, " ")}
                          </span>
                        ))
                      ) : (
                        <span className="text-term-dim">no graph company</span>
                      )}
                      <span className="num text-term-text">shock {d.shock.toFixed(2)}</span>
                      <span className={SEVERITY_CLASS[d.severity] ?? "text-term-dim"}>{d.severity}</span>
                      <span className="num ml-auto text-term-dim">
                        {d.engine === "llm" ? d.model : "keyword fallback"}
                      </span>
                    </div>
                  </button>
                  {d.url && (
                    <a
                      href={d.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block px-2 pb-1.5 text-2xs text-term-dim underline decoration-term-edge underline-offset-2 hover:text-amber"
                    >
                      read article ↗
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Panel>
  );
}
