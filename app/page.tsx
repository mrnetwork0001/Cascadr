import { Card, CONTAINER, Section } from "@/components/landing/Section";
import { LaunchButton } from "@/components/landing/LaunchButton";
import { Hero } from "@/components/landing/Hero";
import { CascadrMark } from "@/components/brand/Logo";
import { DependencyChain, ResearchFigures } from "@/components/landing/sections/EdgeVisuals";
import { RealDecision } from "@/components/landing/sections/RealDecision";
import { SiteFooter, type FooterColumn } from "@/components/landing/sections/SiteFooter";
import { Stage } from "@/components/landing/sections/Stage";
import { TourCard, type TourIcon } from "@/components/landing/sections/TourCard";
import { Chip, Label, Slash, toneOf, type Tone } from "@/components/landing/sections/ui";
import { serverGet } from "@/lib/api";
import { ago, signedPct } from "@/lib/format";
import { PROVENANCE_CLASS } from "@/lib/theme";
import type { Decision, Graph, Overview } from "@/lib/types";

/**
 * Every number on this page is read from the running system on each request.
 * Nothing is written into the page at build time; if the API is unreachable,
 * the page says so instead of showing stand-in figures.
 */
export const dynamic = "force-dynamic";

/**
 * Results of the event study in backend/research/ (see its README for the
 * method, the events and every caveat). Updated by hand when the study is
 * re-run - the study itself runs offline on historical prices.
 */
const RESEARCH = {
  pairs: 7,
  events: 3,
  // Pairs that come from the single largest event (the Hualien earthquake).
  pairsFromOneEvent: 5,
  day0NegativePct: 43,
  car5VsSector: -3.29,
  car5NegativePct: 100,
  overnightShareOfDay0Pct: 42,
};

/** Every link resolves to a real section or a real external page. */
const FOOTER_COLUMNS: FooterColumn[] = [
  {
    title: "Product",
    links: [
      { label: "Launch terminal", href: "/terminal" },
      { label: "How it works", href: "#how" },
      { label: "A real decision", href: "#cascade" },
      { label: "The terminal", href: "#terminal" },
    ],
  },
  {
    title: "Engine",
    links: [
      { label: "The edge", href: "#edge" },
      { label: "Knowledge graph", href: "#how" },
      { label: "Contagion model", href: "#cascade" },
      { label: "Architecture", href: "#architecture" },
    ],
  },
  {
    title: "Project",
    links: [
      { label: "Bitget AI Hackathon", href: "https://bitget-ai.gitbook.io/bitgetai_hackathons2", external: true },
      { label: "0G Private Computer", href: "https://pc.0g.ai/", external: true },
      { label: "Bitget stock perps", href: "https://www.bitget.com/academy/how-to-trade-stocks-on-bitget", external: true },
      { label: "Build status", href: "#architecture" },
    ],
  },
];

/** What each status means, as a pill colour. Red/green only for up/down. */
const STATUS_TONE: Record<string, Tone> = {
  PAUSED: "amber",
  UNKNOWN: "dim",
  DOWN: "red",
  LIVE: "green",
  PAPER: "amber",
  BUILT: "blue",
  PLANNED: "dim",
};

