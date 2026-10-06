"use client";

import type { CSSProperties, ReactNode } from "react";
import { Panel } from "@/components/terminal/Panel";
import { signedPct } from "@/lib/format";
import { CONTAGION_CLASS, CONTAGION_COLOR, PROVENANCE_CLASS } from "@/lib/theme";
import type { Decision } from "@/lib/types";

/*
 * Tailwind scans only app/ and components/, so the tone classes the lib/theme
 * maps hand us are named here to make sure they are generated:
 * text-term-dim text-signal-green text-amber text-signal-cyan text-signal-red
 * text-signal-violet text-[#D9622B]
 */
/*
 * Soft pills take their tint from the text colour the tone class sets, so the
 * existing PROVENANCE / CONTAGION meanings carry over unchanged. Small labels
 * are deepened toward ink to keep AA contrast on the tinted fill.
 */
const SOFT: CSSProperties = {
  backgroundColor: "color-mix(in srgb, currentColor 9%, transparent)",
  borderColor: "color-mix(in srgb, currentColor 24%, transparent)",
};
const DEEP: CSSProperties = { color: "color-mix(in srgb, currentColor 78%, #020C21)" };

function Pill({
  tone,
  children,
  title,
  className = "",
}: {
  tone: string;
  children: ReactNode;
  title?: string;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex h-[19px] shrink-0 items-center whitespace-nowrap rounded-full border px-2 text-[10px] font-[560] uppercase leading-none tracking-[0.08em] ${tone} ${className}`}
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
      meta={decision ? <span className="num whitespace-nowrap" title={`decision #${decision.id}`}>#{decision.id}</span> : "none"}
      flush
      className="h-full"
    >
      <div className="h-full overflow-y-auto">
        {!decision ? (
          <p className="px-4 py-8 text-center text-[10.5px] font-[520] uppercase tracking-[0.12em] text-muted">
            {error ? "cannot reach the agent" : loading ? "loading…" : "no decision has implied any exposure yet"}
          </p>
        ) : rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-[10.5px] font-[520] uppercase tracking-[0.12em] text-muted">
            this headline names no graph company - no contagion
          </p>
        ) : (
          <ul className="divide-y divide-term-line/70">
            {rows.map((r) => {
              const isSel = node === r.target;
              const label = r.ticker ?? r.target.replace(/_/g, " ");
              return (
                <li key={r.target} className="relative">
                  {isSel && (
                    <span aria-hidden="true" className="absolute inset-y-2 left-0 z-[1] w-[3px] rounded-r-full bg-accent" />
                  )}
                  <button
                    type="button"
                    onClick={() => onNode(isSel ? null : r.target)}
                    aria-pressed={isSel}
                    className={`w-full px-4 py-3 text-left focus-visible:outline-offset-[-2px] motion-safe:transition-colors motion-safe:duration-200 ${
                      isSel ? "bg-accent/[0.09]" : "hover:bg-white/70"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="shrink-0 text-[13px] font-[560] tracking-[-0.01em] text-ink">{label}</span>
                      <span className="min-w-0 truncate text-[11.5px] text-muted">{r.name}</span>
                      {r.is_origin ? (
                        <Pill tone="text-signal-red" title="Where the shock lands first">
                          origin
                        </Pill>
                      ) : (
                        r.provenance && (
                          <Pill
                            tone={PROVENANCE_CLASS[r.provenance] ?? "text-term-dim"}
                            title="Weakest evidence class along this path"
                          >
                            {r.provenance}
                          </Pill>
                        )
                      )}
                      <Tone
                        tone={CONTAGION_CLASS[r.contagion]}
                        className="num ml-auto shrink-0 pl-1 text-[13px] font-[560]"
                      >
                        {(r.score * 100).toFixed(0)}%
                      </Tone>
                    </div>
                    <div className="mt-2 flex items-center gap-3">
                      <div
                        className="h-[5px] min-w-[48px] flex-1 overflow-hidden rounded-full bg-track"
                        role="presentation"
                      >
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.min(100, r.score * 100)}%`,
                            backgroundColor: CONTAGION_COLOR[r.contagion],
                          }}
                        />
                      </div>
                      <span
                        className="shrink-0 whitespace-nowrap text-[11px] text-muted"
                        title="Model-implied move; also the position's take-profit"
                      >
                        implied{" "}
                        <Tone tone="text-signal-red" className="num font-[560]">
                          {signedPct(r.implied_drawdown_pct, 1)}
                        </Tone>
                      </span>
                      <Pill tone={CONTAGION_CLASS[r.contagion]} className="w-[78px] justify-center">
                        {r.contagion}
                      </Pill>
                    </div>
                    {!r.is_origin && (
                      <p className="mt-1.5 truncate text-[11px] text-muted">
                        {r.hops.map((h) => h.replace(/_/g, " ")).join(" → ")}
                      </p>
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
