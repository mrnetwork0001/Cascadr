"use client";

import { useCascadr } from "@/hooks/useCascadr";
import { TopBar } from "@/components/terminal/TopBar";
import { StatusBar } from "@/components/terminal/StatusBar";
import { GraphPanel } from "@/components/graph/GraphPanel";
import { NewsOracle } from "@/components/panels/NewsOracle";
import { ExposureRanking } from "@/components/panels/ExposureRanking";
import { ExecutionLog } from "@/components/panels/ExecutionLog";
import { PositionsBlotter } from "@/components/panels/PositionsBlotter";

/**
 * A live view of the autonomous agent. Every panel reads the API: the news it
 * read, the contagion each decision implies, its paper book, and Bitget prices.
 *
 * Desktop (lg+) is one screen where only the panels scroll. Narrower screens
 * stack the panels into one scrolling column, graph first.
 */
export default function TerminalPage() {
  const c = useCascadr();

  return (
    <main className="flex min-h-screen flex-col bg-term-void lg:h-screen lg:overflow-hidden">
      <TopBar
        quotes={c.quotes.data ?? []}
        quotesError={c.quotes.error}
        health={c.health.data}
        healthError={c.health.error}
      />

      <div className="flex flex-col gap-px bg-term-line p-px lg:min-h-0 lg:flex-1 lg:flex-row">
        {/* Left rail: what the agent read, and what one decision implies. */}
        <div className="order-3 flex w-full flex-col gap-px lg:order-1 lg:w-[320px] lg:shrink-0">
          <div className="h-[380px] lg:h-auto lg:min-h-0 lg:flex-[5]">
            <NewsOracle
              decisions={c.decisions}
              selectedId={c.selected?.id ?? null}
              following={c.following}
              onSelect={c.select}
              loading={c.feedLoading}
              error={c.feed.error}
            />
          </div>
          <div className="h-[340px] lg:h-auto lg:min-h-0 lg:flex-[4]">
            <ExposureRanking
              decision={c.selected}
              loading={c.feedLoading}
              error={c.feed.error}
              onNode={c.setNode}
              node={c.node}
            />
          </div>
        </div>

        {/* Centre: the graph, with the paper book underneath it. */}
        <div className="order-1 flex w-full flex-col gap-px lg:order-2 lg:min-w-0 lg:flex-1">
          <GraphPanel
            graph={c.graph.data}
            graphError={c.graph.error}
            decision={c.selected}
            following={c.following}
            onFollow={() => c.select(null)}
            quotes={c.quotes.data ?? []}
            quotesError={c.quotes.error}
            node={c.node}
            onNode={c.setNode}
          />
          <div className="h-[280px] lg:h-[210px] lg:shrink-0">
            <PositionsBlotter book={c.positions.data} error={c.positions.error} />
          </div>
        </div>

        {/* Right rail: everything the agent actually did. */}
        <div className="order-2 h-[480px] w-full lg:order-3 lg:h-auto lg:w-[440px] lg:shrink-0 2xl:w-[500px]">
          <ExecutionLog items={c.feed.data ?? []} loading={c.feedLoading} error={c.feed.error} onSelect={c.select} />
        </div>
      </div>

      <StatusBar health={c.health.data} healthError={c.health.error} graph={c.graph.data} />
    </main>
  );
}
