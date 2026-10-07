import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { scene, wordAt } from "../timing";
import { C, inter, mono, serif } from "../theme";
import { pop, ramp } from "../ui/motion";
import { Browser } from "../ui/Footage";
import { Glass } from "../ui/Glass";
import data from "../data.json";

/** The source-cited graph: every link carries its evidence. */
export const Graph: React.FC = () => {
  const s = scene("graph");
  const f = useCurrentFrame();
  const rel = (w: string, n = 0) => wordAt("graph", w, n) - s.from;
  const e = data.edge;
  const src = e.sources.find((x) => (x.publisher || "").startsWith("NVIDIA")) ?? e.sources[0];
  const card = pop(f, rel("Every") - 4);
  const hl = (w: string) => ramp(f, rel(w) - 2, rel(w) + 8);
  const field = (label: string, value: React.ReactNode, w: string) => (
    <div style={{ display: "grid", gridTemplateColumns: "150px 1fr", gap: 16, padding: "12px 0", borderTop: "1px solid rgba(2,12,33,0.08)", background: `rgba(74,120,176,${0.1 * hl(w)})`, margin: "0 -14px", paddingLeft: 14, paddingRight: 14, borderRadius: 10 }}>
      <div style={{ fontFamily: mono, fontSize: 14, letterSpacing: "0.08em", color: C.muted, paddingTop: 4 }}>{label}</div>
      <div style={{ fontSize: 20, lineHeight: 1.4, color: C.ink2 }}>{value}</div>
    </div>
  );
  return (
    <AbsoluteFill style={{ background: C.frame, fontFamily: inter, color: C.ink }}>
      <Browser name="graph" url="trycascadr.vercel.app/terminal" width={1060} left={100} top={190} focus="graph" zoom={1.55} focusAt={[rel("travels") - 6, rel("travels") + 36]} enter={0} />
      <Glass style={{ position: "absolute", left: 1220, top: 150, width: 620, padding: "26px 30px", opacity: Math.min(1, card), transform: `translateY(${(1 - card) * 30}px)` }}>
        <div style={{ fontFamily: mono, fontSize: 14, letterSpacing: "0.1em", color: C.muted }}>ONE LINK, AS STORED</div>
        <div style={{ marginTop: 10, fontSize: 40, fontWeight: 500, letterSpacing: "-0.03em" }}>TSMC <span style={{ color: C.accent }}>→</span> NVIDIA</div>
        <div style={{ marginTop: 4, fontSize: 19, color: C.muted }}>{e.component}</div>
        <div style={{ marginTop: 16 }}>
          {field("SOURCE", <>{src.publisher}</>, "filings,")}
          {field("QUOTE", <span style={{ fontFamily: serif, fontStyle: "italic", fontSize: 24 }}>“{src.quote}”</span>, "quotes,")}
          {field("DATE", <>{src.date}</>, "dates,")}
          {field("DEPENDS", <><b style={{ fontWeight: 600 }}>{e.dependency.toFixed(2)}</b> · sole supplier for these dies</>, "depends")}
        </div>
      </Glass>
      <div style={{ position: "absolute", left: 1222, top: 900, fontFamily: mono, fontSize: 17, color: C.muted, opacity: ramp(f, rel("public"), rel("public") + 14) }}>
        {data.counts.companies} companies · {data.counts.links} links · every one cited
      </div>
    </AbsoluteFill>
  );
};
