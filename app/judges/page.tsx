import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Card, CONTAINER, Section } from "@/components/landing/Section";
import { LaunchButton } from "@/components/landing/LaunchButton";
import { Logo } from "@/components/brand/Logo";
import { Chip, Label, toneOf } from "@/components/landing/sections/ui";
import { serverGet } from "@/lib/api";
import { ago, signedPct, usd } from "@/lib/format";
import { ACTION_CLASS, ACTION_LABEL } from "@/lib/theme";
import type { Decision, Overview, PaperReport, Position, PositionsResponse } from "@/lib/types";

/**
 * The page the hackathon's "submission materials" link points at: what to
 * open, a real event -> decision -> execution trace read from the agent's own
 * log, and the paper-trading record. Every figure is read from the running
 * system on each request.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Cascadr - submission materials",
  description:
    "Bitget AI Base Camp Hackathon S2, Agentic Trading, Event-Driven Agent: live demo, a traced decision and the paper-trading log.",
};

const SITE = "https://trycascadr.vercel.app";
/** Set once the walkthrough video is published. */
const DEMO_VIDEO_URL = "https://www.youtube.com/watch?v=6W74-qPAj7c";

const API_LINKS: [string, string][] = [
  ["/api/agent/decisions", "Every decision, refusals included: headline, article link, the LLM's reading, its trade call and the 0G provider"],
  ["/api/paper/log?format=csv", "The trading log, one row per fill: time, instrument, direction, price, quantity, fee, balance change"],
  ["/api/positions", "The paper book: each position with its venue, fills, fees, exit policy and P&L"],
  ["/api/positions/events", "Every position event: opens, Bitget fills, LLM thesis reviews, closes"],
  ["/api/venue", "Bitget's own view of the demo account: balances and open positions"],
  ["/api/paper/report", "Return, Sharpe, max drawdown, win rate, closed trades"],
  ["/api/paper/equity", "The equity series, one point per minute (large)"],
  ["/api/graph", "The supply-chain graph with every link's sources"],
  ["/api/health", "Live state of the agent, LLM, news feed, exit loop and reviews"],
];

interface DecisionsResponse {
  decisions: Decision[];
}

/** Positions opened by a decision: same headline in the thesis, opened just before it was recorded. */
function positionsFor(d: Decision, positions: Position[]): Position[] {
  const at = Date.parse(d.at);
  const head = d.headline.slice(0, 60);
  return positions.filter((p) => {
    const opened = Date.parse(p.opened_at);
    return p.thesis.includes(head) && opened <= at + 60_000 && opened >= at - 15 * 60_000;
  });
}

