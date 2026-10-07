import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { scene, wordAt } from "../timing";
import { C, inter } from "../theme";
import { clamp, expo } from "../ui/motion";
import { Mark } from "../ui/Mark";
import { Words } from "../ui/Words";

/** The mark cascades in; the line the whole product rests on. */
export const Turn: React.FC = () => {
  const s = scene("turn");
  const f = useCurrentFrame();
  const rel = (w: string, n = 0) => wordAt("turn", w, n) - s.from;
  const tName = rel("Cascadr.");
  const tMarkets = rel("Markets");
  const tCascadr2 = rel("Cascadr", 1);
  const p = interpolate(f, [rel("Meet") - 6, tName + 20], [0, 1], clamp);
  const word = interpolate(f, [tName - 2, tName + 16], [0, 1], { ...clamp, easing: expo });
  const lift = interpolate(f, [tMarkets - 8, tMarkets + 12], [0, -110], { ...clamp, easing: expo });
  return (
    <AbsoluteFill style={{ background: C.frame, fontFamily: inter, color: C.ink }}>
      <AbsoluteFill style={{ background: "radial-gradient(45% 55% at 50% 45%, #FFFFFF, transparent 75%)" }} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", transform: `translateY(${lift}px)` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 34 }}>
          <Mark size={170} p={p} />
          <div style={{ fontSize: 176, fontWeight: 520, letterSpacing: "-0.055em", opacity: word, transform: `translateX(${(1 - word) * -30}px)`, clipPath: `inset(0 ${(1 - word) * 100}% 0 0)` }}>Cascadr</div>
        </div>
      </AbsoluteFill>
      <div style={{ position: "absolute", left: 0, right: 0, top: 640, textAlign: "center", fontSize: 54, fontWeight: 300, letterSpacing: "-0.025em", lineHeight: 1.3 }}>
        <div style={{ color: C.muted }}><Words text="Markets price the headline." at={tMarkets} every={3} /></div>
        <div><Words text="Cascadr prices the cascade." at={tCascadr2} every={3} accent={{ "cascade.": C.accent }} /></div>
      </div>
    </AbsoluteFill>
  );
};
