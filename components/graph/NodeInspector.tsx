"use client";

import { EDGES, NODE_BY_ID } from "@/lib/mock/graph";
import { CONTAGION_CLASS } from "@/lib/theme";
import { usd } from "@/lib/format";
import type { Contagion } from "@/lib/types";

interface Props {
  nodeId: string;
  contagion: Contagion;
  exposure: number;
  price?: number;
  onClose: () => void;
}

/** Floating detail card for the selected graph node — the "click to inspect". */
export function NodeInspector({
  nodeId,
  contagion,
  exposure,
  price,
  onClose,
}: Props) {
  const node = NODE_BY_ID.get(nodeId);
  if (!node) return null;

  const inbound = EDGES.filter((e) => e.target === nodeId);
  const outbound = EDGES.filter((e) => e.source === nodeId);

  return (
    <div className="pointer-events-auto absolute bottom-2 left-2 w-[calc(100%-1rem)] max-w-[300px] border border-term-edge bg-term-panel/95 backdrop-blur-sm">
      <header className="flex items-center gap-2 border-b border-term-line bg-term-raised px-2 py-1">
        <span className="text-xs font-semibold text-term-bright">{node.name}</span>
        {node.ticker && (
          <span className="border border-amber/50 px-1 text-2xs text-amber">
            {node.ticker}
          </span>
        )}
        <button
          type="button"
          onClick={onClose}
          className="ml-auto px-1 text-2xs text-term-dim hover:text-signal-red"
          aria-label="Close inspector"
        >
          ✕
        </button>
      </header>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 px-2 py-1.5">
        <Field label="Tier" value={node.tier} />
        <Field label="Domicile" value={node.country} />
        <Field label="Revenue" value={`$${node.revenueB.toFixed(1)}B`} />
        <Field label="Mark" value={price ? usd(price) : "—"} />
        <Field
          label="Exposure"
          value={exposure ? `${(exposure * 100).toFixed(0)}%` : "0%"}
          className={CONTAGION_CLASS[contagion]}
        />
        <Field
          label="Status"
          value={contagion}
          className={CONTAGION_CLASS[contagion]}
        />
      </dl>

      <div className="max-h-[132px] overflow-y-auto border-t border-term-line px-2 py-1.5">
        {inbound.length > 0 && (
          <Relations title="Depends on" rows={inbound} side="source" />
        )}
        {outbound.length > 0 && (
          <Relations title="Supplies" rows={outbound} side="target" />
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  className = "text-term-text",
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="col-head">{label}</dt>
      <dd className={`num text-2xs font-semibold ${className}`}>{value}</dd>
    </div>
  );
}

function Relations({
  title,
  rows,
  side,
}: {
  title: string;
  rows: typeof EDGES;
  side: "source" | "target";
}) {
  return (
    <div className="mb-1.5 last:mb-0">
      <p className="col-head mb-0.5">{title}</p>
      <ul className="space-y-0.5">
        {rows.map((e) => (
          <li key={`${e.source}-${e.target}-${e.component}`} className="flex gap-1.5">
            <span className="w-16 shrink-0 truncate text-2xs text-signal-cyan">
              {e[side].replace(/_/g, " ")}
            </span>
            <span className="flex-1 truncate text-2xs text-term-dim">
              {e.component}
            </span>
            <span className="num text-2xs text-term-text">
              {(e.dependency * 100).toFixed(0)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
