import type { Config } from "tailwindcss";

/**
 * CASCADR terminal theme.
 * Palette is deliberately narrow: black chassis, amber chrome, and
 * red/green reserved exclusively for risk + P&L signalling.
 */
const config: Config = {
  content: [
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        term: {
          void: "#05070a",
          bg: "#0a0d12",
          panel: "#0d1117",
          raised: "#121821",
          line: "#1e2732",
          edge: "#2b3644",
          dim: "#5c6b7f",
          text: "#b9c6d4",
          bright: "#e6eef7",
        },
        amber: {
          DEFAULT: "#ffa726",
          dim: "#8a5a12",
        },
        signal: {
          green: "#00e08a",
          red: "#ff3b52",
          cyan: "#22d3ee",
          violet: "#a78bfa",
        },
        tier: {
          material: "#a78bfa",
          supplier: "#22d3ee",
          manufacturer: "#ffa726",
          logistics: "#94a3b8",
          brand: "#00e08a",
        },
      },
      fontFamily: {
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      fontSize: {
        "2xs": ["10px", { lineHeight: "14px", letterSpacing: "0.04em" }],
        xs: ["11px", { lineHeight: "16px" }],
        sm: ["12px", { lineHeight: "18px" }],
      },
      keyframes: {
        "pulse-alarm": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.35" },
        },
        "flash-green": {
          "0%": { backgroundColor: "rgba(0,224,138,0.28)" },
          "100%": { backgroundColor: "transparent" },
        },
        "flash-red": {
          "0%": { backgroundColor: "rgba(255,59,82,0.28)" },
          "100%": { backgroundColor: "transparent" },
        },
        "sweep": {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(400%)" },
        },
      },
      animation: {
        "pulse-alarm": "pulse-alarm 1s steps(2, end) infinite",
        "flash-green": "flash-green 700ms ease-out 1",
        "flash-red": "flash-red 700ms ease-out 1",
        sweep: "sweep 1.6s linear infinite",
      },
    },
  },
  plugins: [],
};
export default config;
