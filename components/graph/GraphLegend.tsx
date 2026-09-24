import { CONTAGION_COLOR, TIER_COLOR } from "@/lib/theme";
import type { Contagion, Tier } from "@/lib/types";

const TIERS: Tier[] = ["MATERIAL", "SUPPLIER", "MANUFACTURER", "BRAND"];
const STATES: Contagion[] = ["WATCH", "STRESSED", "CRITICAL"];

/** Two keys, because colour means tier until a node is hit, then severity. */
export function GraphLegend() {
  return (
    <div className="pointer-events-none absolute right-2 top-2 hidden space-y-1.5 sm:block border border-term-line bg-term-panel/90 px-2 py-1.5 backdrop-blur-sm">
      <Group title="Tier" items={TIERS.map((t) => [t, TIER_COLOR[t]])} />
      <Group title="Contagion" items={STATES.map((s) => [s, CONTAGION_COLOR[s]])} />
    </div>
  );
}

function Group({ title, items }: { title: string; items: [string, string][] }) {
  return (
    <div>
      <p className="col-head mb-0.5">{title}</p>
      <ul className="space-y-0.5">
        {items.map(([label, color]) => (
          <li key={label} className="flex items-center gap-1.5">
            <span
              className="h-[7px] w-[7px] rounded-full"
              style={{ backgroundColor: color }}
            />
            <span className="text-2xs text-term-dim">{label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
