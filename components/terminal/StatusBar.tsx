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
      <footer className="flex shrink-0 items-center gap-4 border-t border-term-line bg-term-panel px-3 py-1 text-2xs">
        {healthError ? (
          <Service label="API" state="UNREACHABLE" tone="red" />
        ) : (
          <Service label="API" state="CONNECTING" tone="amber" />
        )}
      </footer>
    );
  }
  if (healthError) {
    // Showing the last good snapshot as current would assert what the API no
    // longer reports.
    return (
      <footer className="flex shrink-0 items-center gap-4 border-t border-term-line bg-term-panel px-3 py-1 text-2xs">
        <Service label="API" state="UNREACHABLE" tone="red" />
        <span className="text-term-dim">last good read shown elsewhere may be stale</span>
      </footer>
    );
  }
  const feedBad = health.feeds.last_poll_errors > 0 && health.feeds.last_poll_errors === health.feeds.last_poll_queries;
  // The feed is only "OK" once a poll has actually succeeded.
  const feedIdle = health.feeds.last_ok == null;
  return (
    <footer className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-t border-term-line bg-term-panel px-3 py-1 text-2xs text-term-dim">
      <Service label="API" state={health.status.toUpperCase()} tone={health.status === "ok" ? "green" : "amber"} />
      <Service
        label="AGENT"
        state={health.autonomous.armed ? `ARMED · ${health.autonomous.cycles} cycles` : "OFF"}
        tone={health.autonomous.armed ? "green" : "amber"}
      />
      <Service label="LLM" state={health.llm.configured ? (health.llm.model ?? "?") : "NOT SET"} tone={health.llm.configured ? "green" : "red"} />
      <Service
        label="NEWS"
        state={
          feedBad
            ? "FEED DOWN"
            : health.feeds.last_poll_errors
              ? `${health.feeds.last_poll_errors} errors`
              : feedIdle
                ? "NOT POLLED"
                : "OK"
        }
        tone={feedBad ? "red" : health.feeds.last_poll_errors || feedIdle ? "amber" : "green"}
      />
      <Service label="BITGET" state={health.paper_trading ? "PAPER" : "LIVE"} tone={health.paper_trading ? "green" : "red"} />
      {graph && (
        <span className="hidden md:inline">
          KG {graph.stats.nodes}n/{graph.stats.edges}e
        </span>
      )}
      <span className="ml-auto hidden tracking-widest sm:inline">NETLAYER LABS · BITGET AI HACKATHON</span>
    </footer>
  );
}

const TONE = {
  green: { dot: "bg-signal-green", text: "text-signal-green" },
  amber: { dot: "bg-amber", text: "text-amber" },
  red: { dot: "bg-signal-red", text: "text-signal-red" },
} as const;

function Service({ label, state, tone }: { label: string; state: string; tone: keyof typeof TONE }) {
  const c = TONE[tone];
  return (
    <span className="flex items-center gap-1">
      <span className={`h-[6px] w-[6px] rounded-full ${c.dot}`} />
      <span className="text-term-text">{label}</span>
      <span className={c.text}>{state}</span>
    </span>
  );
}
