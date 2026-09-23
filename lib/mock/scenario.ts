import type { NewsItem } from "@/lib/types";

/**
 * Scripted wire feed. The oracle "resolves" each headline to graph entities;
 * `shock` is the severity the traversal propagates from those entities.
 * Swapping this file for a live news socket is the only change needed to go
 * from demo to production ingest.
 */
export interface ScenarioEvent extends NewsItem {
  /** 0..1 magnitude handed to traverseContagion(). */
  shock: number;
  /** Graph node ids the shock originates from. */
  origins: string[];
  /** Milliseconds to wait after the previous event before firing. */
  delayMs: number;
}

export const SCENARIO: ScenarioEvent[] = [
  {
    id: "evt-001",
    ts: "",
    source: "REUTERS",
    headline:
      "M6.4 quake strikes Tainan; TSMC evacuates Fab 18, 3nm lines offline pending tool requalification",
    entities: ["TSMC"],
    origins: ["TSMC"],
    confidence: 0.94,
    severity: "SEVERE",
    shock: 0.88,
    delayMs: 1200,
  },
  {
    id: "evt-002",
    ts: "",
    source: "NIKKEI",
    headline:
      "TSMC: wafer-in-process losses at Fab 18 'material'; N3 output guidance withdrawn for the quarter",
    entities: ["TSMC"],
    origins: ["TSMC"],
    confidence: 0.91,
    severity: "HIGH",
    shock: 0.93,
    delayMs: 5200,
  },
  {
    id: "evt-003",
    ts: "",
    source: "BLOOMBERG",
    headline:
      "Hon Hai halts two Zhengzhou assembly lines citing upstream component shortfall",
    entities: ["FOXCONN"],
    origins: ["FOXCONN"],
    confidence: 0.86,
    severity: "HIGH",
    shock: 0.64,
    delayMs: 6800,
  },
  {
    id: "evt-004",
    ts: "",
    source: "SEC 8-K",
    headline:
      "SK Hynix flags HBM3E qualification delay at Icheon M16; AI accelerator customers notified",
    entities: ["SK_HYNIX"],
    origins: ["SK_HYNIX"],
    confidence: 0.79,
    severity: "MEDIUM",
    shock: 0.47,
    delayMs: 7400,
  },
];

/** Idle-state wire chatter so the feed is never empty before the scenario runs. */
export const AMBIENT_HEADLINES: string[] = [
  "ASML books two additional High-NA EUV systems for 2027 delivery",
  "TPEB container spot rates ease 3.1% w/w — Drewry WCI",
  "Samsung Foundry reports 3nm GAA yield above 70% for mobile customers",
  "CATL commissions second Hungarian cell line ahead of schedule",
  "Maersk reroutes AE7 service; Suez transits remain suspended",
];
