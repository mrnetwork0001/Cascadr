"use client";

import { useCascadrEngine } from "@/hooks/useCascadrEngine";
import { TopBar } from "@/components/terminal/TopBar";
import { StatusBar } from "@/components/terminal/StatusBar";
import { GraphPanel } from "@/components/graph/GraphPanel";
import { NewsOracle } from "@/components/panels/NewsOracle";
import { ExposureRanking } from "@/components/panels/ExposureRanking";
import { ExecutionLog } from "@/components/panels/ExecutionLog";
import { PositionsBlotter } from "@/components/panels/PositionsBlotter";

/**
 * Single-screen terminal: nothing scrolls except the panels themselves, so the
 * whole pipeline — wire feed, graph, exposure, orders — stays visible at once.
 */
export default function TerminalPage() {
  const e = useCascadrEngine();

  return (
    <main className="flex h-screen flex-col overflow-hidden bg-term-void">
      <TopBar phase={e.phase} prices={e.prices} onRun={e.run} onReset={e.reset} />

      <div className="flex min-h-0 flex-1 gap-px bg-term-line p-px">
        {/* Left rail: what the oracle saw, and who it hurts. */}
        <div className="flex w-[300px] shrink-0 flex-col gap-px">
          <div className="min-h-0 flex-[3]">
            <NewsOracle news={e.news} />
          </div>
          <div className="min-h-0 flex-[4]">
            <ExposureRanking
              exposure={e.exposure}
              contagion={e.contagion}
              selected={e.selected}
              onSelect={e.setSelected}
            />
          </div>
        </div>

        {/* Centre: the graph, with the resulting book underneath it. */}
        <div className="flex min-w-0 flex-1 flex-col gap-px">
          <GraphPanel
            contagion={e.contagion}
            exposure={e.exposure}
            activePath={e.activePath}
            prices={e.prices}
            selected={e.selected}
            onSelect={e.setSelected}
          />
          <div className="h-[186px] shrink-0">
            <PositionsBlotter
              positions={e.positions}
              pnl={e.pnl}
              realized={e.realized}
            />
          </div>
        </div>

        {/* Right rail: the agent thinking out loud. */}
        <div className="w-[420px] shrink-0 2xl:w-[480px]">
          <ExecutionLog logs={e.logs} />
        </div>
      </div>

      <StatusBar
        positions={e.positions.length}
        logs={e.logs.length}
        backend={e.backend}
      />
    </main>
  );
}
