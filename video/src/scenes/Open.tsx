import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, random } from "remotion";
import { scene, wordAt } from "../timing";
import { C, inter, mono } from "../theme";
import { clamp, expo, ramp } from "../ui/motion";
import { Words } from "../ui/Words";

/** 07:58 in Hualien: the quake, the breaking bar, and a market that reads it in minutes. */
export const Open: React.FC = () => {
  const s = scene("open");
  const f = useCurrentFrame();
  const rel = (w: string, n = 0) => wordAt("open", w, n) - s.from;
  const quake = rel("earthquake");
  const tTsmc = rel("TSMC");
  const tApril = rel("April");
  const tWithin = rel("Within");
  const tHead = rel("headline.");

  // Seismograph: calm trace, then the quake.
  const W = 1920, N = 240;
  const amp = (i: number) => {
    const t = f - quake;
    const env = t < 0 ? 0.04 : Math.exp(-t / 70) * (t < 8 ? t / 8 : 1);
    const x = i / N;
    const local = Math.exp(-(((x - 0.72) / 0.22) ** 2));
    return (0.06 + env * 3.2 * local) * (random(`s${i}-${Math.floor(f / 2)}`) - 0.5);
  };
  const pts = Array.from({ length: N + 1 }, (_, i) => `${(i / N) * W},${540 + amp(i) * 260}`).join(" ");
  const shake = f > quake && f < quake + 26 ? (random(`k${f}`) - 0.5) * 18 * (1 - (f - quake) / 26) : 0;
  const traceOp = interpolate(f, [0, 20, tApril - 10, tApril + 10], [0, 1, 1, 0.12], clamp);

  const bar = ramp(f, rel("Breaking") - 4, rel("Breaking") + 14);
  const swap = ramp(f, tTsmc - 4, tTsmc + 10);
  const barOut = interpolate(f, [tApril - 6, tApril + 10], [1, 0], clamp);
  const date = ramp(f, tApril, tApril + 18);
  const stamp = interpolate(f, [tHead - 2, tHead + 6], [2.2, 1], { ...clamp, easing: expo });
  const stampOp = interpolate(f, [tHead - 2, tHead + 4], [0, 1], clamp);

  return (
    <AbsoluteFill style={{ background: C.night, color: "#EAF0F8", fontFamily: inter, transform: `translate(${shake}px, ${shake * 0.6}px)` }}>
      <AbsoluteFill style={{ background: "radial-gradient(60% 50% at 72% 50%, rgba(74,120,176,0.22), transparent 70%)" }} />
      <div style={{ position: "absolute", left: 110, top: 150, fontFamily: mono, fontSize: 20, letterSpacing: "0.12em", color: "rgba(234,240,248,0.6)", opacity: ramp(f, 4, 24) }}>
        HUALIEN, TAIWAN · 03 APR 2024 · 07:58 TST
      </div>
      <svg width={1920} height={1080} style={{ position: "absolute", opacity: traceOp }}>
        <polyline points={pts} fill="none" stroke="#7FA6D6" strokeWidth={2.2} strokeLinejoin="round" />
      </svg>
      <div style={{ position: "absolute", left: 110, top: 200, fontFamily: mono, fontSize: 16, color: "rgba(234,240,248,0.4)", opacity: interpolate(f, [quake, quake + 10, tApril, tApril + 8], [0, 1, 1, 0], clamp) }}>
        SEISMIC · M7.4 · 18 KM S OF HUALIEN
      </div>

      {/* The breaking bar */}
      <div style={{ position: "absolute", left: 110, right: 110, top: 760, height: 96, display: "flex", opacity: barOut, transform: `translateX(${(1 - bar) * -80}px)`, clipPath: `inset(0 ${(1 - bar) * 100}% 0 0)` }}>
        <div style={{ background: "#D7362B", color: "#fff", fontWeight: 700, fontSize: 30, letterSpacing: "0.08em", padding: "0 30px", display: "flex", alignItems: "center" }}>BREAKING</div>
        <div style={{ flex: 1, background: "#F4F6FA", color: C.ink, position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", padding: "0 34px", fontSize: 40, fontWeight: 600, letterSpacing: "-0.01em", transform: `translateY(${swap * -100}%)` }}>
            Magnitude 7.4 earthquake strikes Taiwan
          </div>
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", padding: "0 34px", fontSize: 40, fontWeight: 600, letterSpacing: "-0.01em", transform: `translateY(${(1 - swap) * 100}%)` }}>
            TSMC evacuates staff from its chip plants
          </div>
        </div>
      </div>

      {/* April 3 */}
      <AbsoluteFill style={{ justifyContent: "center", paddingLeft: 150, opacity: date }}>
        <div style={{ fontSize: 132, fontWeight: 300, letterSpacing: "-0.04em", lineHeight: 1 }}>
          <Words text="April 3, 2024." at={tApril} every={4} />
        </div>
        <div style={{ marginTop: 34, fontSize: 64, fontWeight: 300, letterSpacing: "-0.03em", color: "rgba(234,240,248,0.82)" }}>
          <Words text="The market read it in minutes." at={tWithin} every={4} accent={{ minutes: "#8FB3E6" }} />
        </div>
        <div style={{ position: "absolute", left: 150, top: 700, display: "flex", alignItems: "center", gap: 20, opacity: stampOp, transform: `scale(${stamp}) rotate(-4deg)`, transformOrigin: "left center" }}>
          <div style={{ border: "4px solid #D7362B", color: "#E2574C", fontFamily: mono, fontWeight: 500, fontSize: 30, letterSpacing: "0.14em", padding: "10px 20px", borderRadius: 8 }}>HEADLINE PRICED</div>
          <div style={{ fontFamily: mono, fontSize: 18, color: "rgba(234,240,248,0.55)" }}>TSMC · the company named</div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
