import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { scene, wordAt } from "../timing";
import { C, inter, mono } from "../theme";
import { clamp } from "../ui/motion";
import { Words } from "../ui/Words";

/** What a human would need, at three in the morning. */
export const Gap: React.FC = () => {
  const s = scene("gap");
  const f = useCurrentFrame();
  const rel = (w: string, n = 0) => wordAt("gap", w, n) - s.from;
  const tWho = rel("who"), tMuch = rel("much."), tThree = rel("three"), tDecide = rel("decide");
  const fade = interpolate(f, [tDecide - 8, tDecide + 4], [1, 0.18], clamp);
  const sec = Math.max(0, f - tThree);
  const clock = `03:00:${String(Math.floor(sec / 30) % 60).padStart(2, "0")}`;
  return (
    <AbsoluteFill style={{ background: C.frame, fontFamily: inter, color: C.ink }}>
      <div style={{ position: "absolute", left: 160, top: 250, fontSize: 92, fontWeight: 300, letterSpacing: "-0.04em", lineHeight: 1.12, opacity: fade }}>
        <div><Words text="Who depends on whom?" at={tWho - 4} every={3} accent={{ "whom?": C.accent }} /></div>
        <div><Words text="By how much?" at={tMuch - 10} every={3} accent={{ "much?": C.accent }} /></div>
        <div><Words text="At 3 a.m.?" at={tThree - 4} every={3} accent={{ "a.m.?": C.accent }} /></div>
      </div>
      <div style={{ position: "absolute", right: 170, top: 300, fontFamily: mono, fontSize: 76, color: C.ink2, opacity: interpolate(f, [tThree - 4, tThree + 8, tDecide, tDecide + 10], [0, 1, 1, 0.2], clamp) }}>
        {clock}
        <div style={{ fontSize: 18, letterSpacing: "0.12em", color: C.muted, marginTop: 8 }}>TAIPEI · US MARKETS CLOSED</div>
      </div>
      <div style={{ position: "absolute", left: 160, top: 760, fontSize: 70, fontWeight: 400, letterSpacing: "-0.035em" }}>
        <Words text="Decide fast. Without guessing." at={tDecide} every={4} accent={{ "guessing.": C.red }} />
      </div>
    </AbsoluteFill>
  );
};
