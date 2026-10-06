"use client";

import { useCascadr } from "@/hooks/useCascadr";
import { TopBar } from "@/components/terminal/TopBar";
import { StatusBar } from "@/components/terminal/StatusBar";
import { GraphPanel } from "@/components/graph/GraphPanel";
import { NewsOracle } from "@/components/panels/NewsOracle";
import { ExposureRanking } from "@/components/panels/ExposureRanking";
import { ExecutionLog } from "@/components/panels/ExecutionLog";
import { PositionsBlotter } from "@/components/panels/PositionsBlotter";

/*
 * The studio light behind the glass: soft white and pale-blue pools on the
 * frame, so the frosted cards have something to blur. Pure decoration; it
 * carries no data.
 */
const STUDIO =
  "radial-gradient(60% 55% at 14% -8%, rgba(255,255,255,0.92), rgba(255,255,255,0) 70%)," +
  "radial-gradient(45% 50% at 96% 4%, rgba(205,220,240,0.85), rgba(205,220,240,0) 72%)," +
  "radial-gradient(55% 60% at 62% 108%, rgba(193,210,233,0.75), rgba(193,210,233,0) 70%)," +
  "radial-gradient(40% 45% at 4% 96%, rgba(255,255,255,0.7), rgba(255,255,255,0) 70%)," +
  "#E6EDF6";

/*
 * One column (rows sized as a single grid track) whose height follows its
 * content between a floor and a cap: a short list stops at its last row
 * instead of leaving a tall empty card, and a long one still scrolls inside
 * the panel. A grid track, unlike a percentage height, resolves against a
 * max-height, so the panel's own scroller keeps working.
 */
const FIT = "grid grid-rows-[minmax(0,1fr)]";

/**
 * A live view of the autonomous agent. Every panel reads the API: the news it
 * read, the contagion each decision implies, its paper book, and Bitget prices.
 *
 * - xl (1280+): one screen, three columns; only the panels scroll.
 * - lg (1024–1279): the three columns would squeeze the graph to a thumbnail,
 *   so the page scrolls in two: graph and book beside the agent log, then the
 *   news and the contagion on the same two columns underneath.
 * - Narrower: one scrolling column, graph first.
 */
export default function TerminalPage() {
  const c = useCascadr();

  return (
    <main className="relative isolate flex min-h-screen flex-col gap-2 p-2 sm:gap-2.5 sm:p-2.5 xl:h-screen xl:overflow-hidden">
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10" style={{ background: STUDIO }} />

      <TopBar
        quotes={c.quotes.data ?? []}
        quotesError={c.quotes.error}
        health={c.health.data}
        healthError={c.health.error}
      />

      <div className="flex flex-col gap-2 sm:gap-2.5 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] xl:flex xl:min-h-0 xl:flex-1 xl:flex-row">
        {/* Left rail: what the agent read, and what one decision implies.
            On lg it becomes the second row, on the same two columns as the first.
            Rails give up a little width below 1440px so the graph keeps room. */}
        <div className="order-3 flex w-full flex-col gap-2 sm:gap-2.5 lg:col-span-2 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] xl:order-1 xl:flex xl:w-[300px] xl:shrink-0 min-[1440px]:w-[320px]">
          <div className="h-[380px] lg:h-[400px] lg:min-w-0 xl:h-auto xl:min-h-0 xl:flex-[5]">
            <NewsOracle
              decisions={c.decisions}
              selectedId={c.selected?.id ?? null}
              following={c.following}
              onSelect={c.select}
              loading={c.feedLoading}
              error={c.feed.error}
            />
          </div>
          <div className={`${FIT} max-h-[340px] min-h-[140px] lg:h-[400px] lg:max-h-none lg:min-h-0 lg:min-w-0 xl:h-auto xl:flex-[4]`}>
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
        <div className="order-1 flex w-full flex-col gap-2 sm:gap-2.5 lg:min-w-0 xl:order-2 xl:flex-1">
          {/* The graph fills this box; the box sets its height until the
              three-column screen gives it the column's remaining height. */}
          <div className="flex h-[440px] flex-col sm:h-[520px] xl:h-auto xl:min-h-0 xl:flex-1">
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
          </div>
          <div className={`${FIT} max-h-[280px] min-h-[150px] lg:h-[210px] lg:max-h-none lg:min-h-0 lg:shrink-0`}>
            <PositionsBlotter book={c.positions.data} error={c.positions.error} />
          </div>
        </div>

        {/* Right rail: everything the agent actually did. On lg it matches
            the centre column's height (size containment keeps its long list
            from stretching the row) and scrolls inside. */}
        <div className="order-2 h-[480px] w-full lg:h-auto lg:min-h-0 lg:[contain:size] xl:order-3 xl:w-[408px] xl:shrink-0 xl:[contain:none] min-[1440px]:w-[440px] 2xl:w-[500px]">
          <ExecutionLog items={c.feed.data ?? []} loading={c.feedLoading} error={c.feed.error} onSelect={c.select} />
        </div>
      </div>

      <StatusBar health={c.health.data} healthError={c.health.error} graph={c.graph.data} />
    </main>
  );
}
