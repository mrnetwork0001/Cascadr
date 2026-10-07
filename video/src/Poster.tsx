import React from "react";
import { AbsoluteFill } from "remotion";
import { C, inter, mono, serif } from "./theme";
import { Mark } from "./ui/Mark";

/** Thumbnail for the film. */
export const Poster: React.FC = () => (
  <AbsoluteFill style={{ background: C.frame, fontFamily: inter, color: C.ink, alignItems: "center", justifyContent: "center" }}>
    <AbsoluteFill style={{ background: "radial-gradient(45% 55% at 50% 45%, #FFFFFF, transparent 75%)" }} />
    <div style={{ display: "flex", alignItems: "center", gap: 30 }}>
      <Mark size={150} />
      <div style={{ fontSize: 160, fontWeight: 520, letterSpacing: "-0.055em" }}>Cascadr</div>
    </div>
    <div style={{ marginTop: 30, fontSize: 64, fontWeight: 300, letterSpacing: "-0.03em" }}>
      Markets price the headline. <span style={{ fontFamily: serif, fontStyle: "italic", color: C.accent }}>Cascadr prices the cascade.</span>
    </div>
    <div style={{ marginTop: 40, fontFamily: mono, fontSize: 20, color: C.muted }}>Bitget AI Hackathon S2 · Agentic Trading · Event-Driven Agent</div>
  </AbsoluteFill>
);
