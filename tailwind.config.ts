import type { Config } from "tailwindcss";

/**
 * CASCADR - light glass theme: a pale studio frame, frosted-glass surfaces,
 * ink type in Inter, one blue accent, and red/green reserved for risk + P&L.
 */
const config: Config = {
  content: [
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    // Class maps live in lib/theme.ts (decision, provenance, contagion badges);
    // without this they are never generated.
    "./lib/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        /*
         * Light glass theme. The token NAMES are kept from the original dark
         * terminal so every existing class re-themes in one place; the values
         * are now the light studio palette.
         */
        term: {
          void: "#E6EDF6", // the frame behind everything
          bg: "#EDF2F8",
          panel: "#F8FAFD",
          raised: "#EEF3F9",
          line: "#D7DFEA",
          edge: "#C4CEDC",
          dim: "#59627E",
          text: "#1F2A44",
          bright: "#020C21",
        },
        // Caution / warm emphasis, dark enough to read on the light frame.
        amber: {
          DEFAULT: "#A86512",
          dim: "#E8D2B0",
        },
        signal: {
          green: "#0E8A5F",
          red: "#C8323F",
          cyan: "#2D74A8",
          violet: "#5D52C8",
        },
        tier: {
          material: "#5D52C8",
          supplier: "#2D74A8",
          manufacturer: "#B26A12",
          logistics: "#7A889C",
          brand: "#0E8A5F",
        },
        // The glass design system.
        frame: "#E6EDF6",
        ink: { DEFAULT: "#020C21", soft: "#0F182F" },
        muted: { DEFAULT: "#59627E", 2: "#4D5B77" },
        accent: { DEFAULT: "#4A78B0", deep: "#2F5F9E", fill: "#5F88B4" },
        cta: { DEFAULT: "#0F1B31", knob: "#384B64" },
        track: "#DDE4EE",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "Inter", "Helvetica Neue", "Helvetica", "Arial", "sans-serif"],
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
          "0%": { backgroundColor: "rgba(14,138,95,0.18)" },
          "100%": { backgroundColor: "transparent" },
        },
        "flash-red": {
          "0%": { backgroundColor: "rgba(200,50,63,0.18)" },
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
