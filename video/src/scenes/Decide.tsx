import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { scene, wordAt } from "../timing";
import { C, inter, mono, serif } from "../theme";
import { clamp, expo, pop, ramp } from "../ui/motion";
import { Glass } from "../ui/Glass";
import data from "../data.json";

/** The LLM's trade call, field by field - here a real, reasoned pass. */
export const Decide: React.FC = () => {
  const s = scene("decide");
  const f = useCurrentFrame();
  const rel = (w: string, n = 0) => wordAt("decide", w, n) - s.from;
  const tc = data.tradeCall;
  const c = tc.call;
  const card = pop(f, rel("trade") - 8);
  const row = (w: string) => ramp(f, rel(w) - 4, rel(w) + 10);
  const conv = interpolate(f, [rel("confident") - 2, rel("confident") + 24], [0, c.conviction], { ...clamp, easing: expo });
  const tReason = rel("reason");
  const chars = Math.floor(interpolate(f, [tReason - 4, tReason + 70], [0, c.reason.length], clamp));
  const Field: React.FC<{ k: string; w: string; children: React.ReactNode }> = ({ k, w, children }) => (
    <div style={{ display: "grid", gridTemplateColumns: "210px 1fr", alignItems: "center", gap: 18, padding: "16px 0", borderTop: "1px solid rgba(2,12,33,0.08)", opacity: 0.25 + 0.75 * row(w) }}>
      <div style={{ fontFamily: mono, fontSize: 15, letterSpacing: "0.08em", color: C.muted }}>{k}</div>
      <div style={{ fontSize: 26, color: C.ink }}>{children}</div>
    </div>
  );
  return (
    <AbsoluteFill style={{ background: C.frame, fontFamily: inter, color: C.ink }}>
      <AbsoluteFill style={{ background: "radial-gradient(50% 60% at 60% 50%, #FFFFFF, transparent 75%)" }} />
      {/* candidates the graph proposed */}
      <div style={{ position: "absolute", left: 120, top: 220, width: 420, opacity: ramp(f, 0, 16) }}>
        <div style={{ fontFamily: mono, fontSize: 14, letterSpacing: "0.1em", color: C.muted }}>CANDIDATES FROM THE GRAPH</div>
        <div style={{ marginTop: 14, fontSize: 22, color: C.ink2, lineHeight: 1.4 }}>“{tc.headline}”</div>
        <div style={{ marginTop: 8, fontFamily: mono, fontSize: 14, color: C.muted }}>{tc.source}</div>
        <div style={{ marginTop: 26, display: "flex", flexDirection: "column", gap: 12, fontFamily: mono, fontSize: 18 }}>
          <span style={{ padding: "10px 14px", borderRadius: 12, background: "#fff", border: "1px solid #DCE3EC" }}>{c.symbol} · SK hynix, directly hit</span>
          <span style={{ padding: "10px 14px", borderRadius: 12, background: "#fff", border: "1px solid #DCE3EC" }}>shock {tc.shock.toFixed(2)} · listed on Bitget demo</span>
        </div>
      </div>
      <Glass style={{ position: "absolute", left: 620, top: 150, width: 1180, padding: "30px 40px", opacity: Math.min(1, card), transform: `scale(${0.96 + 0.04 * Math.min(1, card)})` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div style={{ fontFamily: mono, fontSize: 15, letterSpacing: "0.12em", color: C.accentDeep }}>LLM TRADE CALL · CLAUDE-OPUS-5 VIA 0G</div>
          <div style={{ fontFamily: mono, fontSize: 14, color: C.muted }}>{c.symbol}</div>
        </div>
        <div style={{ marginTop: 14 }}>
          <Field k="SHORT OR PASS" w="short">
            <span style={{ display: "inline-flex", gap: 10 }}>
              <span style={{ padding: "6px 16px", borderRadius: 999, border: "1px solid #DCE3EC", color: C.muted }}>short</span>
              <span style={{ padding: "6px 16px", borderRadius: 999, background: row("pass,") > 0.5 ? C.ink : "transparent", color: row("pass,") > 0.5 ? "#fff" : C.muted, border: "1px solid #0B1424" }}>pass</span>
            </span>
          </Field>
          <Field k="CONVICTION" w="confident">
            <span style={{ display: "inline-flex", alignItems: "center", gap: 16 }}>
              <span style={{ width: 300, height: 10, borderRadius: 5, background: "rgba(2,12,33,0.08)", position: "relative", display: "inline-block" }}>
                <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${conv * 100}%`, background: C.accent, borderRadius: 5 }} />
              </span>
              <span style={{ fontFamily: mono }}>{conv.toFixed(2)}</span>
              <span style={{ fontSize: 18, color: C.muted }}>sets the size: 10–50% of the account</span>
            </span>
          </Field>
          <Field k="TAKE-PROFIT" w="profit"><span style={{ fontFamily: mono }}>{c.take_profit_pct.toFixed(1)}%</span></Field>
          <Field k="HOLD" w="hold,"><span style={{ fontFamily: mono }}>{c.hold_hours} h</span></Field>
          <Field k="REASON" w="reason">
            <span style={{ fontFamily: serif, fontStyle: "italic", fontSize: 27, lineHeight: 1.35 }}>“{c.reason.slice(0, chars)}{chars < c.reason.length ? "▍" : "”"}</span>
          </Field>
        </div>
      </Glass>
      <div style={{ position: "absolute", left: 120, top: 560, width: 420, fontFamily: mono, fontSize: 14, lineHeight: 1.6, letterSpacing: "0.06em", color: C.muted, opacity: ramp(f, 10, 30) }}>
        LIVE DECISION #{tc.id} · {tc.at.toUpperCase()} · MADE BY THE AGENT ON ITS OWN. IT PASSED; NOTHING WAS TRADED.
      </div>
    </AbsoluteFill>
  );
};
