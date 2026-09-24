"use client";

import { Panel } from "@/components/terminal/Panel";
import { NODE_BY_ID } from "@/lib/mock/graph";
import type { NewsItem } from "@/lib/types";

const SEVERITY_CLASS: Record<NewsItem["severity"], string> = {
  LOW: "text-term-dim border-term-edge",
  MEDIUM: "text-signal-cyan border-signal-cyan/50",
  HIGH: "text-amber border-amber/50",
  SEVERE: "text-signal-red border-signal-red/60",
};

/** Raw wire in, resolved graph entities out — the front of the pipeline. */
export function NewsOracle({ news }: { news: NewsItem[] }) {
  return (
    <Panel
      title="NLP News Oracle"
      meta={`${news.length} resolved`}
      flush
      className="h-full"
    >
      <div className="h-full overflow-y-auto">
        {news.length === 0 ? (
          <p className="py-6 text-center text-2xs uppercase tracking-widest text-term-dim">
            monitoring · no material events
          </p>
        ) : (
          <ul className="divide-y divide-term-line">
            {news.map((n) => (
              <li key={n.id} className="px-2 py-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="num text-2xs text-term-dim">{n.ts}</span>
                  <span className="text-2xs font-semibold uppercase tracking-wider text-signal-violet">
                    {n.source}
                  </span>
                  <span
                    className={`ml-auto border px-1 text-2xs font-semibold ${SEVERITY_CLASS[n.severity]}`}
                  >
                    {n.severity}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-[15px] text-term-bright">
                  {n.headline}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-1">
                  {n.entities.map((e) => (
                    <span
                      key={e}
                      className="border border-signal-cyan/40 px-1 text-2xs text-signal-cyan"
                      title={NODE_BY_ID.get(e)?.name}
                    >
                      {e.replace(/_/g, " ")}
                    </span>
                  ))}
                  <span className="num ml-auto text-2xs text-term-dim">
                    p={n.confidence.toFixed(2)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
}
