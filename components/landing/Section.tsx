import type { ReactNode } from "react";

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
 * Every landing section shares one rhythm: numbered rail, eyebrow, heading,
 * optional lede, then content. Consistency is what makes a dense page readable.
 */
export function Section({ index, eyebrow, title, lede, children, id }: SectionProps) {
  return (
    <section id={id} className="border-t border-term-line px-5 py-14 md:px-6 md:py-20">
      <div className="mx-auto max-w-[81rem]">
        <div className="flex items-center gap-3">
          <span className="text-2xs font-semibold text-amber">{index}</span>
          <span className="h-px w-6 bg-term-edge" />
          <span className="text-2xs uppercase tracking-[0.22em] text-term-dim">
            {eyebrow}
          </span>
        </div>

        <h2 className="mt-4 max-w-3xl text-xl font-semibold leading-tight text-term-bright md:text-2xl">
          {title}
        </h2>

        {lede && (
          <p className="mt-3 max-w-2xl text-xs leading-relaxed text-term-text md:text-sm">
            {lede}
          </p>
        )}

        {children && <div className="mt-8">{children}</div>}
      </div>
    </section>
  );
}

/** Bordered content card used throughout the page. */
export function Card({
  label,
  children,
  accent = "amber",
}: {
  label?: string;
  children: ReactNode;
  accent?: "amber" | "red" | "cyan" | "green" | "dim";
}) {
  const bar = {
    amber: "bg-amber",
    red: "bg-signal-red",
    cyan: "bg-signal-cyan",
    green: "bg-signal-green",
    dim: "bg-term-edge",
  }[accent];

  return (
    <div className="relative min-w-0 border border-term-line bg-term-panel p-4">
      <span className={`absolute left-0 top-0 h-full w-[2px] ${bar}`} />
      {label && (
        <p className="col-head mb-2">{label}</p>
      )}
      {children}
    </div>
  );
}
