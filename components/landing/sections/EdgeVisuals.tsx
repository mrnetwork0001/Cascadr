import { Slash } from "@/components/landing/sections/ui";
import type { GraphEdge } from "@/lib/types";

/**
 * The real TSMC -> NVIDIA link from the graph, drawn as two nodes on a chain:
 * the company the headlines named, and the customer they did not. The
 * dependency on the line is the graph's own figure, read from the API.
 */
export function DependencyChain({ edge }: { edge: GraphEdge }) {
  return (
    <div className="flex w-full items-start gap-3 sm:gap-4" role="img" aria-label={`${edge.source} supplies ${edge.target}: ${edge.dependency.toFixed(2)} dependency`}>
      <ChainNode id={edge.source} note="named in the headlines" filled />
      <div className="relative mt-[22px] flex min-w-0 flex-1 items-center">
        <span className="h-px flex-1 bg-[#A7B4C6]" />
        <svg width="8" height="10" viewBox="0 0 8 10" aria-hidden="true" className="-ml-px shrink-0">
          <path d="M0 0 8 5 0 10z" fill="#A7B4C6" />
        </svg>
        <span className="glass-pill num absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap px-3 py-1.5 text-[13px] font-[500] tracking-[-0.01em] text-ink">
          {edge.dependency.toFixed(2)}
          <span className="ml-1 hidden font-[400] text-muted sm:inline">dependency</span>
        </span>
      </div>
      <ChainNode id={edge.target} note="not named" />
    </div>
  );
}

function ChainNode({ id, note, filled = false }: { id: string; note: string; filled?: boolean }) {
  return (
    <div className="flex w-[5.5rem] shrink-0 flex-col items-center text-center sm:w-28">
      <span
        aria-hidden="true"
        className={`flex h-11 w-11 items-center justify-center rounded-full ${
          filled ? "bg-[#0d1b30]" : "border-[2px] border-[#0d1b30] bg-white/60"
        }`}
      >
        <span className={`h-2 w-2 rounded-full ${filled ? "bg-accent-fill" : "bg-signal-red"}`} />
      </span>
      <span className="mt-2.5 text-[15px] font-[520] tracking-[-0.01em] text-ink">{id}</span>
      <span className="mt-0.5 text-[12px] leading-4 text-muted">{note}</span>
    </div>
  );
}

/**
 * Two figures from the event study set against each other, template-style.
 * A grid keeps both figures on one baseline however their labels wrap.
 */
export function ResearchFigures({
  day0NegativePct,
  car5NegativePct,
}: {
  day0NegativePct: number;
  car5NegativePct: number;
}) {
  const value = "num row-start-1 self-end text-[44px] font-[200] leading-[0.95] tracking-[-0.03em] text-ink sm:text-[56px] xl:text-[64px]";
  const label = "row-start-2 mt-2.5 max-w-[13rem] text-[13.5px] leading-[1.35] text-muted-2";
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_18px_minmax(0,1fr)] gap-x-4 sm:gap-x-6">
      <p className={`col-start-1 ${value}`}>{day0NegativePct}%</p>
      <p className={`col-start-1 ${label}`}>fell on the day of the news</p>
      <Slash className="col-start-2 row-span-2 row-start-1" />
      <p className={`col-start-3 ${value}`}>{car5NegativePct}%</p>
      <p className={`col-start-3 ${label}`}>trailed the semiconductor index five trading days later</p>
    </div>
  );
}
