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
 * Desktop (lg+): a single screen where nothing scrolls except the panels, so
 * the whole pipeline - wire feed, graph, exposure, orders - is visible at once.
 *
 * Narrower screens cannot fit three columns, and squeezing them hid the graph
 * entirely (it measured 2px wide on a phone). There the panels stack into one
 * scrolling column, graph first because it is the thing people come to see.
 */
export default function TerminalPage() {
  const e = useCascadrEngine();

  return (
    <main className="flex min-h-screen flex-col bg-term-void lg:h-screen lg:overflow-hidden">
      <TopBar phase={e.phase} prices={e.prices} onRun={e.run} onReset={e.reset} />

      <div className="flex flex-col gap-px bg-term-line p-px lg:min-h-0 lg:flex-1 lg:flex-row">
        {/* Left rail: what the oracle saw, and who it hurts. */}
        <div className="order-3 flex w-full flex-col gap-px lg:order-1 lg:w-[300px] lg:shrink-0">
          <div className="h-[320px] lg:h-auto lg:min-h-0 lg:flex-[3]">
            <NewsOracle news={e.news} />
          </div>
          <div className="h-[380px] lg:h-auto lg:min-h-0 lg:flex-[4]">
            <ExposureRanking
              exposure={e.exposure}
              contagion={e.contagion}
              selected={e.selected}
              onSelect={e.setSelected}
            />
          </div>
        </div>

        {/* Centre: the graph, with the resulting book underneath it. */}
        <div className="order-1 flex w-full flex-col gap-px lg:order-2 lg:min-w-0 lg:flex-1">
          <GraphPanel
            contagion={e.contagion}
            exposure={e.exposure}
            activePath={e.activePath}
            prices={e.prices}
            selected={e.selected}
            onSelect={e.setSelected}
          />
          <div className="h-[280px] lg:h-[186px] lg:shrink-0">
            <PositionsBlotter
              positions={e.positions}
              pnl={e.pnl}
              realized={e.realized}
            />
          </div>
        </div>

        {/* Right rail: the agent thinking out loud. */}
        <div className="order-2 h-[480px] w-full lg:order-3 lg:h-auto lg:w-[420px] lg:shrink-0 2xl:w-[480px]">
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
