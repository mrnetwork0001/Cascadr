import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { MobileNav } from "@/components/landing/MobileNav";
import { Card, Section } from "@/components/landing/Section";
import { LaunchButton } from "@/components/landing/LaunchButton";
import { GraphPreview } from "@/components/landing/GraphPreview";
import { EDGES, NODES } from "@/lib/mock/graph";

const TRADABLE = NODES.filter((n) => n.ticker).length;

const HERO_STATS = [
  { k: `${NODES.length}`, v: "graph nodes" },
  { k: `${EDGES.length}`, v: "typed edges" },
  { k: "3", v: "hop traversal depth" },
  { k: `${TRADABLE}`, v: "live stock perps" },
];

const AGENTS = [
  {
    n: "01",
    name: "Graph Builder",
    stack: "LangChain · Neo4j",
    accent: "violet",
    body: "Ingests 10-K filings, supplier disclosures and customs data. An extraction chain resolves entity aliases — “Hon Hai”, “Foxconn” and “鴻海” are one node — and writes typed, weighted relationships:",
    code: "(TSMC)-[:FABRICATES {component:'3nm', dependency:0.92}]->(NVDA)",
  },
  {
    n: "02",
    name: "News Oracle",
    stack: "NER · LLM classifier",
    accent: "cyan",
    body: "Subscribes to the wire. Named-entity recognition maps each headline onto graph nodes, then a classifier assigns a shock magnitude from severity, expected duration and scope. Below the confidence floor nothing propagates — the graph stays quiet on noise.",
    code: "shock = f(severity, duration, scope) → 0.00 … 1.00",
  },
  {
    n: "03",
    name: "Contagion Traversal",
    stack: "Cypher · scoring",
    accent: "amber",
    body: "Breadth-first walk of the downstream cone to a depth of three. Each hop multiplies by that edge's dependency weight and decays, so a fab outage hits its direct customers hard and their customers faintly. The strongest path per target survives and becomes the rationale a human can read.",
    code: "score = shock × ∏ dependency × decay^hops",
  },
  {
    n: "04",
    name: "Execution Agent",
    stack: "Bitget Agent Hub",
    accent: "red",
    body: "Anything above the trade threshold is sized from its exposure and submitted as an isolated-margin market short on the tokenized equity. A deterministic clientOid keeps retries idempotent, and a risk gate blocks incremental orders in a name already at target weight.",
    code: "POST /api/v2/mix/order · marginMode: isolated · side: sell",
  },
] as const;

const CASCADE = [
  ["t+0.00", "ORACLE", "REUTERS headline ingested — entity resolution p=0.94"],
  ["t+0.00", "ORACLE", "Resolved 1 entity to graph nodes: TSMC"],
  ["t+0.48", "GRAPH", "MATCH (o:Company {id:'TSMC'})-[:FABRICATES*1..3]->(d)"],
  ["t+0.49", "GRAPH", "Taiwan Semiconductor shock 0.88 propagated to 5 nodes"],
  ["t+1.11", "RISK", "NVIDIA exposure 50% (TSMC → NVDA) · implied −5.5%"],
  ["t+1.45", "EXEC", "SHORT NVDAUSDT · 39,000 USDT @ 2x"],
  ["t+1.87", "FILL", "FILLED NVDAUSDT short 39,000 USDT @ 222.39"],
] as const;

const LEVEL_TONE: Record<string, string> = {
  ORACLE: "text-signal-violet",
  GRAPH: "text-signal-cyan",
  RISK: "text-amber",
  EXEC: "text-signal-red",
  FILL: "text-signal-green",
};

