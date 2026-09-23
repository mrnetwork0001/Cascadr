import type { ReactNode } from "react";

interface PanelProps {
  title: string;
  /** Right-aligned metadata in the header rail, e.g. a live count. */
  meta?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Drops the inner padding for panels that own their own scroll area. */
  flush?: boolean;
}

/**
 * The chassis every module sits in: one hairline border, one header rail.
 * Panels are always flex columns so their content can own the scroll.
 */
export function Panel({ title, meta, children, className = "", flush }: PanelProps) {
  return (
    <section
      className={`flex min-h-0 flex-col border border-term-line bg-term-panel ${className}`}
    >
      <header className="flex shrink-0 items-center justify-between border-b border-term-line bg-term-raised px-2 py-1">
        <h2 className="text-2xs font-semibold uppercase tracking-[0.18em] text-amber">
          {title}
        </h2>
        <div className="text-2xs text-term-dim">{meta}</div>
      </header>
      <div className={`min-h-0 flex-1 ${flush ? "" : "p-2"} overflow-hidden`}>
        {children}
      </div>
    </section>
  );
}
