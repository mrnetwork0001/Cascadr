import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { scene, wordAt } from "../timing";
import { C, inter, mono, serif } from "../theme";
import { clamp, expo, pop, ramp } from "../ui/motion";
import { Browser } from "../ui/Footage";
import { Glass } from "../ui/Glass";
import { Count } from "../ui/Count";
import data from "../data.json";

/** The LLM reads like an analyst, and mostly says no. */
export const Reason: React.FC = () => {
  const s = scene("reason");
  const f = useCurrentFrame();
  const rel = (w: string, n = 0) => wordAt("reason", w, n) - s.from;
  const qs: [string, string, number][] = [
    ["Which company is hit?", "named, then checked against the graph", rel("Which")],
    ["How badly?", "a shock from 0 to 1, with confidence", rel("badly,")],
    ["What would change its mind?", "written down with every call", rel("change")],
  ];
  const tMost = rel("Most");
  // This decision's own shock (the one open in the footage): over the floor, and the LLM still passed.
  const meter = interpolate(f, [rel("zero") - 4, rel("zero") + 30], [0, data.tradeCall.shock], { ...clamp, easing: expo });
  return (
    <AbsoluteFill style={{ background: C.frame, fontFamily: inter, color: C.ink }}>
      <Browser name="why" url="trycascadr.vercel.app/terminal" width={1120} left={110} top={160} focus={{ x: 1188, y: 151, w: 385, h: 420 }} zoom={1.75} focusAt={[80, 130]} enter={0} />
      <div style={{ position: "absolute", left: 1320, top: 160, width: 500, display: "flex", flexDirection: "column", gap: 18 }}>
        {qs.map(([q, a, at], i) => {
          const p = pop(f, at - 2);
          return (
            <Glass key={q} style={{ padding: "20px 24px", opacity: Math.min(1, p), transform: `translateX(${(1 - p) * 40}px)` }}>
              <div style={{ fontSize: 28, fontWeight: 500, letterSpacing: "-0.02em" }}>{q}</div>
              <div style={{ marginTop: 6, fontSize: 18, color: C.muted }}>{a}</div>
              {i === 1 && (
                <div style={{ marginTop: 14, height: 10, borderRadius: 5, background: "rgba(2,12,33,0.08)", position: "relative" }}>
                  <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${meter * 100}%`, borderRadius: 5, background: C.accent }} />
                  <div style={{ position: "absolute", left: "25%", top: -6, bottom: -6, width: 2, background: C.red, opacity: 0.6 }} />
                  <div style={{ position: "absolute", left: "25%", top: 16, fontFamily: mono, fontSize: 13, color: C.red, transform: "translateX(-50%)" }}>floor 0.25</div>
                  <div style={{ position: "absolute", left: `${meter * 100}%`, top: 16, fontFamily: mono, fontSize: 13, color: C.accentDeep, transform: "translateX(-50%)", opacity: meter > 0.3 ? 1 : 0 }}>{meter.toFixed(2)}</div>
                </div>
              )}
            </Glass>
          );
        })}
      </div>
      <div style={{ position: "absolute", left: 1320, top: 760, width: 520, opacity: ramp(f, tMost - 4, tMost + 14) }}>
        <div style={{ fontSize: 96, fontWeight: 200, letterSpacing: "-0.04em", lineHeight: 1 }}><Count to={data.counts.declined} at={tMost} dur={50} /></div>
        <div style={{ fontSize: 26, marginTop: 8 }}>headlines it read and <span style={{ fontFamily: serif, fontStyle: "italic", fontSize: 32, color: C.accent }}>declined</span>, each with its reason</div>
      </div>
    </AbsoluteFill>
  );
};
