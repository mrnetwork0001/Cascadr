import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadMono } from "@remotion/google-fonts/GeistMono";
import { loadFont as loadSerif } from "@remotion/google-fonts/InstrumentSerif";

export const inter = loadInter("normal", { weights: ["200", "300", "400", "500", "600"], subsets: ["latin"] }).fontFamily;
export const mono = loadMono("normal", { weights: ["400", "500"], subsets: ["latin"] }).fontFamily;
export const serif = loadSerif("italic", { weights: ["400"], subsets: ["latin"] }).fontFamily;

/** Cascadr's palette: the app's pale frame, ink and denim accent, plus a night navy. */
export const C = {
  frame: "#E6EDF6",
  paper: "#F5F8FC",
  white: "#FFFFFF",
  ink: "#020C21",
  ink2: "#1F2A44",
  muted: "#59627E",
  line: "#C9D4E3",
  accent: "#4A78B0",
  accentDeep: "#2F5F9E",
  cobalt: "#2B57B8",
  navy: "#0B1424",
  night: "#060B15",
  red: "#C8323F",
  green: "#0E8A5F",
  amber: "#A86512",
};

export type Tone = "light" | "night" | "blue";
export const TONE: Record<Tone, { bg: string; ink: string; muted: string; line: string }> = {
  light: { bg: C.frame, ink: C.ink, muted: C.muted, line: "rgba(2,12,33,0.12)" },
  night: { bg: C.night, ink: "#EAF0F8", muted: "rgba(234,240,248,0.55)", line: "rgba(234,240,248,0.14)" },
  blue: { bg: C.cobalt, ink: "#FFFFFF", muted: "rgba(255,255,255,0.7)", line: "rgba(255,255,255,0.22)" },
};

/** Which look each scene uses; the corner chrome and captions follow it. */
export const SCENE_TONE: Record<string, Tone> = {
  open: "night", problem: "light", evidence: "blue", gap: "light", turn: "light",
  sense: "light", reason: "light", graph: "light", decide: "light", act: "light",
  unique: "night", close: "light",
};

export const SCENE_LABEL: Record<string, string> = {
  open: "01 · the headline", problem: "02 · the cascade", evidence: "03 · the evidence", gap: "04 · the gap",
  turn: "05 · cascadr", sense: "06 · sense", reason: "07 · reason", graph: "08 · propagate",
  decide: "09 · decide", act: "10 · act", unique: "11 · why it's different", close: "12 · trade the cascade",
};

export const EXPO = [0.16, 1, 0.3, 1] as const;