export default async function LandingPage() {
  const [overview, graph, latest] = await Promise.all([
    serverGet<Overview>("/overview"),
    serverGet<Graph>("/graph"),
    serverGet<{ latest: Decision | null; latest_with_exposure: Decision | null }>("/agent/latest"),
  ]);
  // Only a decision that actually implies downstream exposure is featured;
  // with none, the page says so rather than showing a lesser stand-in.
  const featured = latest?.latest_with_exposure ?? null;
  const armed = overview?.agent.armed ?? false;
  const onDemo = overview?.paper_venue === "bitget-demo";
  // Statuses are only asserted when /overview answered.
  const agentStatus = !overview ? "UNKNOWN" : armed ? "LIVE" : "PAUSED";
  const marketStatus = !overview ? "UNKNOWN" : overview.market_error ? "DOWN" : "LIVE";
  const tsmcNvda = graph?.edges.find((e) => e.source === "TSMC" && e.target === "NVDA") ?? null;
  const decisions = overview?.agent.decisions ?? {};
  // The graph canvases only draw the graph; the evidence behind each edge
  // stays on the server rather than riding along in the page payload.
  const drawable: Graph | null = graph && {
    ...graph,
    edges: graph.edges.map((e) => ({ ...e, basis: "", notes: "", sources: [], counter_evidence: [] })),
  };

  const architecture: [string, string, string][] = [
    ["News sensing", "Google News RSS, per company, every few minutes", agentStatus],
    ["News oracle", `${overview?.agent.llm_model ?? "LLM"} via 0G Private Computer`, agentStatus],
    ["Knowledge graph", `${overview?.graph.nodes ?? "-"} companies, ${overview?.graph.edges ?? "-"} links, each with cited sources`, graph ? "LIVE" : "UNKNOWN"],
    ["Contagion engine", "Python, server-side, 3-hop traversal", overview ? "LIVE" : "UNKNOWN"],
    ["Market data", "Bitget public API - live quotes and mark prices", marketStatus],
    ["Portfolio risk & exits", "cluster and symbol caps, drawdown halt, stop / take-profit / time", overview ? "LIVE" : "UNKNOWN"],
    [
      "Order execution",
      overview?.paper_trading === false
        ? "orders sent to Bitget"
        : overview?.paper_venue === "bitget-demo"
          ? "paper orders on Bitget's demo exchange, filled and recorded by Bitget"
          : "paper book, fills simulated at live prices",
      !overview ? "UNKNOWN" : overview.paper_trading ? "PAPER" : "LIVE",
    ],
    ["Filing facts", "customer concentration read by hand from each company's latest SEC annual report", graph ? "LIVE" : "UNKNOWN"],
    ["Graph database", "Neo4j repository written; the graph is served from memory", "PLANNED"],
  ];

  const tour: [TourIcon, string, string][] = [
    ["news", "Live news", "Real headlines the agent read, with the LLM's verdict and a link to each article."],
    ["graph", "Knowledge graph", "The source-cited graph, coloured by the selected decision's contagion. Click a company for its sources."],
    ["log", "Agent log", "Every decision with its reasoning, uncertainty and 0G provider, plus every paper position event."],
    [
      "positions",
      "Paper positions",
      onDemo
        ? "Positions on Bitget's demo exchange at Bitget's mark price, with P&L net of Bitget's fees, return on margin and pending exits."
        : "The paper book marked to Bitget's live mark price, with P&L, return on margin and pending exits.",
    ],
  ];

  return (
    <div className="min-h-screen bg-frame">
      <Hero overview={overview} featured={featured} drawable={drawable} onDemo={onDemo} />

      <div className="relative isolate overflow-x-clip">
        <LightFields />

        {/* ------------------------------------------------------------ the edge */}
        <Section
          id="edge"
          index="01"
          eyebrow="The edge"
          title="Everyone trades the first order. The second order is buried in supply chains."
          lede="A headline names the company that was hit. It rarely names that company's customers. Working out who depends on whom - and how much - takes a map of the supply chain, and that dependency is what Cascadr trades."
        >
          {/* Side by side only once each card is wide enough for its diagram. */}
          <div className="grid gap-5 lg:grid-cols-2">
            <Card label="A real example" accent="red" className="flex flex-col">
              {tsmcNvda && (
                <div className="mb-7 flex flex-1 items-center rounded-[20px] border border-white/70 bg-white/40 px-4 py-5 sm:px-6">
                  <DependencyChain edge={tsmcNvda} />
                </div>
              )}
              <p className="max-w-[46rem] text-[15px] leading-[1.65] text-term-text">
                On 3 April 2024 the M7.4 Hualien earthquake led TSMC to evacuate fabs. The headlines
                named TSMC. They did not name NVIDIA -{" "}
                {tsmcNvda ? (
                  <>
                    yet the graph gives NVIDIA a{" "}
                    <span className="font-[520] text-accent-deep">{tsmcNvda.dependency.toFixed(2)} dependency on TSMC</span> for its{" "}
                    {tsmcNvda.component}{" "}
                    <Chip tone={toneOf(PROVENANCE_CLASS[tsmcNvda.provenance])} className="align-[2px]">
                      {tsmcNvda.provenance}
                    </Chip>
                    {tsmcNvda.sources[0] && (
                      <>
                        {" "}
                        <a
                          href={tsmcNvda.sources[0].url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-[500] text-accent-deep underline decoration-accent/40 underline-offset-4 transition-colors hover:decoration-accent-deep"
                        >
                          source <span aria-hidden="true">↗</span>
                        </a>
                      </>
                    )}
                    .
                  </>
                ) : (
                  "and the graph records how much NVIDIA depends on TSMC, with a cited source."
                )}
              </p>
            </Card>

            <Card label="What the research found" accent="cyan" className="flex flex-col">
              <ResearchFigures day0NegativePct={RESEARCH.day0NegativePct} car5NegativePct={RESEARCH.car5NegativePct} />
              <p className="mt-7 max-w-[46rem] text-[15px] leading-[1.65] text-term-text">
                Across {RESEARCH.events} verified historical disruptions ({RESEARCH.pairs} company pairs),
                downstream names fell on the day of the news in only {RESEARCH.day0NegativePct}% of cases.
                The drift arrived over the next five trading days: {signedPct(RESEARCH.car5VsSector)} against
                the semiconductor index, negative in {RESEARCH.car5NegativePct}% of cases. On average{" "}
                {RESEARCH.overnightShareOfDay0Pct}% of the day-one move happened overnight, when only 24/7
                markets like Bitget&apos;s perps trade.
              </p>
              <p className="mt-6 flex items-start gap-2.5 rounded-[16px] border border-amber/25 bg-amber/[0.06] px-4 py-3 text-[13.5px] font-[500] leading-[1.45] text-[#8A520E]">
                <span aria-hidden="true" className="mt-[6px] h-[6px] w-[6px] shrink-0 rounded-full bg-amber" />
                <span>
                  Promising, not proven: {RESEARCH.pairsFromOneEvent} of the {RESEARCH.pairs} pairs come from one
                  earthquake
                </span>
              </p>
            </Card>
          </div>
        </Section>

        {/* -------------------------------------------------------- how it works */}
        <Section
          id="how"
          index="02"
          eyebrow="How it works"
          title="One autonomous loop, four stages."
          lede={`When armed, the loop runs on its own every few minutes whether or not anyone is watching, and a separate background task marks the paper book to live prices every minute and closes positions when their exit rules fire. ${
            overview
              ? armed
                ? `It is armed now${overview.agent.last_cycle ? `; last read ${ago(overview.agent.last_cycle)}` : ""}.`
                : "It is switched off right now."
              : "Its current state could not be read."
          }`}
        >
          <div className="grid gap-5 md:grid-cols-2">
            <Stage
              n="01"
              name="Sense"
              stack="Google News RSS"
              body={`Every ${overview ? Math.round(overview.agent.poll_seconds / 60) : "few"} minutes the agent pulls fresh headlines for each company in the graph. Already-seen and stale stories are skipped, and a free keyword filter drops stories that name no graph company before any model is called.`}
              code="per-company queries → dedupe → freshness ≤ 6h → keyword filter"
            />
            <Stage
              n="02"
              name="Reason"
              stack={overview?.agent.llm_model ? `${overview.agent.llm_model} · 0G` : "LLM · 0G"}
              body="The LLM reads the headline, names the directly disrupted company (checked against the graph, never trusted), scores the shock from 0 to 1, and states its reasoning and what would change its mind. Each call records which 0G provider ran it."
              code={`shock < ${overview?.agent.shock_floor ?? "floor"} → declined: contagion recorded, nothing traded`}
            />
            <Stage
              n="03"
              name="Propagate"
              stack="source-cited graph"
              body="A breadth-first walk of the supply chain, up to three hops. Each hop multiplies by that link's dependency - a figure taken from a filing, an analyst report, or a sourced statement mapped by a published rule - and decays, so direct customers are hit hardest."
              code={`score = shock × ∏ dependency × ${overview?.graph.hop_decay ?? "decay"}^hops`}
            />
            <Stage
              n="04"
              name="Act"
              stack="paper book · Bitget prices"
              body={
                onDemo
                  ? "Downstream exposures above the trade threshold, and the hit company itself when its shock clears the floor, become short orders on Bitget's demo exchange, which fills them and keeps the record. Positions are sized to the paper account, capped per root cause, per headline, per symbol and by a drawdown halt, marked at Bitget's demo price, and closed by stop-loss, take-profit or time stop."
                  : "Downstream exposures above the trade threshold, and the hit company itself when its shock clears the floor, become short positions on the paper book, marked to Bitget's live mark price, capped per root cause, per headline, per symbol and by a drawdown halt, and closed by stop-loss, take-profit or time stop."
              }
              code={`score ≥ ${overview?.agent.trade_threshold ?? "threshold"} (hit company: shock ≥ ${overview?.agent.shock_floor ?? "floor"}) → size → risk → ${onDemo ? "Bitget demo order" : "paper fill"}`}
            />
          </div>
        </Section>

        {/* ------------------------------------------------------ real decision */}
        <Section
          id="cascade"
          index="03"
          eyebrow="A real decision"
          title="One headline, traced end to end."
          lede={
            featured && (featured.action === "DECLINED" || featured.action === "ANALYSED")
              ? "Pulled live from the agent's log: the most recent headline whose verdict implies downstream exposure. It traded nothing, so its exposure is stated on the current graph; decisions that trade keep the factors they were decided on. The arithmetic below is rebuilt from the stored factors."
              : "Pulled live from the agent's log: the most recent headline whose verdict implies downstream exposure. The arithmetic below is rebuilt from the factors recorded with that decision, exactly as the agent computed it."
          }
        >
          {featured ? (
            <RealDecision d={featured} graph={drawable} />
          ) : (
            <Card label="Unavailable" accent="dim">
              <p className="text-[15px] text-muted">
                {latest
                  ? "No recorded decision has implied downstream exposure yet."
                  : "The agent's log could not be reached."}
              </p>
            </Card>
          )}
        </Section>

        {/* ------------------------------------------------------- the terminal */}
        <Section
          id="terminal"
          index="04"
          eyebrow="The terminal"
          title="A live view of the agent, nothing replayed."
          lede="Every panel reads the running system: the headlines the agent read and what it decided, the contagion each decision implies, its paper positions, and Bitget prices."
        >
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {tour.map(([icon, h, b]) => (
              <TourCard key={h} icon={icon} title={h} body={b} />
            ))}
          </div>

          <div className="glass mt-5 flex flex-col gap-8 rounded-[24px] p-6 md:rounded-[28px] md:p-8 lg:flex-row lg:items-center lg:justify-between">
            {overview ? (
              <div>
                <Label>So far</Label>
                <p className="sr-only">
                  {`${decisions.total ?? 0} decisions - ${decisions.DECLINED ?? 0} declined, ${decisions.TRADED ?? 0} traded.`}
                </p>
                {/* Phones: the total on its own row, then declined | traded. */}
                <div aria-hidden="true" className="mt-4 grid grid-cols-2 gap-x-5 gap-y-6 sm:flex sm:items-stretch sm:gap-x-7">
                  <Count value={decisions.total ?? 0} label="decisions" className="col-span-2" />
                  <Slash className="hidden min-h-[56px] sm:block" />
                  <Count value={decisions.DECLINED ?? 0} label="declined" />
                  <Slash className="hidden min-h-[56px] sm:block" />
                  <Count value={decisions.TRADED ?? 0} label="traded" />
                </div>
              </div>
            ) : (
              <p className="text-[15px] text-muted">Live counts unavailable.</p>
            )}
            <LaunchButton className="self-start lg:self-auto" />
          </div>
        </Section>

        {/* ------------------------------------------------------- architecture */}
        <Section
          id="architecture"
          index="05"
          eyebrow="Architecture"
          title="What runs in production, and what does not."
          lede="Everything below is deployed. The statuses that can change (the agent's news reading, the oracle, market data) are read from the running system."
        >
          <div className="glass overflow-hidden rounded-[24px] md:rounded-[28px]">
            <table className="block w-full border-collapse sm:table">
              <thead className="hidden sm:table-header-group">
                <tr className="border-b border-[rgba(120,145,180,0.22)]">
                  <th scope="col" className="px-8 pb-4 pt-7 text-left text-[11px] font-[520] uppercase tracking-[0.12em] text-muted">Layer</th>
                  <th scope="col" className="px-4 pb-4 pt-7 text-left text-[11px] font-[520] uppercase tracking-[0.12em] text-muted">Technology</th>
                  <th scope="col" className="px-8 pb-4 pt-7 text-right text-[11px] font-[520] uppercase tracking-[0.12em] text-muted">Status</th>
                </tr>
              </thead>
              <tbody className="block sm:table-row-group">
                {architecture.map(([layer, tech, status]) => (
                  <tr
                    key={layer}
                    className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1.5 border-b border-[rgba(120,145,180,0.14)] px-6 py-5 last:border-b-0 sm:table-row sm:px-0 sm:py-0"
                  >
                    <th
                      scope="row"
                      className="col-start-1 row-start-1 text-left text-[15.5px] font-[470] tracking-[-0.015em] text-ink sm:py-[18px] sm:pl-8 sm:pr-4 sm:align-middle"
                    >
                      {layer}
                    </th>
                    <td className="col-span-2 row-start-2 text-[14px] leading-[1.5] text-muted-2 sm:px-4 sm:py-[18px] sm:align-middle">{tech}</td>
                    <td className="col-start-2 row-start-1 text-right sm:py-[18px] sm:pl-4 sm:pr-8 sm:align-middle">
                      <Chip tone={STATUS_TONE[status] ?? "dim"}>{status}</Chip>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-5 grid gap-5 md:grid-cols-2">
            <Card label="Evidence behind every number" accent="green">
              <p className="max-w-[46rem] text-[15px] leading-[1.65] text-term-text">
                Each graph link carries its evidence class - disclosed in a filing, reported by an
                analyst or outlet, or a sourced qualitative statement mapped by a published rule - and
                links to its sources. Links nobody could source were removed. Company sizes are latest
                annual revenue from financial statements. Prices are Bitget&apos;s.
              </p>
              {graph && (
                <p className="mt-6 flex flex-wrap gap-2">
                  {Object.entries(graph.stats.edges_by_provenance).map(([k, v]) => (
                    <Chip key={k} tone={toneOf(PROVENANCE_CLASS[k])}>
                      <span className="num">{v}</span> {k}
                    </Chip>
                  ))}
                </p>
              )}
            </Card>
            <Card label="Honest disclosure" accent="amber">
              <p className="max-w-[46rem] text-[15px] leading-[1.65] text-term-text">
                {!overview
                  ? "Trading mode could not be read from the API right now. "
                  : overview.paper_trading
                    ? overview.paper_venue === "bitget-demo"
                      ? "Paper trading only: orders go to Bitget's demo exchange, which fills and records them with no real funds. Bitget's demo lists only some of the graph's stocks, so exposures to the rest are recorded but not traded. "
                      : `Paper trading only: ${
                          overview.trading_credentials ? "the order gate is closed" : "no exchange keys are configured"
                        }, so no order is ever sent. Fills are simulated at live prices with modelled slippage. `
                    : "Live trading is switched on: orders are sent to Bitget. "}
                The LLM judges headlines, not full
                articles. The graph covers {overview?.graph.nodes ?? "a handful of"} companies. The research sample is small. Nothing here is
                a trading signal.
              </p>
            </Card>
          </div>
        </Section>

        {/* ---------------------------------------------------------- closing */}
        <section aria-labelledby="closing-title" className="pb-20 pt-4 md:pb-28">
          <div className={CONTAINER}>
            <div className="glass-strong relative overflow-hidden rounded-[28px] px-6 py-12 md:rounded-[36px] md:px-14 md:py-16">
              <div className="relative flex items-center justify-between gap-12">
                <div className="max-w-2xl">
                  <Chip tone={STATUS_TONE[agentStatus]}>
                    {overview
                      ? armed
                        ? `Agent live · last read ${ago(overview.agent.last_cycle)}`
                        : "Agent paused"
                      : "Agent status unavailable"}
                  </Chip>
                  <h2
                    id="closing-title"
                    className="mt-6 text-balance text-[clamp(2.1rem,1.3rem+2.6vw,3.75rem)] font-[340] leading-[1.04] tracking-[-0.035em] text-ink"
                  >
                    Watch the agent read the news.
                  </h2>
                  <p className="mt-4 max-w-md text-[16px] leading-[1.6] text-muted-2 md:text-[17px]">
                    The terminal shows its actual decisions as they happen.
                  </p>
                  <LaunchButton className="mt-9" />
                </div>
                {/* The brand mark in a glowing disc, as the template sets its
                    emblem, with two hairline ripples: the cascade, spreading. */}
                <span aria-hidden="true" className="relative mr-[3%] hidden shrink-0 md:block">
                  <span className="absolute left-1/2 top-1/2 h-[150%] w-[150%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[rgba(120,145,180,0.22)]" />
                  <span className="absolute left-1/2 top-1/2 h-[200%] w-[200%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[rgba(120,145,180,0.12)]" />
                  <span
                    className="absolute left-1/2 top-1/2 h-[230%] w-[230%] -translate-x-1/2 -translate-y-1/2 rounded-full"
                    style={{ background: "radial-gradient(closest-side, rgba(196,214,238,0.55), rgba(196,214,238,0))" }}
                  />
                  <span className="relative flex h-[176px] w-[176px] items-center justify-center rounded-full bg-white/95 shadow-[0_0_48px_18px_rgba(255,255,255,0.6),0_12px_32px_rgba(28,52,92,0.08)] lg:h-[200px] lg:w-[200px]">
                    <CascadrMark size={92} />
                  </span>
                </span>
              </div>
            </div>
          </div>
        </section>

        <SiteFooter columns={FOOTER_COLUMNS} onDemo={onDemo} />
      </div>
    </div>
  );
}

/** A large thin count, as in the template's stats row. */
function Count({ value, label, className = "" }: { value: number; label: string; className?: string }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <p className="num text-[44px] font-[200] leading-[0.95] tracking-[-0.03em] text-ink md:text-[56px]">
        {value.toLocaleString("en-US")}
      </p>
      <p className="mt-2 text-[14px] text-muted-2">{label}</p>
    </div>
  );
}

/**
 * Soft light behind the glass: a few white and pale-blue fields so the frosted
 * surfaces have something to blur. Purely decorative.
 */
function LightFields() {
  const fields: { top: string; left: string; size: string; color: string }[] = [
    { top: "2%", left: "-12%", size: "62vw", color: "rgba(255,255,255,0.95)" },
    { top: "14%", left: "62%", size: "54vw", color: "rgba(196,214,238,0.7)" },
    { top: "33%", left: "-8%", size: "50vw", color: "rgba(203,219,240,0.65)" },
    { top: "46%", left: "58%", size: "58vw", color: "rgba(255,255,255,0.9)" },
    { top: "64%", left: "-14%", size: "60vw", color: "rgba(255,255,255,0.85)" },
    { top: "76%", left: "60%", size: "50vw", color: "rgba(196,214,238,0.6)" },
    { top: "88%", left: "10%", size: "56vw", color: "rgba(255,255,255,0.8)" },
  ];
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
      {fields.map((f, i) => (
        <span
          key={i}
          className="absolute block rounded-full"
          style={{
            top: f.top,
            left: f.left,
            width: f.size,
            height: f.size,
            maxWidth: 1100,
            maxHeight: 1100,
            background: `radial-gradient(closest-side, ${f.color}, transparent)`,
          }}
        />
      ))}
    </div>
  );
}
