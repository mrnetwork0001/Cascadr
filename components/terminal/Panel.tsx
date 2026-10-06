import type { CSSProperties, ReactNode } from "react";

interface PanelProps {
  title: string;
  /** Right-aligned metadata in the header rail, e.g. a live count. */
  meta?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Drops the inner padding for panels that own their own scroll area. */
  flush?: boolean;
}

/*
 * The glass card every module sits in: frosted white over the studio frame, a
 * hairline white edge with an inner highlight, a faint ring for definition on
 * the pale frame, and a soft navy shadow. A touch more opaque than the
 * landing's glass so dense numbers keep their contrast.
 */
const CARD: CSSProperties = {
  background: "linear-gradient(135deg, rgba(255,255,255,0.80), rgba(255,255,255,0.60))",
  border: "1px solid rgba(255,255,255,0.82)",
  WebkitBackdropFilter: "blur(32px) saturate(115%)",
  backdropFilter: "blur(32px) saturate(115%)",
  boxShadow:
    "inset 1px 1px 0 rgba(255,255,255,0.55), 0 0 0 1px rgba(120,145,180,0.13), 0 14px 34px rgba(28,52,92,0.06)",
};

/**
 * The chassis every module sits in: one glass card, one header rail.
 * Panels are always flex columns so their content can own the scroll.
 */
export function Panel({ title, meta, children, className = "", flush }: PanelProps) {
  return (
    <section
      className={`flex min-h-0 flex-col overflow-hidden rounded-[22px] ${className}`}
      style={CARD}
    >
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[rgba(120,145,180,0.14)] px-4 py-[9px]">
        <h2 className="shrink-0 text-[10.5px] font-[560] uppercase leading-4 tracking-[0.12em] text-muted">
          {title}
        </h2>
        <div className="num min-w-0 text-right text-[11px] font-[450] leading-4 text-muted">{meta}</div>
      </header>
      <div className={`min-h-0 flex-1 ${flush ? "" : "p-3"} overflow-hidden`}>
        {children}
      </div>
    </section>
  );
}
