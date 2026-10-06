"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { Panel } from "@/components/terminal/Panel";
import { timeOf } from "@/lib/format";
import { ACTION_CLASS, ACTION_LABEL } from "@/lib/theme";
import type { FeedItem } from "@/lib/types";

/*
 * Tailwind scans only app/ and components/, so the tone classes the lib/theme
 * maps hand us are named here to make sure they are generated:
 * text-term-dim text-signal-green text-amber text-signal-cyan text-signal-red
 * text-signal-violet
 */
/*
 * Soft pills take their tint from the text colour the tone class sets, so the
 * existing ACTION_CLASS meanings carry over unchanged. Small labels are
 * deepened toward ink to keep AA contrast on the tinted fill.
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

/** Book events: a rejected close is the only one that needs a caution tone. */
const EVENT_TONE: Record<string, string> = {
  CLOSE_REJECTED: "text-amber",
};

/** A label / value pair in the decision's metadata line. */
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="whitespace-nowrap text-[11px] text-muted">
      {label} <span className="num font-[560] text-ink-soft">{value}</span>
    </span>
  );
}

/**
 * The agent's real activity, newest first: every headline it reasoned about
 * (with the model's reasoning, uncertainty and the 0G provider that ran it)
 * and every paper position event. Nothing here is narrated by the browser.
 */
export function ExecutionLog({
  items,
  loading,
  error,
  onSelect,
}: {
  items: FeedItem[];
  loading: boolean;
  error: string | null;
  onSelect: (id: number) => void;
}) {
  return (
    <Panel
      title="Agent Log"
      meta={
        error ? (
          <span className="text-amber">
            <span style={DEEP}>stale · {error}</span>
          </span>
        ) : loading ? (
          "…"
        ) : (
          <span className="num">{items.length} events</span>
        )
      }
      flush
      className="h-full"
    >
      <div className="h-full overflow-y-auto">
        {items.length === 0 ? (
          <p className="px-4 py-8 text-center text-[10.5px] font-[520] uppercase tracking-[0.12em] text-muted">
            {error ? "cannot reach the agent" : loading ? "loading…" : "no activity recorded yet"}
          </p>
        ) : (
          <ol className="px-3 py-1.5 sm:px-4">
            {items.map((it) =>
              it.kind === "decision" ? (
                <DecisionRow key={`d${it.id}`} d={it} onSelect={onSelect} />
              ) : (
                <li key={`p${it.position_id}${it.at}${it.event}`} className="grid grid-cols-[52px_minmax(0,1fr)] gap-x-3">
                  <time dateTime={it.at} className="num pt-3 text-right text-[11px] text-muted">
                    {timeOf(it.at)}
                  </time>
                  <div className="relative border-l border-term-line py-2.5 pl-4">
                    <span
                      aria-hidden="true"
                      className="absolute -left-[4px] top-[17px] h-[7px] w-[7px] rounded-full bg-cta ring-[3px] ring-white/90"
                    />
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <Pill tone={EVENT_TONE[it.event] ?? "text-cta"}>{it.event.replace(/_/g, " ")}</Pill>
                      {it.symbol && (
                        <span className="text-[12.5px] font-[560] tracking-[-0.01em] text-ink">{it.symbol}</span>
                      )}
                      {it.source && (
                        <span className="ml-auto text-[10px] font-[520] uppercase tracking-[0.12em] text-muted">
                          {it.source}
                        </span>
                      )}
                    </div>
                    <p className="num mt-1 break-words text-[12px] leading-[17px] text-muted-2">{it.detail}</p>
                  </div>
                </li>
              )
            )}
          </ol>
        )}
      </div>
    </Panel>
  );
}

