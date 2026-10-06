import type { ReactNode } from "react";
import { GraphPreview } from "@/components/landing/GraphPreview";
import { Card } from "@/components/landing/Section";
import { Chip, Label, TONE_TEXT, toneOf } from "@/components/landing/sections/ui";
import { ago, signedPct } from "@/lib/format";
import { ACTION_CLASS, ACTION_LABEL, CONTAGION_CLASS, CONTAGION_COLOR } from "@/lib/theme";
import type { Decision, Graph } from "@/lib/types";

/**
 * A recorded decision, with its arithmetic rebuilt from the factors stored
 * with it. Decisions that acted keep the factors they were decided on;
 * declined ones are restated when the graph changes (see sync_exposures).
 * Beside it, the live graph coloured by the contagion this decision implies.
 */
export function RealDecision({ d, graph }: { d: Decision; graph: Graph | null }) {
  const top = d.exposures.find((e) => !e.is_origin) ?? null;
  const links = top?.links ?? [];
  const hopDecay = top?.hop_decay ?? null;
  const hops = links.length;
  // The headline figure carries its contagion level's colour, the same family
  // as the chip beside it (in the chip's darker, AA-safe shade); a nominal
  // level stays plain ink rather than a grey that would read as disabled.
  const level = top ? toneOf(CONTAGION_CLASS[top.contagion]) : "dim";
  const scoreClass = level === "dim" ? "text-ink" : TONE_TEXT[level];

  return (
    <div className="grid gap-5 lg:grid-cols-12">
      {/* ------------------------------------------------ the decision itself */}
      <article className="glass min-w-0 rounded-[24px] md:rounded-[28px] lg:col-span-7">
        <header className="flex flex-wrap items-center gap-x-3 gap-y-2 px-6 pt-6 md:px-8 md:pt-8">
          <Label className="text-ink-soft">Decision #{d.id}</Label>
          <span className="text-[13px] text-muted">{ago(d.at)}</span>
          <Chip tone={toneOf(ACTION_CLASS[d.action])} className="ml-auto">
            {ACTION_LABEL[d.action] ?? d.action}
          </Chip>
        </header>

        <div className="px-6 pb-6 pt-6 md:px-8 md:pb-8">
          <Label>Headline · {d.source}</Label>
          <p className="mt-3 text-balance text-[21px] font-[400] leading-[1.28] tracking-[-0.022em] text-ink md:text-[26px]">
            {d.headline}
          </p>
          {d.url && (
            <a
              href={d.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-1.5 rounded-full text-[14px] font-[500] tracking-[-0.01em] text-accent-deep underline decoration-accent/40 underline-offset-4 transition-colors hover:decoration-accent-deep"
            >
              Read the article <span aria-hidden="true">↗</span>
            </a>
          )}

          <Block label={`Verdict · ${d.engine === "llm" ? d.model : "keyword fallback"}`}>
            <p className="text-[15px] text-term-text">
              {d.entities.length ? `Disrupted: ${d.entities.join(", ")}` : "No graph company disrupted"}
            </p>
            <dl className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
              <Figure k="shock" v={d.shock.toFixed(2)} />
              <Figure k="severity" v={d.severity} />
              <Figure k="confidence" v={d.confidence.toFixed(2)} />
            </dl>
          </Block>

          {d.reasoning && (
            <Block label="Reasoning">
              <p className="max-w-[46rem] text-[15px] leading-[1.62] text-term-text">{d.reasoning}</p>
            </Block>
          )}
          {d.uncertainty && (
            <Block label="What would change its mind">
              <p className="max-w-[46rem] text-[15px] leading-[1.62] text-muted-2">{d.uncertainty}</p>
            </Block>
          )}
          <Block label="Outcome">
            <p className="text-[15px] leading-[1.55] text-term-text">{d.detail}</p>
          </Block>
          {d.provider && (
            <p className="mt-6 text-[12.5px] leading-5 text-muted">
              Run by 0G provider{" "}
              <span className="break-all rounded-md bg-white/60 px-1.5 py-0.5 font-mono text-[11.5px] text-term-text ring-1 ring-[rgba(120,145,180,0.18)]">
                {d.provider}
              </span>
            </p>
          )}
        </div>
      </article>

      {/* ------------------------------------------------- the graph it lights */}
      <figure className="glass flex min-w-0 flex-col rounded-[24px] p-2 md:rounded-[28px] lg:col-span-5 lg:min-h-[440px]">
        <div className="relative min-h-[340px] flex-1 overflow-hidden rounded-[18px] md:min-h-[460px] md:rounded-[22px] lg:min-h-[300px]">
          {graph ? (
            <div className="absolute inset-0">
              <GraphPreview graph={graph} decision={d} />
            </div>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-frame text-[13px] text-muted">
              Graph unavailable
            </div>
          )}
          <span className="glass-pill pointer-events-none absolute left-3 top-3 px-3 py-1.5 text-[12px] font-[470] tracking-[-0.01em] text-ink-soft">
            Live graph · this decision&apos;s contagion
          </span>
        </div>
        <figcaption className="px-4 pb-3 pt-4 text-[13px] leading-5 text-muted md:px-5">
          {graph
            ? "Each company is coloured by the contagion this verdict implies; the highlighted route cycles through its own paths. Drag to explore."
            : "The graph could not be read from the API right now."}
        </figcaption>
      </figure>

      {/* ------------------------------------------------------ the arithmetic */}
      <Card label="The arithmetic" accent="cyan" className="lg:col-span-7">
        {top && hops > 0 && hopDecay != null ? (
          <>
            <dl className="divide-y divide-[rgba(120,145,180,0.16)]">
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
            </dl>
            <div className="mt-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-t border-[rgba(120,145,180,0.28)] pt-6">
              <div>
                <Label>{top.ticker ?? top.target} exposure</Label>
                <p className="mt-2 flex flex-wrap items-center gap-2 text-[14px] text-muted-2">
                  Implied move <span className="num text-term-text">{signedPct(top.implied_drawdown_pct, 1)}</span>
                  <Chip tone={toneOf(CONTAGION_CLASS[top.contagion])}>{top.contagion}</Chip>
                </p>
              </div>
              <p className={`num text-[52px] font-[220] leading-[0.9] tracking-[-0.02em] md:text-[64px] ${scoreClass}`}>
                {exact(top.score)}
              </p>
            </div>
          </>
        ) : (
          <p className="text-[15px] leading-[1.6] text-muted">
            {top
              ? "This decision was recorded before its factors were stored, so its arithmetic cannot be shown exactly."
              : "This headline implies no downstream exposure, so there is nothing to multiply."}
          </p>
        )}
      </Card>

      {/* ----------------------------------------------- every implied exposure */}
      <Card label="All implied exposure" accent="red" className="lg:col-span-5">
        {d.exposures.length ? (
          <ul className="space-y-4">
            {d.exposures.slice(0, 8).map((e) => (
              <li key={e.target} className="grid grid-cols-[4.9rem_minmax(0,1fr)_2.5rem] items-center gap-x-3 sm:grid-cols-[6.5rem_minmax(0,1fr)_3rem] sm:gap-x-4">
                <span className="truncate text-[14px] font-[520] tracking-[-0.01em] text-ink sm:text-[15px]">{e.ticker ?? e.target}</span>
                <span className="min-w-0">
                  <span className="block truncate text-[13px] text-muted">{e.is_origin ? "origin" : e.hops.join(" → ")}</span>
                  <span aria-hidden="true" className="mt-1.5 block h-[6px] overflow-hidden rounded-full bg-track">
                    <span
                      className="block h-full rounded-full"
                      style={{
                        width: `${Math.max(0, Math.min(100, e.score * 100))}%`,
                        background: CONTAGION_COLOR[e.contagion] ?? "#7A889C",
                      }}
                    />
                  </span>
                </span>
                <span className="num text-right text-[15px] text-term-text">{(e.score * 100).toFixed(0)}%</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[15px] text-muted">None.</p>
        )}
      </Card>
    </div>
  );
}

function Block({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mt-6 border-t border-[rgba(120,145,180,0.16)] pt-5">
      <Label className="mb-2.5">{label}</Label>
      {children}
    </div>
  );
}

function Figure({ k, v }: { k: string; v: string }) {
  return (
    <div className="min-w-0 rounded-[16px] border border-white/70 bg-white/45 px-3 py-3 sm:px-4">
      <dt className="text-[12.5px] font-[470] capitalize tracking-[-0.01em] text-muted">{k}</dt>
      <dd className="num mt-1.5 truncate text-[24px] font-[300] leading-none tracking-[-0.02em] text-ink md:text-[28px]">{v}</dd>
    </div>
  );
}

function Row({ k, v, note }: { k: string; v: string; note: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-3 first:pt-0">
      <dt className="min-w-0 text-[15px] text-term-text">
        <span className="font-[500]">{k}</span>
        <span className="ml-2.5 text-[13.5px] text-muted">{note}</span>
      </dt>
      <dd className="num shrink-0 text-[16px] text-ink">{v}</dd>
    </div>
  );
}

/** A factor as stored, without rounding digits away (up to 6 places). */
function exact(x: number): string {
  return String(+x.toFixed(6));
}
