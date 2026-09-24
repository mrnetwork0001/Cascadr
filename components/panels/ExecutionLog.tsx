"use client";

import { useState } from "react";
import { Panel } from "@/components/terminal/Panel";
import { timeOf } from "@/lib/format";
import { ACTION_CLASS, ACTION_LABEL } from "@/lib/theme";
import type { FeedItem } from "@/lib/types";

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
      meta={error ? <span className="text-signal-red">stale · {error}</span> : loading ? "…" : `${items.length} events`}
      flush
      className="h-full"
    >
      <div className="h-full overflow-y-auto px-2 py-1.5">
        {items.length === 0 ? (
          <p className="py-6 text-center text-2xs uppercase tracking-widest text-term-dim">
            {error ? "cannot reach the agent" : loading ? "loading…" : "no activity recorded yet"}
          </p>
        ) : (
          <ul className="space-y-1.5">
            {items.map((it) =>
              it.kind === "decision" ? (
                <DecisionRow key={`d${it.id}`} d={it} onSelect={onSelect} />
              ) : (
                <li key={`p${it.position_id}${it.at}${it.event}`} className="flex gap-1.5 leading-[15px]">
                  <span className="num shrink-0 text-2xs text-term-dim">{timeOf(it.at)}</span>
                  <span className="w-14 shrink-0 text-2xs font-semibold text-signal-green">{it.event}</span>
                  <span className="text-2xs text-term-text">
                    {it.symbol} · {it.detail}
                    {it.source && <span className="ml-1 text-term-dim">({it.source})</span>}
                  </span>
                </li>
              )
            )}
          </ul>
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
  return (
    <li className="leading-[15px]">
      <div className="flex gap-1.5">
        <span className="num shrink-0 text-2xs text-term-dim">{timeOf(d.at)}</span>
        <span className="w-14 shrink-0 text-2xs font-semibold text-signal-violet">READ</span>
        <button type="button" onClick={() => onSelect(d.id)} className="flex-1 text-left text-2xs text-term-text hover:text-amber">
          <span className="text-term-dim">{d.source}: </span>
          {d.headline}
        </button>
      </div>
      <div className="ml-[92px] mt-0.5 flex flex-wrap items-center gap-x-2 text-2xs">
        <span className="text-signal-violet">[{d.engine === "llm" ? d.model : "keyword fallback"}]</span>
        <span className="num text-term-text">shock {d.shock.toFixed(2)}</span>
        <span className="text-term-dim">{d.severity}</span>
        <span className="num text-term-dim">conf {d.confidence.toFixed(2)}</span>
        {d.entities.length > 0 && <span className="text-signal-cyan">→ {d.entities.join(", ")}</span>}
        <span className={`border px-1 font-semibold ${ACTION_CLASS[d.action] ?? ""}`}>
          {ACTION_LABEL[d.action] ?? d.action}
        </span>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="border border-term-edge px-1 text-term-dim hover:border-amber hover:text-amber"
        >
          {open ? "hide" : "why"}
        </button>
      </div>
      {open && (
        <div className="my-1 ml-[92px] space-y-1 border-l-2 border-signal-violet/50 bg-term-void px-2 py-1 text-2xs">
          {d.reasoning && <p className="text-term-text"><span className="text-term-dim">reasoning · </span>{d.reasoning}</p>}
          {d.uncertainty && <p className="text-term-text"><span className="text-term-dim">uncertainty · </span>{d.uncertainty}</p>}
          <p className="text-term-dim">outcome · {d.detail}</p>
          {downstream.length > 0 && (
            <p className="text-term-dim">
              implies · {downstream.slice(0, 5).map((e) => `${e.ticker ?? e.target} ${(e.score * 100).toFixed(0)}%`).join(", ")}
            </p>
          )}
          {d.provider && (
            <p className="text-term-dim">
              0G provider · <span className="num text-term-text">{d.provider}</span>
            </p>
          )}
          {d.url && (
            <a href={d.url} target="_blank" rel="noopener noreferrer" className="text-amber underline underline-offset-2">
              source article ↗
            </a>
          )}
        </div>
      )}
    </li>
  );
}

