import { EDGES, NODES } from "@/lib/mock/graph";
import type { BackendHealth } from "@/lib/api";

interface Props {
  positions: number;
  logs: number;
  backend: BackendHealth | null;
}

/**
 * Bottom rail. Service states are read from the backend's /health rather than
 * hardcoded: if the Python service is down the terminal says so plainly
 * instead of implying a connection it does not have.
 */
export function StatusBar({ positions, logs, backend }: Props) {
  const online = backend !== null;

  return (
    <footer className="flex shrink-0 items-center gap-4 border-t border-term-line bg-term-panel px-3 py-1 text-2xs text-term-dim">
      <Service
        label="ENGINE"
        state={online ? "BACKEND" : "LOCAL"}
        tone={online ? "green" : "amber"}
      />
      <Service
        label="GRAPH"
        state={online ? backend.graph_backend.toUpperCase() : "SEED"}
        tone={online && backend.graph_backend === "neo4j" ? "green" : "amber"}
      />
      <Service
        label="BITGET"
        // Paper is the safe state, so it reads green; live trading is the
        // one that should catch your eye.
        state={!online ? "OFFLINE" : backend.paper_trading ? "PAPER" : "LIVE"}
        tone={!online ? "red" : backend.paper_trading ? "green" : "red"}
      />
      <span className="hidden md:inline">
        KG {NODES.length}n/{EDGES.length}e
      </span>
      <span className="hidden md:inline">POS {positions}</span>
      <span className="hidden md:inline">EVT {logs}</span>
      <span className="ml-auto tracking-widest">
        NETLAYER LABS · BITGET AI HACKATHON
      </span>
    </footer>
  );
}

const TONE = {
  green: { dot: "bg-signal-green", text: "text-signal-green" },
  amber: { dot: "bg-amber", text: "text-amber" },
  red: { dot: "bg-signal-red", text: "text-signal-red" },
} as const;

function Service({
  label,
  state,
  tone,
}: {
  label: string;
  state: string;
  tone: keyof typeof TONE;
}) {
  const c = TONE[tone];
  return (
    <span className="flex items-center gap-1">
      <span className={`h-[6px] w-[6px] rounded-full ${c.dot}`} />
      <span className="text-term-text">{label}</span>
      <span className={c.text}>{state}</span>
    </span>
  );
}