export default async function JudgesPage() {
  const [overview, report, traded, recent, book] = await Promise.all([
    serverGet<Overview>("/overview"),
    serverGet<PaperReport & { venue?: string; fills?: string }>("/paper/report"),
    serverGet<DecisionsResponse>("/agent/decisions?action=TRADED&limit=10"),
    serverGet<DecisionsResponse>("/agent/decisions?limit=200"),
    serverGet<PositionsResponse>("/positions"),
  ]);
  const positions = book?.positions ?? [];
  const trade = traded?.decisions[0] ?? null;
  const tradePositions = trade ? positionsFor(trade, positions) : [];
  // The most recent decision where the LLM made the trade call, whatever it chose.
  const call = recent?.decisions.find((d) => d.trade_plan?.engine === "llm") ?? null;
  const stats = report?.stats;
  const counts = overview?.agent.decisions ?? {};
  // /overview carries the sum under "total" alongside the per-outcome counts.
  const total = counts.total ?? Object.entries(counts).reduce((a, [k, v]) => (k === "total" ? a : a + v), 0);

  return (
    <div className="min-h-screen bg-frame">
      <header className={`${CONTAINER} flex items-center justify-between gap-4 py-6`}>
        <Link href="/" aria-label="Cascadr home">
          <Logo height={26} />
        </Link>
        <LaunchButton size="sm">Launch terminal</LaunchButton>
      </header>

      <main>
        <section className={`${CONTAINER} pb-6 pt-10 md:pt-16`}>
          <Label>Bitget AI Base Camp Hackathon S2 · Agentic Trading · Event-Driven Agent</Label>
          <h1 className="mt-5 max-w-[16em] text-balance text-[clamp(2.4rem,1.4rem+3.6vw,4.6rem)] font-[300] leading-[1.02] tracking-[-0.035em] text-ink">
            Submission materials
          </h1>
          <p className="mt-6 max-w-[44rem] text-[16px] leading-[1.65] text-muted-2 md:text-[17px]">
            Cascadr is an autonomous event-driven agent. It reads live news on the companies in a
            source-cited electronics supply-chain graph; an LLM judges each disruption, makes the trade
            call on the candidates the graph derives, and reviews open positions; orders are placed on
            Bitget&apos;s demo exchange. Everything below is read live from the running agent.
          </p>
          <div className="mt-7 flex flex-wrap gap-2">
            <Chip tone={overview?.agent.armed ? "green" : "amber"}>
              {overview ? (overview.agent.armed ? "agent live" : "agent paused") : "agent state unknown"}
            </Chip>
            <Chip tone="amber">paper trading · Bitget demo</Chip>
            {overview && <Chip tone="blue">{overview.agent.llm_model ?? "LLM"} via 0G</Chip>}
          </div>
        </section>

        <Section index="01" eyebrow="Open these" title="The demo, live." id="demo">
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            <LinkCard label="Live site" href={SITE} note="What Cascadr does, with a real decision traced end to end." />
            <LinkCard
              label="Live terminal"
              href={`${SITE}/terminal`}
              note="Live news, the graph, the agent log (open any decision's “why”) and the positions on Bitget demo."
            />
            {DEMO_VIDEO_URL ? (
              <LinkCard label="Walkthrough video" href={DEMO_VIDEO_URL} note="2:50 · the problem, the evidence, and Cascadr working live: event, decision and execution." />
            ) : (
              <Card label="Walkthrough video" accent="dim">
                <p className="text-[14.5px] leading-[1.6] text-muted-2">Linked here once published.</p>
              </Card>
            )}
            <LinkCard
              label="Source code"
              href="https://github.com/mrnetwork0001/Cascadr"
              note="The full repository: agent, graph and its sources, research, tests and the demo film."
            />
          </div>
        </Section>

        <Section
          index="02"
          eyebrow="Event → decision → execution"
          title="A real trade, traced from the log."
          id="trace"
          lede="The most recent decision that opened a position, read from the agent's decision log, with the order Bitget's demo exchange filled. Nothing here is written by hand."
        >
          {trade ? (
            <div className="grid gap-5 lg:grid-cols-2">
              <Card label="1 · Event" accent="cyan">
                <p className="text-[19px] font-[420] leading-[1.35] tracking-[-0.015em] text-ink">{trade.headline}</p>
                <p className="mt-3 text-[13.5px] text-muted-2">
                  {trade.source}
                  {trade.published ? ` · published ${ago(trade.published)}` : ""} · decision #{trade.id}, {ago(trade.at)}
                </p>
                {trade.url && <ExternalLink href={trade.url}>source article</ExternalLink>}
              </Card>
              <Card label="2 · The LLM reads it" accent="cyan">
                <Facts
                  rows={[
                    ["directly hits", trade.entities.join(", ") || "-"],
                    ["shock", `${trade.shock.toFixed(2)} (${trade.severity}), confidence ${trade.confidence.toFixed(2)}`],
                    ["reasoning", trade.reasoning],
                    ["would change its mind", trade.uncertainty || "-"],
                    ["0G provider", trade.provider ?? "-"],
                  ]}
                />
              </Card>
              <Card label="3 · The trade call" accent="cyan">
                {trade.trade_plan?.engine === "llm" ? (
                  <PlanCalls d={trade} />
                ) : (
                  <p className="text-[14.5px] leading-[1.6] text-muted-2">
                    This position opened before the LLM took over the trade call (7 Oct 2026), so its size and
                    exits came from the earlier score-based rules. The most recent LLM trade call is shown below.
                  </p>
                )}
                <p className="mt-4 text-[13px] text-muted-2">
                  Outcome: <span className="font-[520] text-ink-soft">{trade.detail}</span>
                </p>
              </Card>
              <Card label="4 · Execution on Bitget demo" accent="green">
                {tradePositions.length ? (
                  tradePositions.map((p) => <PositionFacts key={p.id} p={p} />)
                ) : (
                  <p className="text-[14.5px] text-muted-2">The position could not be matched in the current book.</p>
                )}
              </Card>
            </div>
          ) : (
            <Card>
              <p className="text-[15px] text-muted-2">
                {traded ? "No decision has opened a position yet." : "The decision log could not be read right now."}
              </p>
            </Card>
          )}

          {call && call.id !== trade?.id && (
            <div className="mt-5">
              <Card label="Latest LLM trade call" accent="cyan">
                <div className="flex flex-wrap items-center gap-2">
                  <Chip tone={toneOf(ACTION_CLASS[call.action])}>{ACTION_LABEL[call.action] ?? call.action}</Chip>
                  <span className="text-[13px] text-muted-2">
                    decision #{call.id}, {ago(call.at)} · {call.source}
                  </span>
                </div>
                <p className="mt-3 text-[17px] font-[420] leading-[1.4] tracking-[-0.01em] text-ink">{call.headline}</p>
                <p className="mt-2 text-[13.5px] text-muted-2">
                  Read as shock {call.shock.toFixed(2)} on {call.entities.join(", ") || "-"}: {call.reasoning}
                </p>
                <div className="mt-4">
                  <PlanCalls d={call} />
                </div>
              </Card>
            </div>
          )}
        </Section>

        <Section
          index="03"
          eyebrow="Paper-trading log"
          title="The record, as it stands."
          id="log"
          lede={`Run on Bitget's demo exchange since 24 September 2026. ${total ? `${total.toLocaleString("en-US")} headlines reasoned by the LLM so far, refusals included.` : ""}`}
        >
          <div className="grid gap-5 lg:grid-cols-3">
            <Card label="Performance" accent="amber" className="lg:col-span-1">
              {stats && stats.samples >= 3 ? (
                <Facts
                  rows={[
                    ["tracked", `${Math.round(stats.hours_tracked)} h, ${stats.samples.toLocaleString("en-US")} equity points`],
                    ["return", stats.total_return_pct != null ? signedPct(stats.total_return_pct) : "-"],
                    ["Sharpe (annualised)", stats.sharpe_annualised != null ? stats.sharpe_annualised.toFixed(2) : "-"],
                    ["max drawdown", stats.max_drawdown_pct != null ? `${stats.max_drawdown_pct.toFixed(2)}%` : "-"],
                    ["closed trades", String(stats.closed_trades ?? 0)],
                    ["win rate", stats.win_rate_pct != null ? `${stats.win_rate_pct.toFixed(0)}%` : "- (no closed trade yet)"],
                    ["open positions", String(book?.open ?? "-")],
                  ]}
                />
              ) : (
                <p className="text-[14.5px] text-muted-2">The paper report could not be read right now.</p>
              )}
              {report?.fills && <p className="mt-4 text-[12.5px] leading-[1.55] text-muted">Fills: {report.fills}.</p>}
            </Card>
            <Card label="Public log endpoints" accent="dim" className="lg:col-span-2">
              <ul className="space-y-3">
                {API_LINKS.map(([path, note]) => (
                  <li key={path} className="grid gap-1 sm:grid-cols-[13rem_minmax(0,1fr)] sm:gap-4">
                    <a
                      href={`${SITE}${path}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="num break-all text-[13.5px] font-[520] text-accent-deep underline decoration-accent/30 underline-offset-[3px] hover:decoration-accent-deep"
                    >
                      {path}
                    </a>
                    <span className="text-[13.5px] leading-[1.5] text-muted-2">{note}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </Section>
      </main>

      <footer className={`${CONTAINER} py-12 text-[12.5px] text-muted`}>
        Cascadr · NetLayer Labs · paper trading only, on Bitget&apos;s demo exchange
      </footer>
    </div>
  );
}

function LinkCard({ label, href, note }: { label: string; href: string; note: string }) {
  return (
    <Card label={label} accent="cyan">
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="num break-all text-[15px] font-[520] text-accent-deep underline decoration-accent/30 underline-offset-[3px] hover:decoration-accent-deep"
      >
        {href.replace("https://", "")}
      </a>
      <p className="mt-3 text-[14px] leading-[1.6] text-muted-2">{note}</p>
    </Card>
  );
}

function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-4 inline-block text-[14px] font-[500] text-accent-deep underline decoration-accent/30 underline-offset-[3px] hover:decoration-accent-deep"
    >
      {children} ↗
    </a>
  );
}

function Facts({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="space-y-3">
      {rows.map(([k, v]) => (
        <div key={k} className="grid gap-0.5 sm:grid-cols-[10.5rem_minmax(0,1fr)] sm:gap-4">
          <dt className="text-[11px] font-[520] uppercase tracking-[0.12em] text-muted sm:pt-[3px]">{k}</dt>
          <dd className="min-w-0 text-[14px] leading-[1.55] text-ink-soft [overflow-wrap:anywhere]">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function PlanCalls({ d }: { d: Decision }) {
  const plan = d.trade_plan;
  if (!plan) return null;
  return (
    <div>
      {plan.summary && <p className="text-[14.5px] leading-[1.6] text-ink-soft">{plan.summary}</p>}
      <ul className="mt-3 space-y-3">
        {plan.calls.map((c) => (
          <li key={c.symbol} className="rounded-2xl border border-white/80 bg-white/60 p-3.5">
            <p className="num text-[13.5px] font-[560] text-ink">
              {c.short
                ? `SHORT ${c.symbol} · conviction ${c.conviction.toFixed(2)} · take-profit ${c.take_profit_pct.toFixed(1)}% · hold ${c.hold_hours.toFixed(0)} h`
                : `PASS ${c.symbol}`}
            </p>
            {c.reason && <p className="mt-1 text-[13.5px] leading-[1.55] text-muted-2">{c.reason}</p>}
          </li>
        ))}
        {Object.entries(plan.excluded ?? {}).map(([sym, [, why]]) => (
          <li key={sym} className="text-[12.5px] text-muted">
            {sym}: {why}
          </li>
        ))}
      </ul>
    </div>
  );
}

function PositionFacts({ p }: { p: Position }) {
  const tp = p.policy.take_profit_pct;
  return (
    <Facts
      rows={[
        ["order", `SHORT ${p.size} ${p.symbol} at ${usd(p.entry_price)}, ${p.leverage}x`],
        ["notional / fees", `${usd(p.notional_usdt, 0)} / ${usd(p.fees_usdt)} (Bitget's)`],
        ["venue / source", `${p.venue === "bitget-demo" ? "Bitget demo exchange" : p.venue} / ${p.source}`],
        [
          "exit rules",
          `stop-loss ${p.policy.stop_loss_pct}%${tp ? `, take-profit ${tp.toFixed(2)}%` : ""}, time stop ${p.policy.max_hold_hours.toFixed(0)} h`,
        ],
        [
          "now",
          p.status === "CLOSED"
            ? `closed (${p.close_reason ?? "-"}) at ${p.exit_price != null ? usd(p.exit_price) : "-"}, P&L ${p.realized_pnl_usdt != null ? usd(p.realized_pnl_usdt) : "-"}`
            : p.mark != null
              ? `open, mark ${usd(p.mark)}, P&L ${p.pnl_usdt != null ? usd(p.pnl_usdt) : "-"}`
              : "open, no live mark",
        ],
      ]}
    />
  );
}