const STACK = [
  ["Dashboard", "Next.js 14 · React 18 · Tailwind", "BUILT"],
  ["Graph visualisation", "react-force-graph-2d (canvas)", "BUILT"],
  ["News oracle (LLM)", "OpenAI-compatible gateway · 0G Compute", "BUILT"],
  ["Contagion engine", "TypeScript + Python, parity-tested", "BUILT"],
  ["Portfolio risk", "cluster caps, per-symbol, drawdown halt", "BUILT"],
  ["Backend API", "Python · FastAPI (graph, scoring, SSE)", "BUILT"],
  ["Market data", "Bitget public v2 — live marks & contracts", "LIVE"],
  ["Filing ingestion", "SEC EDGAR 10-K concentration extraction", "BUILT"],
  ["Order execution", "Bitget stock perps — paper-gated", "PAPER"],
  ["Knowledge graph store", "Neo4j repository + schema (unpopulated)", "PLANNED"],
] as const;

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
      { label: "See a cascade", href: "#cascade" },
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
  BUILT: "text-signal-green border-signal-green/40",
  LIVE: "text-signal-cyan border-signal-cyan/40",
  PAPER: "text-amber border-amber/40",
  PLANNED: "text-term-dim border-term-edge",
};

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-term-void">
      {/* ---------------------------------------------------------------- nav */}
      <nav className="sticky top-0 z-30 border-b border-term-line bg-term-void/90 backdrop-blur">
        <div className="mx-auto flex max-w-[84rem] items-center gap-4 px-5 py-2.5 md:px-6">
          <Link href="/" aria-label="Cascadr home" className="flex items-center">
            <Logo height={26} priority />
          </Link>
          {/* No CTA here: the hero's Launch terminal is the single entry point. */}
          <div className="ml-auto hidden items-center gap-4 md:flex">
            {NAV_LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="text-2xs uppercase tracking-widest text-term-dim hover:text-amber"
              >
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

        <div className="relative mx-auto grid max-w-[81rem] gap-10 px-5 py-14 md:px-6 md:py-20 lg:grid-cols-[1.05fr_1fr] lg:items-center">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 border border-term-edge px-2 py-1">
              <span className="h-[6px] w-[6px] animate-pulse-alarm rounded-full bg-signal-red" />
              <span className="text-2xs uppercase tracking-[0.2em] text-term-dim">
                Bitget AI Hackathon · Agentic Trading
              </span>
            </div>

            <h1 className="mt-6 text-3xl font-bold leading-[1.08] tracking-tight text-term-bright md:text-5xl">
              <span className="block">Markets price the headline.</span>
              <span className="block text-amber text-glow-amber">
                Cascadr prices the second order.
              </span>
            </h1>

            <p className="mt-5 max-w-xl text-xs leading-relaxed text-term-text md:text-sm">
              A multi-agent system that maps the global electronics supply chain as a
              knowledge graph. When an upstream node breaks — a fab offline, a line
              halted, a strait closed — Cascadr traverses downstream, scores who is
              exposed and how badly, and shorts the affected stock
              perpetuals on Bitget before the contagion is priced in.
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <LaunchButton />
              <Link
                href="#cascade"
                className="border border-term-edge px-4 py-2.5 text-2xs font-semibold uppercase tracking-[0.18em] text-term-text transition-colors hover:border-amber hover:text-amber"
              >
                See a cascade
              </Link>
            </div>

            <dl className="mt-9 grid max-w-lg grid-cols-2 gap-px border border-term-line bg-term-line sm:grid-cols-4">
              {HERO_STATS.map((s) => (
                <div key={s.v} className="bg-term-panel px-3 py-2.5">
                  <dt className="num text-lg font-semibold text-term-bright">{s.k}</dt>
                  <dd className="text-2xs uppercase tracking-wider text-term-dim">
                    {s.v}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Live traversal, computed by the same engine the terminal uses. */}
          <div className="min-w-0 border border-term-line bg-term-panel">
            <div className="flex items-center justify-between border-b border-term-line bg-term-raised px-2 py-1">
              <span className="text-2xs font-semibold uppercase tracking-[0.18em] text-amber">
                Live traversal · TSMC Fab 18
              </span>
              <span className="text-2xs text-signal-red">shock 0.88</span>
            </div>
            <div className="h-[340px] md:h-[440px]">
              <GraphPreview />
            </div>
            <p className="border-t border-term-line px-2 py-1.5 text-2xs text-term-dim">
              Red nodes are downstream names the traversal flagged. Drag to explore.
            </p>
          </div>
        </div>
      </header>

      {/* ------------------------------------------------------------ the edge */}
      <Section
        id="edge"
        index="01"
        eyebrow="The edge"
        title="Everyone trades the first order. The second order is sitting in a 10-K."
        lede="A retail bot reads “Apple misses earnings” and shorts AAPL. So does everyone else with the same wire, and the edge is gone in seconds. The link between a Taiwanese fab and a US chip designer is not on the wire — it is buried in filings, and it takes a graph to walk it."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Card label="The retail loop" accent="dim">
            <p className="text-xs leading-relaxed text-term-dim">
              Headline names the ticker. Bot shorts the ticker. Thousands of bots
              short the same ticker off the same feed within the same second.
            </p>
            <p className="mt-3 border-t border-term-line pt-3 text-2xs text-term-dim">
              <span className="text-term-text">Apple misses earnings</span> → short
              AAPL
            </p>
            <p className="mt-2 text-2xs uppercase tracking-wider text-term-dim">
              Edge: decays in seconds · crowded
            </p>
          </Card>

          <Card label="The Cascadr loop" accent="red">
            <p className="text-xs leading-relaxed text-term-text">
              Headline names an entity nobody trades. The graph says who depends on
              it, by how much, and through which component — so the trade lands on a
              ticker the headline never mentioned.
            </p>
            <p className="mt-3 border-t border-term-line pt-3 text-2xs text-term-dim">
              <span className="text-term-bright">Quake halts TSMC Fab 18</span> →{" "}
              <span className="text-signal-cyan">92% of NVIDIA GPU dies are fabbed there</span>{" "}
              → short <span className="text-signal-red">NVDA perp</span>
            </p>
            <p className="mt-2 text-2xs uppercase tracking-wider text-amber">
              Edge: minutes to hours · uncrowded
            </p>
          </Card>
        </div>
      </Section>

      {/* -------------------------------------------------------- how it works */}
      <Section
        id="how"
        index="02"
        eyebrow="How it works"
        title="Four agents, one pipeline."
        lede="Each stage hands a narrower, more decision-ready object to the next: filings become a graph, headlines become entities, entities become scored exposure, exposure becomes an order."
      >
        <div className="grid gap-px border border-term-line bg-term-line md:grid-cols-2">
          {AGENTS.map((a) => (
            <div key={a.n} className="min-w-0 bg-term-panel p-5">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="text-2xs font-semibold text-amber">{a.n}</span>
                <h3 className="text-sm font-semibold text-term-bright">{a.name}</h3>
                <span className="text-2xs uppercase tracking-wider text-term-dim sm:ml-auto">
                  {a.stack}
                </span>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-term-text">{a.body}</p>
              <pre className="mt-3 overflow-x-auto border-l-2 border-term-edge bg-term-void px-3 py-2 text-2xs text-signal-cyan">
                {a.code}
              </pre>
            </div>
          ))}
        </div>
      </Section>

      {/* ----------------------------------------------------- worked example */}
      <Section
        id="cascade"
        index="03"
        eyebrow="Worked example"
        title="One quake, traced end to end."
        lede="This is the scenario the terminal ships with — and the numbers below are what the engine actually computes, not illustrations."
      >
        <div className="grid items-start gap-4 lg:grid-cols-[1.25fr_1fr]">
          <div className="border border-term-line bg-term-panel">
            <div className="border-b border-term-line bg-term-raised px-3 py-1.5">
              <span className="text-2xs font-semibold uppercase tracking-[0.18em] text-amber">
                Agent trace
              </span>
            </div>
            <ul className="divide-y divide-term-line/60">
              {CASCADE.map(([t, lvl, text], i) => (
                <li key={i} className="flex gap-2 px-3 py-1.5">
                  <span className="num shrink-0 text-2xs text-term-dim">{t}</span>
                  <span
                    className={`w-12 shrink-0 text-2xs font-semibold ${LEVEL_TONE[lvl]}`}
                  >
                    {lvl}
                  </span>
                  <span className="min-w-0 break-words text-2xs leading-relaxed text-term-text">
                    {text}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-4">
            <Card label="The arithmetic" accent="cyan">
              <dl className="space-y-1.5 text-2xs">
                <Row k="shock" v="0.88" note="Fab 18 offline, N3 guidance pulled" />
                <Row k="× dependency" v="0.92" note="NVIDIA GPU dies fabbed at TSMC" />
                <Row k="× decay^1" v="0.62" note="one hop downstream" />
                <div className="!mt-3 flex items-baseline justify-between border-t border-term-edge pt-2">
                  <dt className="text-2xs uppercase tracking-wider text-term-dim">
                    exposure
                  </dt>
                  <dd className="num text-sm font-semibold text-signal-red">0.50</dd>
                </div>
              </dl>
            </Card>

            <Card label="Resulting order" accent="red">
              <pre className="overflow-x-auto text-2xs leading-relaxed text-signal-cyan">
{`{
  "symbol": "NVDAUSDT",
  "productType": "USDT-FUTURES",
  "marginMode": "isolated",
  "side": "sell",
  "orderType": "market",
  "size": "175.37",
  "clientOid": "cascadr-evt-001-nvda"
}`}
              </pre>
            </Card>
          </div>
        </div>
      </Section>

      {/* ------------------------------------------------------- the terminal */}
      <Section
        id="terminal"
        index="04"
        eyebrow="The terminal"
        title="A single screen that shows its work."
        lede="No modals, no drill-downs. The wire feed, the graph, the ranked exposure and the order book sit side by side, so you can watch a headline become a position without losing the thread."
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["NLP News Oracle", "Raw wire in, resolved graph entities out, with confidence on every match."],
            ["Knowledge graph", "Force-directed canvas. Nodes coloured by tier until they are hit, then by severity. Critical nodes pulse."],
            ["Contagion exposure", "Every flagged name ranked by score, with the implied drawdown the model attaches to it."],
            ["Execution log", "The full reasoning trace — expand any EXEC line to read the exact Bitget request body."],
          ].map(([h, b]) => (
            <div key={h} className="border border-term-line bg-term-panel p-4">
              <h3 className="text-xs font-semibold text-amber">{h}</h3>
              <p className="mt-2 text-2xs leading-relaxed text-term-dim">{b}</p>
            </div>
          ))}
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3 border border-term-line bg-term-panel px-4 py-3">
          <p className="text-2xs text-term-dim">
            Press <span className="text-signal-red">RUN SCENARIO</span> in the terminal
            to play the cascade live — roughly 25 seconds end to end.
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
        title="What is built, and what is not."
        lede="This build is the frontend and the contagion engine, running on a curated graph. The backend services are scaffolded but not connected — stated plainly here rather than implied away."
      >
        <div className="overflow-x-auto border border-term-line bg-term-panel">
          <table className="w-full min-w-[540px] border-collapse">
            <thead>
              <tr className="border-b border-term-line bg-term-raised">
                <th className="col-head px-3 py-2 text-left">Layer</th>
                <th className="col-head px-3 py-2 text-left">Technology</th>
                <th className="col-head px-3 py-2 text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {STACK.map(([layer, tech, status]) => (
                <tr key={layer} className="border-b border-term-line/60">
                  <td className="px-3 py-2 text-xs text-term-bright">{layer}</td>
                  <td className="px-3 py-2 text-2xs text-term-dim">{tech}</td>
                  <td className="px-3 py-2 text-right">
                    <span
                      className={`border px-1.5 py-0.5 text-2xs font-semibold ${STATUS_TONE[status]}`}
                    >
                      {status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Card label="Narrow mock boundary" accent="green">
            <p className="text-xs leading-relaxed text-term-text">
              The engine now runs server-side in Python, scored identically to the
              browser build and pinned by parity tests. What remains is data: point
              the Neo4j repository at a populated instance and replace the scripted
              wire with a live news socket. Execution is already a signed request —
              it is held back by a safety gate, not by missing code.
            </p>
          </Card>
          <Card label="Honest disclosure" accent="amber">
            <p className="text-xs leading-relaxed text-term-text">
              Marks and contract specs are live from Bitget&apos;s public API. Orders
              are built against real stock-perp symbols but never sent: paper trading
              is on by default and the backend refuses to disarm it without an
              explicit environment flag, credentials, and a notional cap. Neo4j is
              scaffolded but unpopulated. Supply-side dependency weights remain
              curated estimates — only filing-sourced edges are marked DISCLOSED.
              Nothing here is a trading signal.
            </p>
          </Card>
        </div>
      </Section>

      {/* ------------------------------------------------------------- footer */}
      <footer className="border-t border-term-line">
        {/* Closing CTA */}
        <div className="px-5 py-14 md:px-6">
          <div className="mx-auto flex max-w-[81rem] flex-col items-start gap-6 md:flex-row md:items-center">
            <div>
              <h2 className="text-xl font-semibold text-term-bright md:text-2xl">
                Watch a supply chain break in real time.
              </h2>
              <p className="mt-2 max-w-md text-xs text-term-dim">
                The terminal runs in the browser. Nothing to configure.
              </p>
            </div>
            <div className="md:ml-auto">
              <LaunchButton />
            </div>
          </div>
        </div>

        {/* Sitemap — now the final block, so it carries the bottom padding. */}
        <div className="border-t border-term-line px-5 pb-16 pt-12 md:px-6">
          <div className="mx-auto grid max-w-[81rem] gap-10 md:grid-cols-[1.6fr_1fr_1fr_1fr]">
            <div>
              <Logo height={30} />
              <p className="mt-4 max-w-xs text-xs leading-relaxed text-term-dim">
                A supply-chain knowledge graph that trades downstream contagion on
                Bitget stock perpetuals. Built by NetLayer Labs for the Bitget AI
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
                        {...(l.external
                          ? { target: "_blank", rel: "noopener noreferrer" }
                          : {})}
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
