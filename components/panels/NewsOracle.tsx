"use client";

import type { CSSProperties, ReactNode } from "react";
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

/*
 * Tailwind scans only app/ and components/, so the tone classes the lib/theme
 * maps hand us are named here to make sure they are generated:
 * text-term-dim text-signal-green text-amber text-signal-cyan text-signal-red
 * text-signal-violet
 */
/*
 * Soft pills take their tint from whatever text colour the tone class sets, so
 * the existing ACTION_CLASS meanings carry over unchanged. The label inside is
 * deepened toward ink so small type keeps AA contrast on the tinted fill.
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
        error ? (
          <Tone tone="text-amber" className="font-[520]">feed stale</Tone>
        ) : loading ? (
          "…"
        ) : (
          <span className="num">{decisions.length} reasoned</span>
        )
      }
      flush
      className="h-full"
    >
      <div className="h-full overflow-y-auto">
        {decisions.length === 0 ? (
          <p className="px-4 py-8 text-center text-[10.5px] font-[520] uppercase tracking-[0.12em] text-muted">
            {error ? "cannot reach the agent" : loading ? "loading…" : "no headlines reasoned yet"}
          </p>
        ) : (
          <ul className="divide-y divide-term-line/70">
            {decisions.map((d) => {
              const active = d.id === selectedId;
              return (
                <li
                  key={d.id}
                  className={`relative motion-safe:transition-colors motion-safe:duration-200 ${
                    active ? "bg-accent/[0.09]" : "hover:bg-white/70"
                  }`}
                >
                  {active && (
                    <span aria-hidden="true" className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-accent" />
                  )}
                  <button
                    type="button"
                    // Clicking the pinned headline again resumes following the latest.
                    onClick={() => onSelect(active && !following ? null : d.id)}
                    aria-pressed={active}
                    className="group block w-full px-4 pb-2.5 pt-3 text-left focus-visible:outline-offset-[-2px]"
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="min-w-0 truncate text-[10.5px] font-[560] uppercase tracking-[0.12em] text-muted-2">
                        {d.source}
                      </span>
                      <span aria-hidden="true" className="text-muted/50">·</span>
                      <span className="num shrink-0 text-[11px] text-muted">{ago(d.published ?? d.at)}</span>
                      <span className="ml-auto pl-2">
                        <Pill tone={ACTION_CLASS[d.action] ?? "text-term-dim"}>{ACTION_LABEL[d.action] ?? d.action}</Pill>
                      </span>
                    </div>
                    <p
                      className={`mt-1.5 text-[13px] font-[470] leading-[18px] tracking-[-0.01em] motion-safe:transition-colors ${
                        active ? "text-ink" : "text-ink-soft group-hover:text-ink"
                      }`}
                    >
                      {d.headline}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                      {d.entities.length ? (
                        d.entities.map((e) => (
                          <Pill key={e} tone="text-accent-deep">
                            {e.replace(/_/g, " ")}
                          </Pill>
                        ))
                      ) : (
                        <span className="text-[11px] text-muted">no graph company</span>
                      )}
                      <span className="whitespace-nowrap text-[11px] text-muted">
                        shock <span className="num font-[560] text-ink-soft">{d.shock.toFixed(2)}</span>
                      </span>
                      <Tone
                        tone={SEVERITY_CLASS[d.severity] ?? "text-term-dim"}
                        className="text-[10px] font-[560] uppercase tracking-[0.1em]"
                      >
                        {d.severity}
                      </Tone>
                    </div>
                  </button>
                  <div className="flex items-center gap-3 px-4 pb-3 text-[11px]">
                    {d.url && (
                      <a
                        href={d.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 font-[500] text-accent-deep underline decoration-accent/30 underline-offset-[3px] hover:decoration-accent-deep"
                      >
                        read article ↗
                      </a>
                    )}
                    <span className="ml-auto min-w-0 truncate text-muted">
                      {d.engine === "llm" ? d.model : "keyword fallback"}
                    </span>
                  </div>
                  {active && (
                    <p className="-mt-1 flex items-center gap-1.5 px-4 pb-3 text-[10px] font-[560] uppercase tracking-[0.1em] text-accent-deep">
                      <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                      {following ? "following the latest decision" : "pinned · click again to follow latest"}
                    </p>
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
