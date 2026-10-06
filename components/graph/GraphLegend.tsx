import { GRAPH_GLASS, TIER_TINT } from "@/components/graph/GraphCanvas";
import { CONTAGION_COLOR, COLORS } from "@/lib/theme";
import type { Contagion, Tier } from "@/lib/types";

const TIERS: Tier[] = ["MATERIAL", "SUPPLIER", "MANUFACTURER", "BRAND"];
const STATES: Contagion[] = ["WATCH", "STRESSED", "CRITICAL"];

function titleCase(s: string): string {
  return s.charAt(0) + s.slice(1).toLowerCase();
}

/** A hex colour at an alpha, for swatch rings and halos. */
function alpha(hex: string, a: number): string {
  const n = parseInt(hex.replace("#", ""), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/**
 * The key to the canvas, drawn with the same marks the canvas uses: a tinted
 * hairline ring means tier until a node is hit, then a soft halo means
 * severity; the accent line is the selected decision's contagion route.
 * Collapses to a pill so it never sits on a narrow graph uninvited.
 */
export function GraphLegend({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <div
      className={`${GRAPH_GLASS} absolute right-3 top-3 z-10 overflow-hidden ${
        open ? "rounded-[18px]" : "rounded-full"
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls="graph-key"
        className="flex h-8 w-full items-center gap-2 rounded-full pl-3 pr-1 text-left text-[11.5px] font-[520] tracking-[-0.01em] text-ink-soft outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-deep"
      >
        <span className="flex-1">Graph key</span>
        <span
          aria-hidden="true"
          className="flex h-6 w-6 items-center justify-center rounded-full bg-white/80 shadow-[0_0_0_1px_rgba(120,145,180,0.22)]"
        >
          <svg
            viewBox="0 0 18 18"
            className={`h-3 w-3 transition-transform duration-300 ease-[cubic-bezier(.2,.75,.28,1)] motion-reduce:transition-none ${
              open ? "-rotate-90" : "rotate-90"
            }`}
            fill="none"
          >
            <path d="m6.6 3.6 6 5.4-6 5.4" stroke="#0F1B31" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>
      {open && (
        <div id="graph-key" className="space-y-2.5 px-3 pb-3 pt-0.5">
          <Group title="Tier">
            {TIERS.map((t) => (
              <Row key={t} label={titleCase(t)}>
                <span
                  className="block h-3 w-3 rounded-full bg-white"
                  style={{
                    boxShadow: `inset 0 0 0 1.5px ${alpha(TIER_TINT[t], 0.75)}, 0 1px 3px rgba(28,52,92,0.16)`,
                  }}
                />
              </Row>
            ))}
          </Group>
          <Group title="Contagion">
            {STATES.map((s) => (
              <Row key={s} label={titleCase(s)}>
                <span
                  className="block h-2 w-2 rounded-full"
                  style={{
                    backgroundColor: CONTAGION_COLOR[s],
                    boxShadow: `0 0 0 2.5px ${alpha(CONTAGION_COLOR[s], 0.18)}, 0 0 9px ${alpha(CONTAGION_COLOR[s], 0.55)}`,
                  }}
                />
              </Row>
            ))}
          </Group>
          <Group title="Marks">
            <Row label="Contagion path">
              <svg viewBox="0 0 18 8" className="h-2 w-[18px]" aria-hidden="true">
                <path d="M1 4h11" stroke={COLORS.accent} strokeWidth="1.6" strokeLinecap="round" />
                <path d="M17 4 11.5 1.3l1.3 2.7-1.3 2.7z" fill="#2F5F9E" />
              </svg>
            </Row>
            <Row label="Selected">
              <span className="block h-3 w-3 rounded-full bg-white shadow-[0_0_0_1.5px_#4A78B0,0_0_0_4px_rgba(74,120,176,0.16)]" />
            </Row>
          </Group>
        </div>
      )}
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-[10px] font-[520] uppercase tracking-[0.12em] text-muted">{title}</p>
      <ul className="space-y-[3px]">{children}</ul>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2">
      <span className="flex w-[18px] shrink-0 items-center justify-center" aria-hidden="true">
        {children}
      </span>
      <span className="text-[11.5px] font-[450] tracking-[-0.01em] text-muted-2">{label}</span>
    </li>
  );
}
