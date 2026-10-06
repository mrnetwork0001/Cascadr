import type { ReactNode } from "react";
import { Label } from "@/components/landing/sections/ui";
import "@/components/landing/sections/gutter.css";

/**
 * The horizontal rhythm shared by everything below the hero. The gutter is the
 * hero's own edge, tier for tier (see gutter.css), and there is no width cap:
 * the hero spans the full width, so a capped column would step inward at the
 * seam on wide screens.
 */
export const CONTAINER = "cx-gutter w-full";

interface SectionProps {
  /** Two-digit rail number, e.g. "01". */
  index: string;
  eyebrow: string;
  title: ReactNode;
  lede?: ReactNode;
  children?: ReactNode;
  id?: string;
}

/**
 * Every landing section shares one rhythm: the numbered rail (which doubles as
 * the soft divider between sections), a thin display heading with its lede
 * beside it on wide screens, then the content.
 */
export function Section({ index, eyebrow, title, lede, children, id }: SectionProps) {
  const titleId = id ? `${id}-title` : undefined;
  return (
    <section id={id} aria-labelledby={titleId} className="relative scroll-mt-6 py-20 md:py-28">
      <div className={CONTAINER}>
        <div className="flex items-center gap-4">
          <span className="glass-pill num inline-flex h-8 min-w-[2.75rem] items-center justify-center px-3 text-[12px] font-[520] tracking-[0.02em] text-ink-soft">
            {index}
          </span>
          <span className="whitespace-nowrap text-[15px] font-[470] tracking-[-0.015em] text-muted">{eyebrow}</span>
          <span
            aria-hidden="true"
            className="h-px min-w-6 flex-1"
            style={{ background: "linear-gradient(90deg, rgba(167,180,198,0.75), rgba(167,180,198,0))" }}
          />
        </div>

        <div className="mt-9 grid gap-5 md:mt-11 lg:grid-cols-12 lg:items-end lg:gap-x-12">
          <h2
            id={titleId}
            className="max-w-[17em] text-balance text-[clamp(2.05rem,1.2rem+2.75vw,3.6rem)] font-[340] leading-[1.05] tracking-[-0.035em] text-ink lg:col-span-7"
          >
            {title}
          </h2>
          {lede && (
            <p className="max-w-[40rem] text-[15.5px] leading-[1.62] tracking-[-0.008em] text-muted-2 md:text-[16.5px] lg:col-span-5 lg:pb-1.5">
              {lede}
            </p>
          )}
        </div>

        {children && <div className="mt-12 md:mt-16">{children}</div>}
      </div>
    </section>
  );
}

const DOT = {
  amber: "bg-amber",
  red: "bg-signal-red",
  cyan: "bg-accent",
  green: "bg-signal-green",
  dim: "bg-[#A7B4C6]",
} as const;

/** Glass content card used throughout the page; the dot carries its accent. */
export function Card({
  label,
  children,
  accent = "amber",
  className = "",
}: {
  label?: string;
  children: ReactNode;
  accent?: keyof typeof DOT;
  className?: string;
}) {
  return (
    <div className={`glass relative min-w-0 rounded-[24px] p-6 md:rounded-[28px] md:p-8 ${className}`}>
      {label && (
        <Label className="mb-5 flex items-center gap-2.5">
          <span aria-hidden="true" className={`h-[7px] w-[7px] rounded-full ${DOT[accent]}`} />
          {label}
        </Label>
      )}
      {children}
    </div>
  );
}
