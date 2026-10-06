import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { MobileNav } from "@/components/landing/MobileNav";
import { Card, Section } from "@/components/landing/Section";
import { LaunchButton } from "@/components/landing/LaunchButton";
import { GraphPreview } from "@/components/landing/GraphPreview";
import { serverGet } from "@/lib/api";
import { ago, signedPct } from "@/lib/format";
import { ACTION_CLASS, ACTION_LABEL, PROVENANCE_CLASS } from "@/lib/theme";
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

/** One list feeds both the desktop links and the mobile menu. */
const NAV_LINKS = [
  { label: "How it works", href: "#how" },
  { label: "Architecture", href: "#architecture" },
];

interface FooterLink {
  label: string;
  href: string;
  external?: boolean;
}

/** Every link resolves to a real section or a real external page. */
const FOOTER_COLUMNS: { title: string; links: FooterLink[] }[] = [
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

const STATUS_TONE: Record<string, string> = {
  PAUSED: "text-amber border-amber/40",
  UNKNOWN: "text-term-dim border-term-edge",
  DOWN: "text-signal-red border-signal-red/40",
  LIVE: "text-signal-green border-signal-green/40",
  PAPER: "text-amber border-amber/40",
  BUILT: "text-signal-cyan border-signal-cyan/40",
  PLANNED: "text-term-dim border-term-edge",
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
  // Statuses are only asserted when /overview answered.
  const agentStatus = !overview ? "UNKNOWN" : armed ? "LIVE" : "PAUSED";
  const marketStatus = !overview ? "UNKNOWN" : overview.market_error ? "DOWN" : "LIVE";
  const tsmcNvda = graph?.edges.find((e) => e.source === "TSMC" && e.target === "NVDA") ?? null;
  const decisions = overview?.agent.decisions ?? {};
  // The hero canvas only draws the graph; the evidence behind each edge stays
  // on the server rather than riding along in the page payload.
  const drawable: Graph | null = graph && {
    ...graph,
    edges: graph.edges.map((e) => ({ ...e, basis: "", notes: "", sources: [], counter_evidence: [] })),
  };

  return (
    <div className="min-h-screen bg-term-void">
      {/* ---------------------------------------------------------------- nav */}
      <nav className="sticky top-0 z-30 border-b border-term-line bg-term-void/90 backdrop-blur">
        {/* Side margin is half the content sections' margin at every width
            (12.5% - 162px, never under 12px); phones keep their 20px. */}
        <div className="mx-auto flex w-full items-center gap-4 px-5 py-2.5 md:px-[max(0.75rem,calc(12.5%_-_10.125rem))]">
          <Link href="/" aria-label="Cascadr home" className="flex items-center">
            <Logo height={26} priority />
          </Link>
          <div className="ml-auto hidden items-center gap-4 md:flex">
            {NAV_LINKS.map((l) => (
              <Link key={l.href} href={l.href} className="text-2xs uppercase tracking-widest text-term-dim hover:text-amber">
                {l.label}
              </Link>
            ))}
          </div>
          <div className="ml-auto md:hidden">
            <MobileNav links={NAV_LINKS} />
          </div>
        </div>
      </nav>

      {/* -------------------------------------------------------------- hero */}
      <header className="relative overflow-hidden border-b border-term-line">
        <div className="pointer-events-none absolute inset-0 bg-grid opacity-40" />
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at 20% 0%, rgba(255,167,38,0.10), transparent 55%), radial-gradient(ellipse at 85% 55%, rgba(255,59,82,0.10), transparent 50%)",
          }}
        />

        <div className="relative mx-auto grid max-w-[calc(50%_+_42rem)] gap-10 px-5 py-14 md:px-6 md:py-20 lg:grid-cols-[1.05fr_1fr] lg:items-center">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 border border-term-edge px-2 py-1">
              {/* The dot reflects the agent's real state, not decoration. */}
              <span
                className={`h-[6px] w-[6px] rounded-full ${
                  overview?.agent.armed ? "animate-pulse-alarm bg-signal-green" : "bg-term-dim"
                }`}
              />
              <span className="text-2xs uppercase tracking-[0.2em] text-term-dim">
                {overview
                  ? overview.agent.armed
                    ? `Agent live · last read ${ago(overview.agent.last_cycle)}`
                    : "Agent paused"
                  : "Agent status unavailable"}
              </span>
            </div>

            <h1 className="mt-6 text-3xl font-bold leading-[1.08] tracking-tight text-term-bright md:text-5xl">
              <span className="block">Markets price the headline.</span>
              <span className="block text-amber text-glow-amber">Cascadr prices the second order.</span>
            </h1>

            <p className="mt-5 max-w-xl text-xs leading-relaxed text-term-text md:text-sm">
              An autonomous agent that reads live news about{" "}
              {overview ? overview.graph.nodes : "the"} companies in the electronics supply chain. When a headline signals a disruption, an LLM judges how severe it is, a
              source-cited supply-chain graph works out which downstream companies are exposed, and
              the agent paper-trades Bitget stock perpetuals against them — with every decision,
              including every refusal, on the record.
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <LaunchButton />
              <Link
                href="#cascade"
                className="border border-term-edge px-4 py-2.5 text-2xs font-semibold uppercase tracking-[0.18em] text-term-text transition-colors hover:border-amber hover:text-amber"
              >
                See a real decision
              </Link>
            </div>

            <dl className="mt-9 grid max-w-xl grid-cols-2 gap-px border border-term-line bg-term-line sm:grid-cols-4">
              <Stat k={overview?.graph.nodes} v="companies" />
              <Stat k={overview?.graph.edges} v="source-cited links" />
              <Stat
                k={
                  overview && overview.instruments.listed_on_bitget != null
                    ? `${overview.instruments.listed_on_bitget}/${overview.instruments.graph_tickers}`
                    : undefined
                }
                v="listed on Bitget now"
              />
              <Stat k={overview?.agent.headlines_seen} v="headlines read" />
            </dl>
          </div>

          <div className="min-w-0 border border-term-line bg-term-panel">
            <div className="flex items-center justify-between gap-3 border-b border-term-line bg-term-raised px-2 py-1">
              <span className="truncate text-2xs font-semibold uppercase tracking-[0.18em] text-amber">
                {featured ? `Decision #${featured.id} · ${ago(featured.at)}` : "Supply-chain graph"}
              </span>
              {featured && (
                <span className="shrink-0 text-2xs text-term-dim">
                  latest with downstream exposure · shock {featured.shock.toFixed(2)}
                </span>
              )}
            </div>
            <div className="h-[340px] md:h-[440px]">
              {drawable ? (
                <GraphPreview graph={drawable} decision={featured} />
              ) : (
                <div className="flex h-full items-center justify-center text-2xs uppercase tracking-widest text-term-dim">
                  graph unavailable
                </div>
              )}
            </div>
            <p className="border-t border-term-line px-2 py-1.5 text-2xs text-term-dim">
              {featured
                ? `Coloured by the contagion the LLM's verdict on “${featured.headline.slice(0, 90)}${featured.headline.length > 90 ? "…" : ""}” implies. Drag to explore.`
                : "No recorded decision has implied downstream exposure yet. Drag to explore."}
            </p>
          </div>
        </div>
      </header>

      {/* ------------------------------------------------------------ the edge */}
      <Section
        id="edge"
        index="01"
        eyebrow="The edge"
        title="Everyone trades the first order. The second order is buried in supply chains."
        lede="A headline names the company that was hit. It rarely names that company's customers. Working out who depends on whom — and how much — takes a map of the supply chain, and that dependency is what Cascadr trades."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Card label="A real example" accent="red">
            <p className="text-xs leading-relaxed text-term-text">
              On 3 April 2024 the M7.4 Hualien earthquake led TSMC to evacuate fabs. The headlines
              named TSMC. They did not name NVIDIA —{" "}
              {tsmcNvda ? (
                <>
                  yet the graph gives NVIDIA a{" "}
                  <span className="text-signal-cyan">{tsmcNvda.dependency.toFixed(2)} dependency on TSMC</span> for its{" "}
                  {tsmcNvda.component}{" "}
                  <span className={`border px-1 text-2xs ${PROVENANCE_CLASS[tsmcNvda.provenance] ?? ""}`}>
                    {tsmcNvda.provenance}
                  </span>
                  {tsmcNvda.sources[0] && (
                    <>
                      {" "}
                      <a href={tsmcNvda.sources[0].url} target="_blank" rel="noopener noreferrer" className="text-amber underline underline-offset-2">
                        source ↗
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
          <Card label="What the research found" accent="cyan">
            <p className="text-xs leading-relaxed text-term-text">
              Across {RESEARCH.events} verified historical disruptions ({RESEARCH.pairs} company pairs),
              downstream names fell on the day of the news in only {RESEARCH.day0NegativePct}% of cases.
              The drift arrived over the next five trading days: {signedPct(RESEARCH.car5VsSector)} against
              the semiconductor index, negative in {RESEARCH.car5NegativePct}% of cases. On average{" "}
              {RESEARCH.overnightShareOfDay0Pct}% of the day-one move happened overnight, when only 24/7
              markets like Bitget&apos;s perps trade.
            </p>
            <p className="mt-3 text-2xs uppercase tracking-wider text-amber">
              Promising, not proven: {RESEARCH.pairsFromOneEvent} of the {RESEARCH.pairs} pairs come from one
              earthquake
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
        <div className="grid gap-px border border-term-line bg-term-line md:grid-cols-2">
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
            body="A breadth-first walk of the supply chain, up to three hops. Each hop multiplies by that link's dependency — a figure taken from a filing, an analyst report, or a sourced statement mapped by a published rule — and decays, so direct customers are hit hardest."
            code={`score = shock × ∏ dependency × ${overview?.graph.hop_decay ?? "decay"}^hops`}
          />
          <Stage
            n="04"
            name="Act"
            stack="paper book · Bitget prices"
            body="Exposures above the trade threshold become short positions on the paper book, marked to Bitget's live mark price, capped per root cause, per symbol and by a drawdown halt, and closed by stop-loss, take-profit or time stop. Order signing for live trading exists but is switched off."
            code={`score ≥ ${overview?.agent.trade_threshold ?? "threshold"} → size by exposure → risk → paper fill`}
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
          <RealDecision d={featured} />
        ) : (
          <Card label="Unavailable" accent="dim">
            <p className="text-xs text-term-dim">
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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Live news", "Real headlines the agent read, with the LLM's verdict and a link to each article."],
            ["Knowledge graph", "The source-cited graph, coloured by the selected decision's contagion. Click a company for its sources."],
            ["Agent log", "Every decision with its reasoning, uncertainty and 0G provider, plus every paper position event."],
            ["Paper positions", "The paper book marked to Bitget's live mark price, with P&L, return on margin and pending exits."],
          ].map(([h, b]) => (
            <div key={h} className="border border-term-line bg-term-panel p-4">
              <h3 className="text-xs font-semibold text-amber">{h}</h3>
              <p className="mt-2 text-2xs leading-relaxed text-term-dim">{b}</p>
            </div>
          ))}
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-3 border border-term-line bg-term-panel px-4 py-3">
          <p className="text-2xs text-term-dim">
            {overview
              ? `So far: ${decisions.total ?? 0} decisions — ${decisions.DECLINED ?? 0} declined, ${decisions.TRADED ?? 0} traded.`
              : "Live counts unavailable."}
          </p>
          <div className="ml-auto">
            <LaunchButton size="sm" />
          </div>
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
        <div className="overflow-x-auto border border-term-line bg-term-panel">
          <table className="w-full min-w-[560px] border-collapse">
            <thead>
              <tr className="border-b border-term-line bg-term-raised">
                <th className="col-head px-3 py-2 text-left">Layer</th>
                <th className="col-head px-3 py-2 text-left">Technology</th>
                <th className="col-head px-3 py-2 text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["News sensing", "Google News RSS, per company, every few minutes", agentStatus],
                ["News oracle", `${overview?.agent.llm_model ?? "LLM"} via 0G Private Computer`, agentStatus],
                ["Knowledge graph", `${overview?.graph.nodes ?? "—"} companies, ${overview?.graph.edges ?? "—"} links, each with cited sources`, graph ? "LIVE" : "UNKNOWN"],
                ["Contagion engine", "Python, server-side, 3-hop traversal", overview ? "LIVE" : "UNKNOWN"],
                ["Market data", "Bitget public API — live quotes and mark prices", marketStatus],
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
              ].map(([layer, tech, status]) => (
                <tr key={layer} className="border-b border-term-line/60">
                  <td className="px-3 py-2 text-xs text-term-bright">{layer}</td>
                  <td className="px-3 py-2 text-2xs text-term-dim">{tech}</td>
                  <td className="px-3 py-2 text-right">
                    <span className={`border px-1.5 py-0.5 text-2xs font-semibold ${STATUS_TONE[status] ?? STATUS_TONE.PLANNED}`}>{status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Card label="Evidence behind every number" accent="green">
            <p className="text-xs leading-relaxed text-term-text">
              Each graph link carries its evidence class — disclosed in a filing, reported by an
              analyst or outlet, or a sourced qualitative statement mapped by a published rule — and
              links to its sources. Links nobody could source were removed. Company sizes are latest
              annual revenue from financial statements. Prices are Bitget&apos;s.
            </p>
            {graph && (
              <p className="mt-3 flex flex-wrap gap-1.5">
                {Object.entries(graph.stats.edges_by_provenance).map(([k, v]) => (
                  <span key={k} className={`border px-1.5 py-0.5 text-2xs ${PROVENANCE_CLASS[k] ?? ""}`}>
                    {v} {k}
                  </span>
                ))}
              </p>
            )}
          </Card>
          <Card label="Honest disclosure" accent="amber">
            <p className="text-xs leading-relaxed text-term-text">
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

      {/* ------------------------------------------------------------- footer */}
      <footer className="border-t border-term-line">
        <div className="px-5 py-14 md:px-6">
          <div className="mx-auto flex max-w-[calc(50%_+_42rem)] flex-col items-start gap-6 md:flex-row md:items-center">
            <div>
              <h2 className="text-xl font-semibold text-term-bright md:text-2xl">Watch the agent read the news.</h2>
              <p className="mt-2 max-w-md text-xs text-term-dim">The terminal shows its actual decisions as they happen.</p>
            </div>
            <div className="md:ml-auto">
              <LaunchButton />
            </div>
          </div>
        </div>

        <div className="border-t border-term-line px-5 pb-16 pt-12 md:px-6">
          <div className="mx-auto grid max-w-[calc(50%_+_42rem)] gap-10 md:grid-cols-[1.6fr_1fr_1fr_1fr]">
            <div>
              <Logo height={30} />
              <p className="mt-4 max-w-xs text-xs leading-relaxed text-term-dim">
                An autonomous agent that reads supply-chain news and paper-trades downstream
                contagion on Bitget stock perpetuals. Built by NetLayer Labs for the Bitget AI
                Hackathon.
              </p>
            </div>
            {FOOTER_COLUMNS.map((col) => (
              <nav key={col.title} aria-label={col.title}>
                <p className="col-head mb-4">{col.title}</p>
                <ul className="space-y-3">
                  {col.links.map((l) => (
                    <li key={l.label}>
                      <Link
                        href={l.href}
                        {...(l.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                        className="text-xs text-term-text transition-colors hover:text-amber"
                      >
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}

function Stat({ k, v }: { k: number | string | undefined; v: string }) {
  return (
    <div className="bg-term-panel px-3 py-2.5">
      <dt className="num text-lg font-semibold text-term-bright">{k ?? "—"}</dt>
      <dd className="text-2xs uppercase tracking-wider text-term-dim">{v}</dd>
    </div>
  );
}

function Stage({ n, name, stack, body, code }: { n: string; name: string; stack: string; body: string; code: string }) {
  return (
    <div className="min-w-0 bg-term-panel p-5">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-2xs font-semibold text-amber">{n}</span>
        <h3 className="text-sm font-semibold text-term-bright">{name}</h3>
        <span className="text-2xs uppercase tracking-wider text-term-dim sm:ml-auto">{stack}</span>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-term-text">{body}</p>
      <pre className="mt-3 overflow-x-auto border-l-2 border-term-edge bg-term-void px-3 py-2 text-2xs text-signal-cyan">{code}</pre>
    </div>
  );
}

/**
 * A recorded decision, with its arithmetic rebuilt from the factors stored
 * with it. Decisions that acted keep the factors they were decided on;
 * declined ones are restated when the graph changes (see sync_exposures).
 */
function RealDecision({ d }: { d: Decision }) {
  const top = d.exposures.find((e) => !e.is_origin) ?? null;
  const links = top?.links ?? [];
  const hopDecay = top?.hop_decay ?? null;
  const hops = links.length;

  return (
    <div className="grid gap-4 lg:grid-cols-[1.25fr_1fr]">
      <div className="min-w-0 border border-term-line bg-term-panel">
        <div className="flex flex-wrap items-center gap-2 border-b border-term-line bg-term-raised px-3 py-1.5">
          <span className="text-2xs font-semibold uppercase tracking-[0.18em] text-amber">Decision #{d.id}</span>
          <span className="text-2xs text-term-dim">{ago(d.at)}</span>
          <span className={`ml-auto border px-1 text-2xs font-semibold ${ACTION_CLASS[d.action] ?? ""}`}>
            {ACTION_LABEL[d.action] ?? d.action}
          </span>
        </div>
        <div className="space-y-3 px-3 py-3 text-xs">
          <div>
            <p className="col-head mb-1">Headline · {d.source}</p>
            <p className="text-term-bright">{d.headline}</p>
            {d.url && (
              <a href={d.url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-2xs text-amber underline underline-offset-2">
                read the article ↗
              </a>
            )}
          </div>
          <div>
            <p className="col-head mb-1">Verdict · {d.engine === "llm" ? d.model : "keyword fallback"}</p>
            <p className="text-term-text">
              {d.entities.length ? `Disrupted: ${d.entities.join(", ")}` : "No graph company disrupted"} · shock{" "}
              <span className="num">{d.shock.toFixed(2)}</span> · {d.severity} · confidence{" "}
              <span className="num">{d.confidence.toFixed(2)}</span>
            </p>
          </div>
          {d.reasoning && (
            <div>
              <p className="col-head mb-1">Reasoning</p>
              <p className="leading-relaxed text-term-text">{d.reasoning}</p>
            </div>
          )}
          {d.uncertainty && (
            <div>
              <p className="col-head mb-1">What would change its mind</p>
              <p className="leading-relaxed text-term-dim">{d.uncertainty}</p>
            </div>
          )}
          <div>
            <p className="col-head mb-1">Outcome</p>
            <p className="text-term-dim">{d.detail}</p>
          </div>
          {d.provider && (
            <p className="text-2xs text-term-dim">
              Run by 0G provider <span className="num text-term-text">{d.provider}</span>
            </p>
          )}
        </div>
      </div>

      <div className="min-w-0 space-y-4">
        <Card label="The arithmetic" accent="cyan">
          {top && hops > 0 && hopDecay != null ? (
            <dl className="space-y-1.5 text-2xs">
              <Row k="shock" v={exact(d.shock)} note={`${top.origin}, set by the LLM`} />
              {links.map((e) => (
                <Row
                  key={`${e.source}${e.target}`}
                  k="× dependency"
                  v={exact(e.dependency)}
                  note={`${e.source} → ${e.target} (${e.weight_note || e.provenance.toLowerCase()})`}
                />
              ))}
              <Row k={`× decay^${hops}`} v={exact(Math.pow(hopDecay, hops))} note={`${hopDecay} per hop`} />
              <div className="!mt-3 flex items-baseline justify-between border-t border-term-edge pt-2">
                <dt className="text-2xs uppercase tracking-wider text-term-dim">{top.ticker ?? top.target} exposure</dt>
                <dd className="num text-sm font-semibold text-signal-red">{exact(top.score)}</dd>
              </div>
              <p className="pt-1 text-term-dim">
                Implied move {signedPct(top.implied_drawdown_pct, 1)} · {top.contagion}
              </p>
            </dl>
          ) : (
            <p className="text-2xs text-term-dim">
              {top
                ? "This decision was recorded before its factors were stored, so its arithmetic cannot be shown exactly."
                : "This headline implies no downstream exposure, so there is nothing to multiply."}
            </p>
          )}
        </Card>
        <Card label="All implied exposure" accent="red">
          {d.exposures.length ? (
            <ul className="space-y-1 text-2xs">
              {d.exposures.slice(0, 8).map((e) => (
                <li key={e.target} className="flex items-baseline gap-2">
                  <span className="w-20 shrink-0 font-semibold text-term-bright">{e.ticker ?? e.target}</span>
                  <span className="flex-1 truncate text-term-dim">{e.is_origin ? "origin" : e.hops.join(" → ")}</span>
                  <span className="num text-term-text">{(e.score * 100).toFixed(0)}%</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-2xs text-term-dim">None.</p>
          )}
        </Card>
      </div>
    </div>
  );
}

function Row({ k, v, note }: { k: string; v: string; note: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-term-text">
        {k}
        <span className="ml-2 text-term-dim">{note}</span>
      </dt>
      <dd className="num shrink-0 text-term-bright">{v}</dd>
    </div>
  );
}

/** A factor as stored, without rounding digits away (up to 6 places). */
function exact(x: number): string {
  return String(+x.toFixed(6));
}
