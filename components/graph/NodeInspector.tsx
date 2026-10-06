"use client";

import { useState } from "react";
import { GRAPH_GLASS, TIER_TINT } from "@/components/graph/GraphCanvas";
import { signedPct, usd } from "@/lib/format";
import { getLogo, logoSrc } from "@/lib/logos";
import { PROVENANCE_CLASS } from "@/lib/theme";
import type { Graph, GraphEdge, Quote, Source } from "@/lib/types";

/**
 * Everything known about one company, each figure with where it came from.
 * Sized by its parent: GraphPanel places it and bounds its height.
 */
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
  // The canvas has already fetched the icon by the time a node is clicked;
  // without one (or before it decodes) the header falls back to initials.
  const hasLogo = getLogo(nodeId) != null;

  return (
    <section
      aria-label={`${node.name} details`}
      className={`${GRAPH_GLASS} pointer-events-auto flex max-h-full w-full max-w-[372px] flex-col overflow-hidden rounded-[22px] bg-white/[0.93]`}
    >
      <header className="flex shrink-0 items-center gap-3 border-b border-[rgba(120,145,180,0.16)] py-3 pl-3.5 pr-3">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white p-[3px] shadow-[0_0_0_1px_rgba(120,145,180,0.22),0_4px_10px_rgba(28,52,92,0.12)]"
          aria-hidden="true"
        >
          {hasLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoSrc(nodeId)} alt="" className="h-full w-full rounded-full object-cover" />
          ) : (
            <span className="text-[11px] font-[600] text-ink-soft">{(node.ticker ?? node.id).slice(0, 3)}</span>
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-[520] leading-tight tracking-[-0.02em] text-ink">{node.name}</p>
          <div className="mt-1 flex items-center gap-1.5">
            {node.ticker && (
              <span className="num rounded-full bg-track/80 px-2 py-px text-[10.5px] font-[520] tracking-[0.02em] text-ink-soft">
                {node.ticker}USDT
              </span>
            )}
            <span className="flex items-center gap-1 text-[11px] font-[450] text-muted">
              <span
                aria-hidden="true"
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: TIER_TINT[node.tier] }}
              />
              {node.tier.charAt(0) + node.tier.slice(1).toLowerCase()}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close inspector"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/80 text-muted shadow-[0_0_0_1px_rgba(120,145,180,0.22)] transition-colors hover:bg-white hover:text-ink"
        >
          <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" aria-hidden="true">
            <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
        </button>
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-3.5 pb-4 pt-3 sm:max-h-[440px]">
        <dl className="grid grid-cols-2 gap-x-3 gap-y-2.5 rounded-[14px] bg-white/70 p-3 shadow-[0_0_0_1px_rgba(120,145,180,0.14)]">
          <Field label="Tier" value={node.tier} />
          <Field label="Country" value={node.country} />
          <Field label="Revenue" value={`$${node.revenue_b.toFixed(1)}B`} />
          <Field label="Period" value={node.revenue_period ?? "-"} />
          {quote && (
            <>
              <Field
                label={quoteStale ? "Mark (stale)" : "Mark"}
                value={quote.mark != null ? usd(quote.mark) : "-"}
                className={quoteStale ? "text-muted" : undefined}
              />
              <Field
                label="24h"
                value={quote.change24h_pct != null ? signedPct(quote.change24h_pct) : "-"}
                className={
                  quoteStale || quote.change24h_pct == null
                    ? "text-muted"
                    : quote.change24h_pct >= 0
                      ? "text-signal-green"
                      : "text-signal-red"
                }
              />
            </>
          )}
        </dl>
        {node.revenue_source && (
          <p className="-mt-1.5 px-0.5 text-[11.5px] leading-relaxed text-muted">
            <span className="font-[520] text-muted-2">Revenue source · </span>
            {node.revenue_source}
            {node.revenue_note ? ` · ${node.revenue_note}` : ""}
          </p>
        )}

        {conc.length > 0 && (
          <section>
            <SectionHead>Customer concentration · SEC filing</SectionHead>
            <ul className="space-y-1">
              {conc.map((c, i) => (
                <li key={i} className="text-[12px] leading-relaxed text-ink-soft" title={c.quote}>
                  {c.pct != null ? `${c.customer ?? "One customer"}: ${c.pct}% of revenue` : c.customer ?? "No customer share disclosed"}
                  {c.fiscal_year ? <span className="text-muted"> · {c.fiscal_year}</span> : null}
                  {c.url && (
                    <a
                      href={c.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-1.5 inline-flex items-center gap-0.5 font-[520] text-accent-deep underline decoration-accent/30 underline-offset-2 hover:decoration-accent-deep"
                    >
                      {c.form ?? "filing"}
                      <ExternalIcon />
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {inbound.length > 0 && <Relations title="Depends on" rows={inbound} side="source" />}
        {outbound.length > 0 && <Relations title="Supplies" rows={outbound} side="target" />}
      </div>
    </section>
  );
}

function SectionHead({ children, count }: { children: React.ReactNode; count?: number }) {
  return (
    <p className="mb-1.5 flex items-center gap-1.5 px-0.5 text-[10px] font-[520] uppercase tracking-[0.12em] text-muted">
      {children}
      {count != null && (
        <span className="num rounded-full bg-track/80 px-1.5 text-[9.5px] tracking-[0.04em] text-muted-2">{count}</span>
      )}
    </p>
  );
}

function Field({ label, value, className = "text-ink" }: { label: string; value: string; className?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-[520] uppercase tracking-[0.12em] text-muted">{label}</dt>
      <dd className={`num mt-0.5 text-[13px] font-[520] leading-snug tracking-[-0.01em] ${className}`}>{value}</dd>
    </div>
  );
}

function Relations({ title, rows, side }: { title: string; rows: GraphEdge[]; side: "source" | "target" }) {
  return (
    <section>
      <SectionHead count={rows.length}>{title}</SectionHead>
      <ul className="space-y-1">
        {rows.map((e) => (
          <Relation key={`${e.source}-${e.target}-${e.component}`} e={e} side={side} />
        ))}
      </ul>
    </section>
  );
}

/** One link, collapsed to a line; expanded, the whole case for its number. */
function Relation({ e, side }: { e: GraphEdge; side: "source" | "target" }) {
  const [open, setOpen] = useState(false);
  const dep = Math.max(0, Math.min(1, e.dependency));
  return (
    <li
      className={`rounded-[14px] transition-colors ${
        open ? "bg-white/75 shadow-[0_0_0_1px_rgba(120,145,180,0.16)]" : ""
      }`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-[14px] px-2 py-1.5 text-left transition-colors hover:bg-white/70"
      >
        <span className="w-[4.75rem] shrink-0 truncate text-[12px] font-[520] tracking-[-0.01em] text-ink">
          {e[side].replace(/_/g, " ")}
        </span>
        <span className="min-w-0 flex-1 truncate text-[11.5px] text-muted">{e.component}</span>
        <span className="flex shrink-0 items-center gap-1.5">
          <span className="hidden h-[3px] w-8 overflow-hidden rounded-full bg-track sm:block" aria-hidden="true">
            <span className="block h-full rounded-full bg-accent-fill" style={{ width: `${dep * 100}%` }} />
          </span>
          <span className="num w-8 text-right text-[12px] font-[520] text-ink-soft">{(e.dependency * 100).toFixed(0)}%</span>
        </span>
        <span
          className={`shrink-0 rounded-full border bg-white/60 px-1.5 py-px text-[9px] font-[560] uppercase tracking-[0.06em] ${
            PROVENANCE_CLASS[e.provenance] ?? "text-muted border-term-edge"
          }`}
        >
          {e.provenance}
        </span>
        <svg
          viewBox="0 0 18 18"
          fill="none"
          aria-hidden="true"
          className={`h-3 w-3 shrink-0 text-muted transition-transform duration-300 ease-[cubic-bezier(.2,.75,.28,1)] motion-reduce:transition-none ${
            open ? "rotate-90" : ""
          }`}
        >
          <path d="m6.6 3.6 6 5.4-6 5.4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="space-y-2.5 px-2.5 pb-3 pt-1 text-[12px]">
          <p className="text-[11.5px] leading-relaxed text-muted">
            {e.component}
            {e.confidence && ` · ${e.confidence} confidence`}
            {e.as_of && ` · as of ${e.as_of}`}
          </p>
          {e.weight_note && (
            <div>
              <p className="mb-0.5 text-[10px] font-[520] uppercase tracking-[0.12em] text-accent-deep">The number</p>
              <p className="leading-relaxed text-ink-soft">{e.weight_note}</p>
            </div>
          )}
          {e.basis && <p className="leading-relaxed text-ink-soft">{e.basis}</p>}
          {e.notes && (
            <div className="rounded-[10px] bg-[rgba(168,101,18,0.06)] px-2.5 py-2 shadow-[inset_0_0_0_1px_rgba(168,101,18,0.14)]">
              <p className="mb-0.5 text-[10px] font-[520] uppercase tracking-[0.12em] text-amber">Caveats</p>
              <p className="leading-relaxed text-muted-2">{e.notes}</p>
            </div>
          )}
          <SourceList title="Sources" items={e.sources} />
          {e.counter_evidence.length > 0 && <SourceList title="Counter-evidence" items={e.counter_evidence} />}
        </div>
      )}
    </li>
  );
}

function SourceList({ title, items }: { title: string; items: Source[] }) {
  return (
    <div>
      <p className="mb-1 flex items-center gap-1.5 text-[10px] font-[520] uppercase tracking-[0.12em] text-muted">
        {title}
        <span className="num rounded-full bg-track/80 px-1.5 text-[9.5px] tracking-[0.04em] text-muted-2">{items.length}</span>
      </p>
      <ul className="space-y-2">
        {items.map((s, i) => (
          <li key={`${s.url}-${i}`}>
            <a
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-[520] text-accent-deep underline decoration-accent/30 underline-offset-2 hover:decoration-accent-deep"
            >
              {s.publisher || hostOf(s.url)}
              {s.date ? <span className="font-[450] text-muted">, {s.date}</span> : null}
              <ExternalIcon />
            </a>
            {s.quote && (
              <p className="mt-1 border-l-2 border-track pl-2 text-[11.5px] italic leading-relaxed text-muted">“{s.quote}”</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ExternalIcon() {
  return (
    <svg viewBox="0 0 12 12" className="h-2.5 w-2.5 shrink-0" fill="none" aria-hidden="true">
      <path d="M4 2.5h5.5V8M9.5 2.5 3 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}
