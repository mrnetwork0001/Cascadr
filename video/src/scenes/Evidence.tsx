import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { evolvePath } from "@remotion/paths";
import { scene, wordAt } from "../timing";
import { inter, mono, serif } from "../theme";
import { clamp, expo, ramp } from "../ui/motion";
import { Count } from "../ui/Count";

// Mean cumulative abnormal return vs the semiconductor ETF (SMH), from
// backend/research/README.md: day 0, day +1, days +1..+3, days +1..+5.
const CAR = [{ x: "day 0", v: 0.36 }, { x: "+1", v: -1.03 }, { x: "+1 to +3", v: -2.0 }, { x: "+1 to +5", v: -3.29 }];

/** The research, on the brand blue: the drift after the headline, and the overnight share. */
export const Evidence: React.FC = () => {
  const s = scene("evidence");
  const f = useCurrentFrame();
  const rel = (w: string, n = 0) => wordAt("evidence", w, n) - s.from;
  const t0 = rel("Across"), tDown = rel("downstream"), tFive = rel("five");
  const tAnd = rel("And"), tForty = rel("forty"), tNight = rel("overnight,");

  // chart geometry
  const X0 = 160, X1 = 960, Y0 = 330, SC = 100; // y = Y0 - v*SC
  const px = (i: number) => X0 + (i / (CAR.length - 1)) * (X1 - X0);
  const py = (v: number) => Y0 - v * SC;
  const d = CAR.map((c, i) => `${i ? "L" : "M"} ${px(i)} ${py(c.v)}`).join(" ");
  const draw = interpolate(f, [tDown - 6, tFive + 20], [0, 1], { ...clamp, easing: expo });
  const ev = evolvePath(draw, d);
  const chartOp = interpolate(f, [t0 - 6, t0 + 10, tAnd - 4, tAnd + 10], [0, 1, 1, 0.25], clamp);

  const clock = interpolate(f, [tForty - 4, tForty + 30], [0, 0.42], { ...clamp, easing: expo });
  const clockOp = ramp(f, tAnd - 2, tAnd + 14);
  const R = 165, CX = 1480, CY = 440;
  const arc = (p: number) => {
    const a = p * Math.PI * 2 - Math.PI / 2;
    return `M ${CX} ${CY - R} A ${R} ${R} 0 ${p > 0.5 ? 1 : 0} 1 ${CX + R * Math.cos(a)} ${CY + R * Math.sin(a)}`;
  };

  return (
    <AbsoluteFill style={{ background: "#2B57B8", color: "#fff", fontFamily: inter }}>
      <AbsoluteFill style={{ background: "radial-gradient(70% 60% at 30% 40%, rgba(255,255,255,0.12), transparent 70%)" }} />
      <div style={{ position: "absolute", left: 140, top: 130, fontFamily: mono, fontSize: 16, letterSpacing: "0.1em", color: "rgba(255,255,255,0.7)", opacity: ramp(f, t0 - 4, t0 + 10) }}>
        DOWNSTREAM COMPANIES VS THE CHIP INDEX · MEAN CUMULATIVE RETURN
      </div>
      <div style={{ opacity: chartOp }}>
        <svg width={1920} height={1080} style={{ position: "absolute", top: 0 }}>
          <line x1={X0} x2={X1} y1={Y0} y2={Y0} stroke="rgba(255,255,255,0.35)" strokeDasharray="6 8" strokeWidth={2} />
          <text x={X1 + 16} y={Y0 + 6} fill="rgba(255,255,255,0.6)" fontFamily={mono} fontSize={16}>chip index</text>
          <path d={d} fill="none" stroke="#fff" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={ev.strokeDasharray} strokeDashoffset={ev.strokeDashoffset} />
          {CAR.map((c, i) => {
            const on = interpolate(draw, [i / (CAR.length - 1) - 0.02, i / (CAR.length - 1) + 0.05], [0, 1], clamp);
            return (
              <g key={c.x} opacity={on}>
                <circle cx={px(i)} cy={py(c.v)} r={9} fill="#fff" />
                <text x={px(i) + (i === CAR.length - 1 ? 22 : 0)} y={py(c.v) + (c.v > 0 ? -22 : i === CAR.length - 1 ? 8 : 42)} textAnchor={i === CAR.length - 1 ? "start" : "middle"} fill="#fff" fontFamily={mono} fontSize={20}>{c.v > 0 ? "+" : "−"}{Math.abs(c.v).toFixed(2)}%</text>
                <text x={px(i)} y={Y0 + 400} textAnchor="middle" fill="rgba(255,255,255,0.6)" fontFamily={mono} fontSize={16}>{c.x}</text>
              </g>
            );
          })}
        </svg>
        <div style={{ position: "absolute", left: 140, top: 770, display: "flex", alignItems: "baseline", gap: 26 }}>
          <span style={{ fontSize: 120, fontWeight: 200, letterSpacing: "-0.04em" }}>
            <Count to={-3.29} at={tFive - 6} dur={30} decimals={2} suffix="%" />
          </span>
          <span style={{ fontSize: 26, color: "rgba(255,255,255,0.8)", maxWidth: 420, lineHeight: 1.3 }}>over five trading days, negative for <b>every</b> company studied</span>
        </div>
      </div>

      <div style={{ opacity: clockOp }}>
        <svg width={1920} height={1080} style={{ position: "absolute" }}>
          <circle cx={CX} cy={CY} r={R} fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth={34} />
          {clock > 0.001 && <path d={arc(clock)} fill="none" stroke="#0B1424" strokeWidth={34} />}
        </svg>
        <div style={{ position: "absolute", left: CX - 140, top: CY - 70, width: 280, textAlign: "center" }}>
          <div style={{ fontSize: 96, fontWeight: 200, letterSpacing: "-0.04em", lineHeight: 1 }}><Count to={42} at={tForty - 4} dur={30} suffix="%" /></div>
          <div style={{ fontFamily: serif, fontStyle: "italic", fontSize: 40, marginTop: 6 }}>overnight</div>
        </div>
        <div style={{ position: "absolute", left: CX - 260, top: CY + R + 50, width: 520, textAlign: "center", fontSize: 24, color: "rgba(255,255,255,0.85)", opacity: ramp(f, tNight, tNight + 14) }}>
          of the first day's move came while US markets were closed. Bitget's stock perps trade then.
        </div>
      </div>
      <div style={{ position: "absolute", left: 140, top: 162, fontFamily: mono, fontSize: 13, letterSpacing: "0.06em", color: "rgba(255,255,255,0.6)", opacity: ramp(f, t0, t0 + 20) }}>
        EVENT STUDY · 3 VERIFIED DISRUPTIONS · 7 COMPANY PAIRS · 5 FROM ONE EARTHQUAKE · A SMALL SAMPLE
      </div>
    </AbsoluteFill>
  );
};
