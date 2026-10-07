import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { evolvePath } from "@remotion/paths";
import { scene, wordAt } from "../timing";
import { C, inter, mono } from "../theme";
import { clamp, expo, pop, ramp } from "../ui/motion";
import { Node } from "../ui/Node";
import { Glass } from "../ui/Glass";
import { Words } from "../ui/Words";
import data from "../data.json";

const DOWN = [
  { id: "NVDA", name: "NVIDIA", word: "NVIDIA," },
  { id: "AMD", name: "AMD", word: "AMD," },
  { id: "AAPL", name: "Apple", word: "Apple," },
  { id: "QCOM", name: "Qualcomm", word: "Qualcomm" },
  { id: "AVGO", name: "Broadcom", word: "Broadcom." },
];
const O = { x: 620, y: 600 };
const pos = (i: number) => ({ x: 1420, y: 250 + i * 160 });

/** One company named; the shock travels to five that were not. */
export const Problem: React.FC = () => {
  const s = scene("problem");
  const f = useCurrentFrame();
  const rel = (w: string, n = 0) => wordAt("problem", w, n) - s.from;
  const tOne = rel("one");
  const tDamage = rel("damage");
  const tNone = rel("None");
  const dep = (id: string) => data.tsmcDownstream.find((d) => d.target === id)?.dependency ?? 0;

  const head = ramp(f, 4, 24);
  const origin = pop(f, tOne - 2);
  const ring = interpolate(f, [tDamage, tDamage + 40], [0, 1], clamp);
  const none = ramp(f, tNone, tNone + 16);

  return (
    <AbsoluteFill style={{ background: C.frame, fontFamily: inter, color: C.ink }}>
      <AbsoluteFill style={{ background: "radial-gradient(50% 60% at 30% 55%, rgba(255,255,255,0.9), transparent 70%)" }} />
      <Glass style={{ position: "absolute", left: 140, top: 150, width: 860, padding: "26px 32px", opacity: head, transform: `translateY(${(1 - head) * 20}px)` }}>
        <div style={{ fontFamily: mono, fontSize: 15, letterSpacing: "0.1em", color: C.muted }}>THE HEADLINE</div>
        <div style={{ marginTop: 10, fontSize: 38, fontWeight: 500, letterSpacing: "-0.02em" }}>TSMC evacuates staff from its chip plants</div>
        <div style={{ marginTop: 16, display: "flex", gap: 12, fontFamily: mono, fontSize: 16 }}>
          <span style={{ padding: "6px 12px", borderRadius: 999, background: "rgba(74,120,176,0.12)", color: C.accentDeep }}>companies named: 1</span>
          <span style={{ padding: "6px 12px", borderRadius: 999, background: "rgba(200,50,63,0.1)", color: C.red, opacity: none }}>companies exposed: 5 more</span>
        </div>
      </Glass>

      <svg width={1920} height={1080} style={{ position: "absolute" }}>
        {DOWN.map((d, i) => {
          const t = rel(d.word);
          const p = interpolate(f, [t - 10, t + 8], [0, 1], { ...clamp, easing: expo });
          const b = pos(i);
          const path = `M ${O.x} ${O.y} C ${O.x + 360} ${O.y}, ${b.x - 420} ${b.y}, ${b.x - 60} ${b.y}`;
          const ev = evolvePath(p, path);
          const run = ((f - t) % 50) / 50;
          return (
            <g key={d.id}>
              <path d={path} stroke={C.accent} strokeWidth={3} fill="none" strokeDasharray={ev.strokeDasharray} strokeDashoffset={ev.strokeDashoffset} opacity={0.85} />
              {p >= 1 && f > t + 8 && (() => {
                // a pulse running down the link
                const tt = run;
                const x = (1 - tt) ** 3 * O.x + 3 * (1 - tt) ** 2 * tt * (O.x + 360) + 3 * (1 - tt) * tt ** 2 * (b.x - 420) + tt ** 3 * (b.x - 60);
                const y = (1 - tt) ** 3 * O.y + 3 * (1 - tt) ** 2 * tt * O.y + 3 * (1 - tt) * tt ** 2 * b.y + tt ** 3 * b.y;
                return <circle cx={x} cy={y} r={6} fill={C.accentDeep} opacity={0.9} />;
              })()}
            </g>
          );
        })}
        <circle cx={O.x} cy={O.y} r={80 + ring * 520} fill="none" stroke={C.red} strokeWidth={3} opacity={f >= tDamage ? (1 - ring) * 0.6 : 0} />
      </svg>

      <Node id="TSMC" label="TSMC" sub="in the headline" size={150} x={O.x} y={O.y} scale={origin} ring={f > tDamage ? "rgba(200,50,63,0.55)" : undefined} />
      {DOWN.map((d, i) => {
        const t = rel(d.word);
        const sc = pop(f, t);
        const b = pos(i);
        return (
          <div key={d.id}>
            <Node id={d.id} size={92} x={b.x} y={b.y} scale={sc} />
            <div style={{ position: "absolute", left: b.x + 70, top: b.y - 26, opacity: sc, fontWeight: 520, fontSize: 30, letterSpacing: "-0.02em" }}>{d.name}</div>
            <div style={{ position: "absolute", left: b.x + 70, top: b.y + 10, opacity: sc, fontFamily: mono, fontSize: 15, color: C.muted }}>
              depends on TSMC · {dep(d.id).toFixed(2)}
            </div>
            <div style={{ position: "absolute", left: b.x + 70, top: b.y + 34, opacity: none, fontFamily: mono, fontSize: 13, letterSpacing: "0.1em", color: C.red }}>NOT IN THE HEADLINE</div>
          </div>
        );
      })}
      <div style={{ position: "absolute", left: 140, top: 800, fontSize: 52, fontWeight: 300, letterSpacing: "-0.03em" }}>
        <Words text="The damage travels." at={tDamage} every={4} accent={{ "travels.": C.red }} />
      </div>
    </AbsoluteFill>
  );
};
