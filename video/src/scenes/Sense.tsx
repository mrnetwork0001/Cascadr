import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { scene, wordAt } from "../timing";
import { C, inter, mono } from "../theme";
import { pop, ramp } from "../ui/motion";
import { Browser } from "../ui/Footage";
import { Glass } from "../ui/Glass";
import { Count } from "../ui/Count";
import data from "../data.json";

/** The live terminal: news in, around the clock. */
export const Sense: React.FC = () => {
  const s = scene("sense");
  const f = useCurrentFrame();
  const rel = (w: string, n = 0) => wordAt("sense", w, n) - s.from;
  const chips: [string, number][] = [
    ["every 10 min", rel("ten")],
    ["24 / 7", rel("clock,")],
    [`${data.counts.companies} companies`, rel("nineteen")],
  ];
  return (
    <AbsoluteFill style={{ background: C.frame, fontFamily: inter }}>
      <Browser name="terminal" url="trycascadr.vercel.app/terminal" width={1360} left={280} top={140} focus="news" zoom={1.9} focusAt={[rel("reads") - 6, rel("reads") + 40]} enter={0} tilt={8} />
      <div style={{ position: "absolute", left: 280, top: 76, display: "flex", gap: 12 }}>
        {chips.map(([t, at]) => {
          const p = pop(f, at);
          return (
            <span key={t} style={{ transform: `scale(${p})`, opacity: p, padding: "10px 18px", borderRadius: 999, background: C.ink, color: "#fff", fontFamily: mono, fontSize: 17, letterSpacing: "0.04em" }}>{t}</span>
          );
        })}
      </div>
      <Glass style={{ position: "absolute", right: 90, top: 760, padding: "22px 28px", opacity: ramp(f, rel("autonomous"), rel("autonomous") + 14) }}>
        <div style={{ fontFamily: mono, fontSize: 14, letterSpacing: "0.1em", color: C.muted }}>HEADLINES READ SINCE 24 SEP</div>
        <div style={{ fontSize: 64, fontWeight: 300, letterSpacing: "-0.03em", color: C.ink }}><Count to={data.counts.headlines} at={rel("autonomous")} dur={60} /></div>
      </Glass>
    </AbsoluteFill>
  );
};
