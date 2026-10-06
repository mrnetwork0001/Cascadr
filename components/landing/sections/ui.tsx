import type { ReactNode } from "react";

/**
 * Small shared pieces for the landing sections: soft status pills, labels and
 * the template's chevron knob. Presentation only - every value they show is
 * handed in by the page, which reads it from the API.
 */

export type Tone = "green" | "amber" | "red" | "orange" | "blue" | "violet" | "dim";

/*
 * Text colours are a step darker than the theme's signal colours so an 11px
 * label still clears WCAG AA (4.5:1) on a frosted-glass surface; the tinted
 * fill and border keep the hue recognisable.
 */
export const TONE_TEXT: Record<Tone, string> = {
  green: "text-[#0A6B4A]",
  amber: "text-[#8A520E]",
  red: "text-[#B02A35]",
  orange: "text-[#A3461C]",
  blue: "text-[#2F5F9E]",
  violet: "text-[#5148B8]",
  dim: "text-muted",
};

const TONE_SURFACE: Record<Tone, string> = {
  green: "border-[#0E8A5F]/30 bg-[#0E8A5F]/[0.07]",
  amber: "border-[#A86512]/30 bg-[#A86512]/[0.07]",
  red: "border-[#C8323F]/30 bg-[#C8323F]/[0.06]",
  orange: "border-[#D9622B]/30 bg-[#D9622B]/[0.07]",
  blue: "border-[#4A78B0]/30 bg-[#4A78B0]/[0.07]",
  violet: "border-[#5D52C8]/30 bg-[#5D52C8]/[0.07]",
  dim: "border-[#A7B4C6]/50 bg-white/50",
};

/**
 * The theme's class maps (ACTION_CLASS, PROVENANCE_CLASS, CONTAGION_CLASS)
 * stay the single source of what each state means; this only reads which
 * colour family they chose, so a pill here always agrees with the terminal.
 */
export function toneOf(themeClass: string | undefined): Tone {
  const c = themeClass ?? "";
  if (c.includes("signal-green")) return "green";
  if (c.includes("signal-red")) return "red";
  if (c.includes("D9622B")) return "orange";
  if (c.includes("amber")) return "amber";
  if (c.includes("signal-cyan")) return "blue";
  if (c.includes("signal-violet")) return "violet";
  return "dim";
}

/** A soft status pill: tinted glass, a hairline border and an optional dot. */
export function Chip({
  tone = "dim",
  dot = true,
  children,
  className = "",
}: {
  tone?: Tone;
  dot?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-[5px] text-[10.5px] font-[560] uppercase leading-none tracking-[0.08em] ${TONE_TEXT[tone]} ${TONE_SURFACE[tone]} ${className}`}
    >
      {dot && <span aria-hidden="true" className="h-[5px] w-[5px] rounded-full bg-current" />}
      {children}
    </span>
  );
}

/** Small caps-style label: 11px, wide tracking, muted. */
export function Label({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <p className={`text-[11px] font-[520] uppercase leading-4 tracking-[0.12em] text-muted ${className}`}>{children}</p>
  );
}

/** The template's chevron, drawn white inside a round knob. */
export function Chevron({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="m6.6 3.6 6 5.4-6 5.4" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** A thin diagonal rule between two figures, as in the template's stats row. */
export function Slash({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`block w-[18px] shrink-0 ${className}`}
      style={{
        background:
          "linear-gradient(to top left, transparent calc(50% - 0.8px), #A7B4C6 calc(50% - 0.8px), #A7B4C6 calc(50% + 0.8px), transparent calc(50% + 0.8px))",
      }}
    />
  );
}

/** Soft divider: a hairline that fades out at both ends. */
export function Hairline({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`block h-px w-full ${className}`}
      style={{ background: "linear-gradient(90deg, rgba(167,180,198,0), rgba(167,180,198,0.7) 18%, rgba(167,180,198,0.7) 82%, rgba(167,180,198,0))" }}
    />
  );
}
