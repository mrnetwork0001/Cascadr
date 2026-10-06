/**
 * The Cascadr mark and wordmark, drawn in SVG so it sits on any surface: three
 * nodes descending along one chain - a disruption cascading downstream.
 * Height drives size; the wordmark is set in Inter to match the interface.
 */
export function CascadrMark({ size = 24, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path d="M9.5 9.5 21 21.5l9 9" stroke="#0d1b30" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="9.5" cy="9.5" r="6.2" fill="#0d1b30" />
      <circle cx="21" cy="21.5" r="3.9" fill="#4A78B0" />
      <circle cx="30.5" cy="31" r="5.6" fill="none" stroke="#0d1b30" strokeWidth="2.2" />
    </svg>
  );
}

export function Logo({
  height = 24,
  className = "",
}: {
  height?: number;
  /** Kept for call-site compatibility with the old image logo. */
  priority?: boolean;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center ${className}`} style={{ height }} aria-label="Cascadr">
      <CascadrMark size={height} />
      <b
        className="text-ink"
        style={{
          fontSize: height * 0.6,
          fontWeight: 520,
          letterSpacing: "-0.03em",
          lineHeight: 1,
          marginLeft: height * 0.22,
        }}
      >
        Cascadr
      </b>
    </span>
  );
}
