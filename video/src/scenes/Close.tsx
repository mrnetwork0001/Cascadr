import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { scene, wordAt } from "../timing";
import { C, inter, mono } from "../theme";
import { clamp, expo, ramp } from "../ui/motion";
import { Mark } from "../ui/Mark";
import { Words } from "../ui/Words";

/** The card. */
export const Close: React.FC = () => {
  const s = scene("close");
  const f = useCurrentFrame();
  const rel = (w: string, n = 0) => wordAt("close", w, n) - s.from;
  const tName = rel("Cascadr.");
  const p = interpolate(f, [0, tName + 26], [0, 1], clamp);
  const word = interpolate(f, [tName - 4, tName + 14], [0, 1], { ...clamp, easing: expo });
  const end = interpolate(f, [s.durationInFrames - 24, s.durationInFrames], [1, 0], clamp);
  return (
    <AbsoluteFill style={{ background: C.frame, fontFamily: inter, color: C.ink, opacity: end }}>
      <AbsoluteFill style={{ background: "radial-gradient(45% 55% at 50% 42%, #FFFFFF, transparent 75%)" }} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 34, marginTop: -60 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 30 }}>
          <Mark size={140} p={p} />
          <div style={{ fontSize: 150, fontWeight: 520, letterSpacing: "-0.055em", opacity: word, clipPath: `inset(0 ${(1 - word) * 100}% 0 0)` }}>Cascadr</div>
        </div>
        <div style={{ fontSize: 60, fontWeight: 300, letterSpacing: "-0.03em" }}>
          <Words text="Trade the cascade." at={rel("Trade") - 2} every={4} accent={{ "cascade.": C.accent }} />
        </div>
        <div style={{ marginTop: 12, display: "flex", gap: 14, opacity: ramp(f, rel("Trade") + 20, rel("Trade") + 40) }}>
          <span style={{ padding: "14px 26px", borderRadius: 999, background: C.ink, color: "#fff", fontFamily: mono, fontSize: 22 }}>trycascadr.vercel.app</span>
          <span style={{ padding: "14px 26px", borderRadius: 999, background: "rgba(255,255,255,0.7)", border: "1px solid #DCE3EC", fontFamily: mono, fontSize: 18, color: C.ink2, display: "flex", alignItems: "center" }}>Bitget AI Hackathon S2 · Agentic Trading · Event-Driven Agent</span>
        </div>
        <div style={{ fontFamily: mono, fontSize: 15, color: C.muted, letterSpacing: "0.06em", opacity: ramp(f, rel("Trade") + 34, rel("Trade") + 54) }}>
          paper trading on Bitget's demo exchange · every decision public
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
