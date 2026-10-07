import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { scene, wordAt } from "../timing";
import { C, inter, mono } from "../theme";
import { clamp, expo, pop, ramp } from "../ui/motion";
import { Glass } from "../ui/Glass";
import data from "../data.json";

/** Guardrails, then Bitget: risk engine -> Agent Hub -> the demo exchange, and the 4-hour review. */
export const Act: React.FC = () => {
  const s = scene("act");
  const f = useCurrentFrame();
  const rel = (w: string, n = 0) => wordAt("act", w, n) - s.from;
  const steps = [
    { t: "LLM trade call", sub: "short or pass · size · target · hold", at: 0 },
    { t: "Risk engine", sub: "caps per root cause, headline, symbol · 15% drawdown halt", at: rel("risk") },
    { t: "Bitget Agent Hub", sub: "official agent MCP · paper trading", at: rel("Agent") },
    { t: "Bitget demo exchange", sub: "fills, fees and positions from Bitget", at: rel("Bitget's") },
  ];
  const X = [120, 560, 1000, 1440], Y = 250, W = 380;
  const wire = interpolate(f, [0, rel("Bitget's") + 10], [0, 1], clamp);
  const o = data.order;
  const ticket = pop(f, rel("Bitget's") + 6);
  const tStop = rel("hard");
  const tFour = rel("four");
  const spin = interpolate(f, [tFour, tFour + 90], [0, 360], clamp);
  return (
    <AbsoluteFill style={{ background: C.frame, fontFamily: inter, color: C.ink }}>
      <svg width={1920} height={1080} style={{ position: "absolute" }}>
        <line x1={X[0] + W / 2} x2={X[3] + W / 2} y1={Y + 80} y2={Y + 80} stroke="#C9D4E3" strokeWidth={3} />
        <line x1={X[0] + W / 2} x2={X[0] + W / 2 + (X[3] - X[0]) * wire} y1={Y + 80} y2={Y + 80} stroke={C.accent} strokeWidth={3} />
        <circle cx={X[0] + W / 2 + (X[3] - X[0]) * wire} cy={Y + 80} r={9} fill={C.accentDeep} opacity={wire < 1 ? 1 : 0} />
      </svg>
      {steps.map((st, i) => {
        const p = pop(f, st.at);
        const lit = f >= st.at;
        return (
          <Glass key={st.t} style={{ position: "absolute", left: X[i], top: Y, width: W - 20, padding: "22px 24px", minHeight: 160, transform: `scale(${0.9 + 0.1 * Math.min(1, p)})`, opacity: 0.35 + 0.65 * Math.min(1, p), outline: lit ? `2px solid ${C.accent}` : "none" }}>
            <div style={{ fontFamily: mono, fontSize: 13, letterSpacing: "0.1em", color: C.muted }}>0{i + 1}</div>
            <div style={{ marginTop: 6, fontSize: 30, fontWeight: 500, letterSpacing: "-0.02em" }}>{st.t}</div>
            <div style={{ marginTop: 8, fontSize: 18, color: C.muted, lineHeight: 1.35 }}>{st.sub}</div>
          </Glass>
        );
      })}
      <div style={{ position: "absolute", left: 560, top: 470, fontFamily: mono, fontSize: 18, color: C.red, opacity: ramp(f, tStop, tStop + 12) }}>+ a hard 6% stop-loss on every position</div>

      <Glass style={{ position: "absolute", left: 1000, top: 560, width: 800, padding: "26px 30px", opacity: Math.min(1, ticket), transform: `translateY(${(1 - Math.min(1, ticket)) * 40}px)` }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontFamily: mono, fontSize: 14, letterSpacing: "0.1em", color: C.muted }}>
          <span>ORDER · {o.venue.toUpperCase()}</span><span>REAL FILL · 7 OCT 2026</span>
        </div>
        <div style={{ marginTop: 12, fontSize: 46, fontWeight: 400, letterSpacing: "-0.03em" }}>
          <span style={{ color: C.red, fontWeight: 600 }}>{o.side}</span> {o.qty} {o.symbol}
        </div>
        <div style={{ marginTop: 8, fontFamily: mono, fontSize: 20, color: C.ink2 }}>filled at {o.price.toFixed(2)} · {o.notional.toLocaleString("en-US")} USDT · stop {o.stop.toFixed(2)}</div>
        <div style={{ position: "absolute", right: 30, top: 70, transform: `rotate(-8deg) scale(${interpolate(f, [rel("Bitget's") + 16, rel("Bitget's") + 24], [1.8, 1], { ...clamp, easing: expo })})`, opacity: ramp(f, rel("Bitget's") + 16, rel("Bitget's") + 22), border: `3px solid ${C.green}`, color: C.green, fontFamily: mono, fontSize: 22, letterSpacing: "0.12em", padding: "6px 14px", borderRadius: 8 }}>FILLED</div>
      </Glass>

      <div style={{ position: "absolute", left: 120, top: 600, display: "flex", alignItems: "center", gap: 28, opacity: ramp(f, tFour - 4, tFour + 12) }}>
        <svg width={150} height={150} viewBox="0 0 100 100" style={{ transform: `rotate(${spin}deg)` }}>
          <circle cx={50} cy={50} r={40} fill="none" stroke="#C9D4E3" strokeWidth={6} />
          <path d="M50 10 A40 40 0 1 1 15 70" fill="none" stroke={C.accent} strokeWidth={6} strokeLinecap="round" />
          <path d="M8 62 L15 72 L24 63" fill="none" stroke={C.accent} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <div>
          <div style={{ fontSize: 40, fontWeight: 400, letterSpacing: "-0.03em" }}>Every 4 hours</div>
          <div style={{ fontSize: 22, color: C.muted, marginTop: 4, maxWidth: 560 }}>the LLM re-reads each open thesis against the news since entry: hold, or close</div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
