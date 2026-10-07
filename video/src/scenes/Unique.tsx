import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { scene, wordAt } from "../timing";
import { C, inter, mono } from "../theme";
import { ramp } from "../ui/motion";
import { Words } from "../ui/Words";
import { Count } from "../ui/Count";
import data from "../data.json";

/** Three claims, each with its proof. */
export const Unique: React.FC = () => {
  const s = scene("unique");
  const f = useCurrentFrame();
  const rel = (w: string, n = 0) => wordAt("unique", w, n) - s.from;
  const rows: { at: number; text: string; acc: Record<string, string>; proof: React.ReactNode }[] = [
    { at: rel("second"), text: "Second order, not the headline.", acc: { "order,": "#8FB3E6" }, proof: <>trades the companies the news never names</> },
    { at: rel("sourced,"), text: "Sourced, not guessed.", acc: { "sourced,": "#8FB3E6" }, proof: <>{data.counts.links} supply links · every one cited</> },
    { at: rel("public,"), text: "Public, refusals included.", acc: { "public,": "#8FB3E6" }, proof: <><Count to={data.counts.declined} at={rel("two")} dur={40} /> times it chose not to trade</> },
  ];
  return (
    <AbsoluteFill style={{ background: C.night, color: "#EAF0F8", fontFamily: inter }}>
      <AbsoluteFill style={{ background: "radial-gradient(55% 60% at 75% 40%, rgba(74,120,176,0.25), transparent 70%)" }} />
      <div style={{ position: "absolute", left: 150, top: 150, fontSize: 40, fontWeight: 300, color: "rgba(234,240,248,0.7)", letterSpacing: "-0.02em" }}>
        <Words text="What makes Cascadr different?" at={0} every={3} accent={{ "different?": "#8FB3E6" }} />
      </div>
      {rows.map((r, i) => (
        <div key={i} style={{ position: "absolute", left: 150, top: 300 + i * 210, display: "grid", gridTemplateColumns: "90px 1fr", alignItems: "baseline" }}>
          <div style={{ fontFamily: mono, fontSize: 20, color: "rgba(234,240,248,0.45)", opacity: ramp(f, r.at - 6, r.at + 6) }}>0{i + 1}</div>
          <div>
            <div style={{ fontSize: 84, fontWeight: 300, letterSpacing: "-0.04em", lineHeight: 1.05 }}>
              <Words text={r.text} at={r.at - 4} every={3} accent={r.acc} />
            </div>
            <div style={{ marginTop: 10, fontFamily: mono, fontSize: 20, letterSpacing: "0.04em", color: "rgba(234,240,248,0.6)", opacity: ramp(f, r.at + 10, r.at + 26) }}>{r.proof}</div>
          </div>
        </div>
      ))}
    </AbsoluteFill>
  );
};
