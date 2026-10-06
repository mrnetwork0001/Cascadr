import type { ReactNode } from "react";
import type { Graph, Health } from "@/lib/types";

/**
 * Bottom rail: the real state of every moving part, read from /health.
 * Nothing is asserted that the API did not report.
 */
export function StatusBar({
  health,
  healthError,
  graph,
}: {
  health: Health | null;
  healthError: string | null;
  graph: Graph | null;
}) {
  if (!health) {
    return (
      <Rail>
        {healthError ? (
          <Service label="API" state="UNREACHABLE" tone="red" />
        ) : (
          <Service label="API" state="CONNECTING" tone="amber" />
        )}
      </Rail>
    );
  }
  if (healthError) {
    // Showing the last good snapshot as current would assert what the API no
    // longer reports.
    return (
      <Rail>
        <Service label="API" state="UNREACHABLE" tone="red" />
        <span className="text-[11.5px] font-[450] text-muted">last good read shown elsewhere may be stale</span>
      </Rail>
    );
  }
  const feedBad = health.feeds.last_poll_errors > 0 && health.feeds.last_poll_errors === health.feeds.last_poll_queries;
  // The feed is only "OK" once a poll has actually succeeded.
  const feedIdle = health.feeds.last_ok == null;
  const cycles = health.autonomous.cycles;
  return (
    <Rail>
      <Service label="API" state={health.status.toUpperCase()} tone={health.status === "ok" ? "ok" : "amber"} />
      <Service
        label="Agent"
        state={health.autonomous.armed ? `ARMED · ${cycles} ${cycles === 1 ? "cycle" : "cycles"}` : "OFF"}
        tone={health.autonomous.armed ? "ok" : "amber"}
      />
      <Service label="LLM" state={health.llm.configured ? (health.llm.model ?? "?") : "NOT SET"} tone={health.llm.configured ? "ok" : "red"} />
      <Service
        label="News"
        state={
          feedBad
            ? "FEED DOWN"
            : health.feeds.last_poll_errors
              ? `${health.feeds.last_poll_errors} errors`
              : feedIdle
                ? "NOT POLLED"
                : "OK"
        }
        tone={feedBad ? "red" : health.feeds.last_poll_errors || feedIdle ? "amber" : "ok"}
      />
      {/* Paper trading is the safe state; live orders are real-money risk. */}
      <Service label="Bitget" state={health.paper_trading ? "PAPER" : "LIVE"} tone={health.paper_trading ? "ok" : "red"} />

      <span className="ml-auto hidden items-center gap-3 lg:flex">
        {graph && (
          <span className="num whitespace-nowrap text-[11.5px] font-[450] text-muted" title="Supply-chain knowledge graph served by the API">
            <span className="mr-1.5 text-[10px] font-[560] uppercase tracking-[0.12em]">Graph</span>
            {graph.stats.nodes} nodes · {graph.stats.edges} edges
          </span>
        )}
        <span aria-hidden="true" className="hidden h-[14px] w-px bg-[#CED5E0] xl:block" />
        <span className="hidden whitespace-nowrap text-[10px] font-[520] uppercase tracking-[0.12em] text-muted xl:inline">
          Netlayer Labs · Bitget AI Hackathon
        </span>
      </span>
    </Rail>
  );
}

/** The slim glass pill every state sits in. */
function Rail({ children }: { children: ReactNode }) {
  return (
    <footer className="shrink-0">
      <div className="glass-strong flex min-h-[32px] flex-wrap items-center gap-x-4 gap-y-1.5 rounded-[18px] px-4 py-[7px] sm:rounded-full sm:gap-x-5">
        {children}
      </div>
    </footer>
  );
}

/*
 * Healthy reads in the interface's accent; amber is caution; red is reserved
 * for a failure that puts what the desk shows (or real money) at risk.
 */
const TONE = {
  ok: { dot: "bg-accent", ring: "shadow-[0_0_0_3px_rgba(74,120,176,0.16)]", text: "text-ink-soft" },
  amber: { dot: "bg-amber", ring: "shadow-[0_0_0_3px_rgba(168,101,18,0.16)]", text: "text-amber" },
  red: { dot: "bg-signal-red", ring: "shadow-[0_0_0_3px_rgba(200,50,63,0.16)]", text: "text-signal-red" },
} as const;

function Service({ label, state, tone }: { label: string; state: string; tone: keyof typeof TONE }) {
  const c = TONE[tone];
  return (
    <span className="flex items-center gap-1.5 whitespace-nowrap">
      <span aria-hidden="true" className={`h-[6px] w-[6px] rounded-full ${c.dot} ${c.ring}`} />
      <span className="text-[10px] font-[560] uppercase tracking-[0.12em] text-muted">{label}</span>
      <span className={`text-[11.5px] font-[520] tracking-[0.01em] ${c.text}`}>{state}</span>
    </span>
  );
}
