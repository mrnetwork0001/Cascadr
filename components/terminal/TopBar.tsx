"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { NODES } from "@/lib/mock/graph";
import { clock, signedPct, usd } from "@/lib/format";
import type { Phase } from "@/hooks/useCascadrEngine";

interface Props {
  phase: Phase;
  prices: Record<string, number>;
  onRun: () => void;
  onReset: () => void;
}

const TAPE = NODES.filter((n) => n.ticker);

const PHASE_CLASS: Record<Phase, string> = {
  IDLE: "border-term-edge text-term-dim",
  RUNNING: "border-signal-red text-signal-red animate-pulse-alarm",
  COMPLETE: "border-signal-green text-signal-green",
};

export function TopBar({ phase, prices, onRun, onReset }: Props) {
  // Rendered empty on the server: a wall-clock value would not survive hydration.
  const [now, setNow] = useState("--:--:--");
  useEffect(() => {
    const tick = () => setNow(clock());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <header className="flex shrink-0 items-stretch border-b border-term-line bg-term-panel">
      <Link
        href="/"
        title="Back to overview"
        className="group flex items-center gap-2 border-r border-term-line px-3 transition-colors hover:bg-term-raised"
      >
        <Logo height={18} priority />
        <span className="hidden text-2xs uppercase tracking-widest text-term-dim group-hover:text-amber lg:inline">
          supply-chain contagion engine
        </span>
      </Link>

      {/* Tokenized equity tape — the instruments the agent can actually hit. */}
      <div className="flex min-w-0 flex-1 items-center gap-4 overflow-hidden px-3">
        {TAPE.map((n) => {
          const px = prices[n.id] ?? n.price ?? 0;
          const chg = n.price ? ((px - n.price) / n.price) * 100 : 0;
          const tone =
            chg > 0.001
              ? "text-signal-green"
              : chg < -0.001
                ? "text-signal-red"
                : "text-term-dim";
          return (
            <span key={n.id} className="flex shrink-0 items-baseline gap-1">
              <span className="text-2xs font-semibold text-term-text">
                {n.ticker}
              </span>
              <span className="num text-2xs text-term-bright">{usd(px)}</span>
              <span className={`num text-2xs ${tone}`}>{signedPct(chg)}</span>
            </span>
          );
        })}
      </div>

      <div className="flex shrink-0 items-center gap-2 border-l border-term-line px-3">
        <span className={`border px-1.5 py-0.5 text-2xs font-semibold ${PHASE_CLASS[phase]}`}>
          {phase}
        </span>
        <button
          type="button"
          onClick={onRun}
          disabled={phase === "RUNNING"}
          className="border border-signal-red px-2 py-0.5 text-2xs font-semibold uppercase tracking-widest text-signal-red hover:bg-signal-red hover:text-term-void disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-signal-red"
        >
          Run scenario
        </button>
        <button
          type="button"
          onClick={onReset}
          className="border border-term-edge px-2 py-0.5 text-2xs font-semibold uppercase tracking-widest text-term-dim hover:border-amber hover:text-amber"
        >
          Reset
        </button>
        <span className="num w-[62px] text-right text-xs text-amber">{now}</span>
      </div>
    </header>
  );
}
