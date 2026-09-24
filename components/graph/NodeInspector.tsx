"use client";

import { useState } from "react";
import { signedPct, usd } from "@/lib/format";
import { PROVENANCE_CLASS } from "@/lib/theme";
import type { Graph, GraphEdge, Quote, Source } from "@/lib/types";

/** Everything known about one company, each figure with where it came from. */
export function NodeInspector({
  graph,
  nodeId,
  quote,
  quoteStale,
  onClose,
}: {
  graph: Graph;
  nodeId: string;
  quote: Quote | null;
  quoteStale: boolean;
  onClose: () => void;
}) {
  const node = graph.nodes.find((n) => n.id === nodeId);
  if (!node) return null;
  const inbound = graph.edges.filter((e) => e.target === nodeId);
  const outbound = graph.edges.filter((e) => e.source === nodeId);
  const conc = graph.concentration[nodeId] ?? [];

  return (
    <div className="pointer-events-auto absolute bottom-2 left-2 w-[calc(100%-1rem)] max-w-[340px] border border-term-edge bg-term-panel/95 backdrop-blur-sm">
      <header className="flex items-center gap-2 border-b border-term-line bg-term-raised px-2 py-1">
        <span className="truncate text-xs font-semibold text-term-bright">{node.name}</span>
        {node.ticker && <span className="border border-amber/50 px-1 text-2xs text-amber">{node.ticker}USDT</span>}
        <button type="button" onClick={onClose} className="ml-auto px-1 text-2xs text-term-dim hover:text-signal-red" aria-label="Close inspector">
          ✕
        </button>
      </header>

      <div className="max-h-[min(420px,55vh)] space-y-2 overflow-y-auto px-2 py-1.5">
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-2xs">
          <Field label="Tier" value={node.tier} />
          <Field label="Country" value={node.country} />
          <Field label="Revenue" value={`$${node.revenue_b.toFixed(1)}B`} />
          <Field label="Period" value={node.revenue_period ?? "—"} />
          {quote && (
            <>
              <Field
                label={quoteStale ? "Mark (stale)" : "Mark"}
                value={quote.mark != null ? usd(quote.mark) : "—"}
                className={quoteStale ? "text-term-dim" : undefined}
              />
              <Field
                label="24h"
                value={quote.change24h_pct != null ? signedPct(quote.change24h_pct) : "—"}
                className={
                  quoteStale ? "text-term-dim" : (quote.change24h_pct ?? 0) >= 0 ? "text-signal-green" : "text-signal-red"
                }
              />
            </>
          )}
        </dl>
        {node.revenue_source && (
          <p className="text-2xs text-term-dim">
            revenue: {node.revenue_source}
            {node.revenue_note ? ` · ${node.revenue_note}` : ""}
          </p>
        )}

        {conc.length > 0 && (
          <div>
            <p className="col-head mb-0.5">Customer concentration (SEC filing)</p>
            {conc.map((c, i) => (
              <p key={i} className="text-2xs text-term-text" title={c.quote}>
                {c.pct != null ? `${c.customer ?? "One customer"}: ${c.pct}% of revenue` : c.customer ?? "No customer share disclosed"}
                {c.fiscal_year ? ` · ${c.fiscal_year}` : ""}
                {c.url && (
                  <a href={c.url} target="_blank" rel="noopener noreferrer" className="ml-1 text-amber underline">
                    {c.form ?? "filing"} ↗
                  </a>
                )}
              </p>
            ))}
          </div>
        )}

        {inbound.length > 0 && <Relations title="Depends on" rows={inbound} side="source" />}
        {outbound.length > 0 && <Relations title="Supplies" rows={outbound} side="target" />}
      </div>
    </div>
  );
}

function Field({ label, value, className = "text-term-text" }: { label: string; value: string; className?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="col-head">{label}</dt>
      <dd className={`num font-semibold ${className}`}>{value}</dd>
    </div>
  );
}

function Relations({ title, rows, side }: { title: string; rows: GraphEdge[]; side: "source" | "target" }) {
  return (
    <div>
      <p className="col-head mb-0.5">{title}</p>
      <ul className="space-y-1">
        {rows.map((e) => (
          <Relation key={`${e.source}-${e.target}-${e.component}`} e={e} side={side} />
        ))}
      </ul>
    </div>
  );
}

/** One link, collapsed to a line; expanded, the whole case for its number. */
function Relation({ e, side }: { e: GraphEdge; side: "source" | "target" }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="text-2xs">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-baseline gap-1.5 text-left hover:bg-term-raised"
      >
        <span className="w-20 shrink-0 truncate text-signal-cyan">{e[side].replace(/_/g, " ")}</span>
        <span className="flex-1 truncate text-term-dim">{e.component}</span>
        <span className="num text-term-text">{(e.dependency * 100).toFixed(0)}%</span>
        <span className={`border px-1 ${PROVENANCE_CLASS[e.provenance] ?? "text-term-dim border-term-edge"}`}>{e.provenance}</span>
        <span className="w-2 text-term-dim">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className="mt-1 space-y-1.5 border-l-2 border-term-edge pl-2">
          <p className="text-term-dim">
            {e.component}
            {e.confidence && ` · ${e.confidence} confidence`}
            {e.as_of && ` · as of ${e.as_of}`}
          </p>
          {e.weight_note && (
            <p className="text-term-text">
              <span className="text-signal-cyan">The number: </span>
              {e.weight_note}
            </p>
          )}
          {e.basis && <p className="leading-relaxed text-term-text">{e.basis}</p>}
          {e.notes && (
            <p className="leading-relaxed text-term-dim">
              <span className="text-amber">Caveats: </span>
              {e.notes}
            </p>
          )}
          <SourceList title={`Sources (${e.sources.length})`} items={e.sources} />
          {e.counter_evidence.length > 0 && <SourceList title="Counter-evidence" items={e.counter_evidence} />}
        </div>
      )}
    </li>
  );
}

function SourceList({ title, items }: { title: string; items: Source[] }) {
  return (
    <div>
      <p className="col-head mb-0.5">{title}</p>
      <ul className="space-y-1">
        {items.map((s, i) => (
          <li key={`${s.url}-${i}`}>
            <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-term-text underline decoration-term-edge underline-offset-2 hover:text-amber">
              {s.publisher || hostOf(s.url)}
              {s.date ? `, ${s.date}` : ""} ↗
            </a>
            {s.quote && <p className="mt-0.5 italic text-term-dim">“{s.quote}”</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}