function DecisionRow({
  d,
  onSelect,
}: {
  d: Extract<FeedItem, { kind: "decision" }>;
  onSelect: (id: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const downstream = d.exposures.filter((e) => !e.is_origin);
  const whyId = `why-${d.id}`;
  return (
    <li className="grid grid-cols-[52px_minmax(0,1fr)] gap-x-3">
      <time dateTime={d.at} className="num pt-3 text-right text-[11px] text-muted">
        {timeOf(d.at)}
      </time>
      <div className="relative min-w-0 border-l border-term-line py-2.5 pl-4">
        <span
          aria-hidden="true"
          className="absolute -left-[4px] top-[17px] h-[7px] w-[7px] rounded-full bg-accent ring-[3px] ring-white/90"
        />
        <div className="flex items-center gap-2">
          <span className="min-w-0 truncate text-[10.5px] font-[560] uppercase tracking-[0.12em] text-muted-2">
            read · {d.source}
          </span>
          <span className="ml-auto flex shrink-0 items-center gap-1.5">
            <Pill tone={ACTION_CLASS[d.action] ?? "text-term-dim"}>{ACTION_LABEL[d.action] ?? d.action}</Pill>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-controls={open ? whyId : undefined}
              className={`inline-flex h-[21px] shrink-0 items-center gap-1 rounded-full border pl-2.5 pr-1.5 text-[11px] font-[520] motion-safe:transition-colors ${
                open
                  ? "border-accent/30 bg-accent/[0.09] text-accent-deep"
                  : "border-white/90 bg-white/70 text-ink-soft shadow-[0_0_0_1px_rgba(120,145,180,0.2)] hover:text-accent-deep"
              }`}
            >
              {open ? "hide" : "why"}
              <svg
                aria-hidden="true"
                viewBox="0 0 18 18"
                className={`h-3 w-3 motion-safe:transition-transform motion-safe:duration-300 ${open ? "rotate-90" : ""}`}
                fill="none"
              >
                <path d="m6.6 3.6 6 5.4-6 5.4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </span>
        </div>
        <button
          type="button"
          onClick={() => onSelect(d.id)}
          title="Show this decision's contagion on the graph"
          className="mt-1 block w-full rounded-md text-left text-[13px] font-[470] leading-[18px] tracking-[-0.01em] text-ink-soft hover:text-accent-deep motion-safe:transition-colors"
        >
          {d.headline}
        </button>
        <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <span className="inline-flex h-[19px] items-center whitespace-nowrap rounded-full border border-term-line bg-white/60 px-2 text-[10.5px] text-muted-2">
            {d.engine === "llm" ? d.model : "keyword fallback"}
          </span>
          <Stat label="shock" value={d.shock.toFixed(2)} />
          <span className="text-[10px] font-[560] uppercase tracking-[0.1em] text-muted">{d.severity}</span>
          <Stat label="conf" value={d.confidence.toFixed(2)} />
          {d.entities.length > 0 && (
            <span className="text-[11px] font-[520] text-accent-deep">→ {d.entities.join(", ")}</span>
          )}
        </div>
        {open && (
          <div
            id={whyId}
            className="mt-2.5 rounded-2xl border border-white/90 bg-white/75 p-3.5 text-[12px] leading-[18px] shadow-[inset_1px_1px_0_rgba(255,255,255,0.55),0_0_0_1px_rgba(120,145,180,0.14),0_8px_20px_rgba(28,52,92,0.05)]"
          >
            <dl className="space-y-2.5">
              {d.reasoning && <WhyItem label="reasoning">{d.reasoning}</WhyItem>}
              {d.uncertainty && <WhyItem label="uncertainty">{d.uncertainty}</WhyItem>}
              <WhyItem label="outcome">{d.detail}</WhyItem>
              {downstream.length > 0 && (
                <WhyItem label="implies">
                  <span className="num">
                    {downstream
                      .slice(0, 5)
                      .map((e) => `${e.ticker ?? e.target} ${(e.score * 100).toFixed(0)}%`)
                      .join(", ")}
                  </span>
                </WhyItem>
              )}
              {d.provider && (
                <WhyItem label="0G provider">
                  <span className="num break-all">{d.provider}</span>
                </WhyItem>
              )}
            </dl>
            {d.url && (
              <a
                href={d.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2.5 inline-block font-[500] text-accent-deep underline decoration-accent/30 underline-offset-[3px] hover:decoration-accent-deep"
              >
                source article ↗
              </a>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

function WhyItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-[10px] font-[560] uppercase tracking-[0.12em] text-muted">{label}</dt>
      <dd className="mt-0.5 text-ink-soft">{children}</dd>
    </div>
  );
}
