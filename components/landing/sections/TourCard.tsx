/** The four panels of the terminal, each with a simple line icon. */
export type TourIcon = "news" | "graph" | "log" | "positions";

export function TourCard({ icon, title, body }: { icon: TourIcon; title: string; body: string }) {
  return (
    <article className="glass flex min-w-0 flex-col rounded-[24px] p-6 md:rounded-[28px] md:p-7">
      {/* Icon beside the title on phones, above it from the small breakpoint up. */}
      <div className="flex items-center gap-4 sm:block">
        <span
          aria-hidden="true"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/90 shadow-[0_0_22px_8px_rgba(255,255,255,0.45),0_6px_16px_rgba(28,52,92,0.06)]"
        >
          <Icon name={icon} />
        </span>
        <h3 className="text-[20px] font-[440] tracking-[-0.025em] text-ink sm:mt-6">{title}</h3>
      </div>
      <p className="mt-4 text-[14.5px] leading-[1.6] text-muted-2 sm:mt-2.5">{body}</p>
    </article>
  );
}

function Icon({ name }: { name: TourIcon }) {
  const common = {
    width: 20,
    height: 20,
    viewBox: "0 0 20 20",
    fill: "none",
    stroke: "#202940",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (name) {
    case "news":
      return (
        <svg {...common}>
          <rect x="2.5" y="3" width="15" height="14" rx="2.2" />
          <path d="M5.8 7h8.4M5.8 10h8.4M5.8 13h5" />
        </svg>
      );
    case "graph":
      return (
        <svg {...common}>
          <path d="m5.2 5.2 5 5.3 4.4 4.3" />
          <circle cx="5" cy="5" r="2.6" fill="#202940" />
          <circle cx="10.2" cy="10.5" r="1.7" fill="#4A78B0" stroke="none" />
          <circle cx="15" cy="15" r="2.4" />
        </svg>
      );
    case "log":
      return (
        <svg {...common}>
          <path d="M8 5.5h9M8 10h9M8 14.5h6" />
          <path d="m2.8 5.4 1.1 1.1 2-2.2M2.8 9.9l1.1 1.1 2-2.2" />
          <circle cx="4" cy="14.5" r="1.1" />
        </svg>
      );
    case "positions":
      return (
        <svg {...common}>
          <path d="M2.5 16.5h15" />
          <path d="M3.5 6.5 8 10.2l3-2.6 5.5 5.4" />
          <path d="M13.3 13h3.2V9.8" />
        </svg>
      );
  }
}
