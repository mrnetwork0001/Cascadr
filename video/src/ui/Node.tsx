import React from "react";
import { Img, staticFile } from "remotion";
import { inter, mono } from "../theme";

/** A company in the graph: its round listing icon and a label. */
export const Node: React.FC<{
  id: string; label?: string; size?: number; x: number; y: number; scale?: number; opacity?: number;
  ring?: string; dim?: boolean; sub?: string; ink?: string;
}> = ({ id, label, size = 96, x, y, scale = 1, opacity = 1, ring, dim, sub, ink = "#020C21" }) => (
  <div style={{ position: "absolute", left: x - size / 2, top: y - size / 2, width: size, height: size, transform: `scale(${scale})`, opacity }}>
    <div style={{
      width: size, height: size, borderRadius: "50%", overflow: "hidden", background: "#fff",
      boxShadow: `0 0 0 ${ring ? 5 : 2}px ${ring ?? "rgba(255,255,255,0.9)"}, 0 14px 34px rgba(11,26,50,0.18)`,
      filter: dim ? "grayscale(1) opacity(0.45)" : undefined,
    }}>
      <Img src={staticFile(`logos/${id}.svg`)} style={{ width: "100%", height: "100%" }} />
    </div>
    {label && (
      <div style={{ position: "absolute", top: size + 12, left: -60, right: -60, textAlign: "center", fontFamily: inter, fontWeight: 520, fontSize: Math.max(16, size * 0.2), color: ink, letterSpacing: "-0.01em" }}>
        {label}
        {sub && <div style={{ fontFamily: mono, fontWeight: 400, fontSize: 13, letterSpacing: "0.06em", opacity: 0.6, marginTop: 2 }}>{sub}</div>}
      </div>
    )}
  </div>
);
