import React from "react";
import { interpolate } from "remotion";
import { evolvePath } from "@remotion/paths";
import { C } from "../theme";
import { clamp, expo } from "./motion";

/**
 * The Cascadr mark (three nodes descending along one chain), animatable:
 * `p` 0..1 draws the chain and drops each node in turn.
 */
export const Mark: React.FC<{ size: number; p?: number; ink?: string; accent?: string }> = ({ size, p = 1, ink = "#0d1b30", accent = C.accent }) => {
  const line = evolvePath(interpolate(p, [0.1, 0.75], [0, 1], { ...clamp, easing: expo }), "M9.5 9.5 21 21.5l9 9");
  const n1 = interpolate(p, [0, 0.25], [0, 1], { ...clamp, easing: expo });
  const n2 = interpolate(p, [0.3, 0.55], [0, 1], { ...clamp, easing: expo });
  const n3 = interpolate(p, [0.55, 0.85], [0, 1], { ...clamp, easing: expo });
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <path d="M9.5 9.5 21 21.5l9 9" stroke={ink} strokeWidth={2.2} strokeLinecap="round" strokeDasharray={line.strokeDasharray} strokeDashoffset={line.strokeDashoffset} />
      <circle cx={9.5} cy={9.5} r={6.2 * n1} fill={ink} />
      <circle cx={21} cy={21.5} r={3.9 * n2} fill={accent} />
      <circle cx={30.5} cy={31} r={5.6} fill="none" stroke={ink} strokeWidth={2.2} opacity={n3} transform={`translate(${30.5 * (1 - n3)} ${31 * (1 - n3)}) scale(${n3})`} />
    </svg>
  );
};
