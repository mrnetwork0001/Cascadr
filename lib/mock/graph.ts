import type { GraphEdge, GraphNode } from "@/lib/types";

/**
 * Hand-curated stand-in for the Neo4j knowledge graph the Graph Builder agent
 * will extract from 10-K filings. Dependencies are illustrative but the
 * topology (ASML -> TSMC -> fabless designers -> assemblers -> brands) is real,
 * which is what makes the traversal demo legible.
 */
export const NODES: GraphNode[] = [
  // --- Upstream materials & tooling -----------------------------------------
  { id: "ASML", name: "ASML Holding", ticker: "ASML", tier: "MATERIAL", country: "NL", revenueB: 30.2, price: 1668.66 },
  { id: "SHIN_ETSU", name: "Shin-Etsu Chemical", tier: "MATERIAL", country: "JP", revenueB: 17.1 },
  { id: "LYNAS", name: "Lynas Rare Earths", tier: "MATERIAL", country: "AU", revenueB: 0.5 },

  // --- Fabrication & components ---------------------------------------------
  { id: "TSMC", name: "Taiwan Semiconductor", ticker: "TSM", tier: "SUPPLIER", country: "TW", revenueB: 87.9, price: 431.91 },
  { id: "SK_HYNIX", name: "SK Hynix", tier: "SUPPLIER", country: "KR", revenueB: 41.3 },
  { id: "SAMSUNG", name: "Samsung Electronics", tier: "SUPPLIER", country: "KR", revenueB: 198.4 },
  { id: "SONY", name: "Sony Semiconductor", ticker: "SONY", tier: "SUPPLIER", country: "JP", revenueB: 88.2, price: 23.67 },
  { id: "CATL", name: "CATL", tier: "SUPPLIER", country: "CN", revenueB: 56.0 },

  // --- Assembly & logistics --------------------------------------------------
  { id: "FOXCONN", name: "Hon Hai / Foxconn", tier: "MANUFACTURER", country: "TW", revenueB: 214.6 },
  { id: "PEGATRON", name: "Pegatron", tier: "MANUFACTURER", country: "TW", revenueB: 38.4 },
  { id: "MAERSK", name: "A.P. Moller-Maersk", tier: "LOGISTICS", country: "DK", revenueB: 51.1 },

  // --- Tradable downstream names (Bitget tokenized equities) -----------------
  { id: "NVDA", name: "NVIDIA", ticker: "NVDA", tier: "BRAND", country: "US", revenueB: 130.5, price: 222.37 },
  { id: "AAPL", name: "Apple", ticker: "AAPL", tier: "BRAND", country: "US", revenueB: 391.0, price: 335.45 },
  { id: "AMD", name: "Advanced Micro Devices", ticker: "AMD", tier: "BRAND", country: "US", revenueB: 25.8, price: 553.16 },
  { id: "QCOM", name: "Qualcomm", ticker: "QCOM", tier: "BRAND", country: "US", revenueB: 39.0, price: 178.17 },
  { id: "AVGO", name: "Broadcom", ticker: "AVGO", tier: "BRAND", country: "US", revenueB: 51.6, price: 357.06 },
  { id: "TSLA", name: "Tesla", ticker: "TSLA", tier: "BRAND", country: "US", revenueB: 97.7, price: 364.83 },
  { id: "DELL", name: "Dell Technologies", ticker: "DELL", tier: "BRAND", country: "US", revenueB: 95.6, price: 572.16 },
];

export const EDGES: GraphEdge[] = [
  // Tooling into fabs
  { source: "ASML", target: "TSMC", relation: "SUPPLIES", component: "EUV lithography", dependency: 1.0 },
  { source: "ASML", target: "SAMSUNG", relation: "SUPPLIES", component: "EUV lithography", dependency: 1.0 },
  { source: "SHIN_ETSU", target: "TSMC", relation: "SUPPLIES", component: "300mm wafers", dependency: 0.34 },
  { source: "LYNAS", target: "SONY", relation: "SUPPLIES", component: "rare earth magnets", dependency: 0.22 },

  // Fabs into fabless designers
  { source: "TSMC", target: "NVDA", relation: "FABRICATES", component: "4N / 3nm GPU dies", dependency: 0.92 },
  { source: "TSMC", target: "AAPL", relation: "FABRICATES", component: "3nm A-series / M-series", dependency: 0.95 },
  { source: "TSMC", target: "AMD", relation: "FABRICATES", component: "5nm CPU/GPU chiplets", dependency: 0.88 },
  { source: "TSMC", target: "QCOM", relation: "FABRICATES", component: "4nm Snapdragon SoC", dependency: 0.61 },
  { source: "TSMC", target: "AVGO", relation: "FABRICATES", component: "custom ASIC / SerDes", dependency: 0.74 },
  { source: "SAMSUNG", target: "QCOM", relation: "FABRICATES", component: "4nm SoC (dual-source)", dependency: 0.39 },

  // Memory
  { source: "SK_HYNIX", target: "NVDA", relation: "SUPPLIES", component: "HBM3E stacks", dependency: 0.68 },
  { source: "SAMSUNG", target: "NVDA", relation: "SUPPLIES", component: "HBM3E stacks", dependency: 0.24 },
  { source: "SK_HYNIX", target: "DELL", relation: "SUPPLIES", component: "DDR5 modules", dependency: 0.41 },

  // Imaging & batteries
  { source: "SONY", target: "AAPL", relation: "SUPPLIES", component: "CMOS image sensors", dependency: 0.81 },
  { source: "CATL", target: "TSLA", relation: "SUPPLIES", component: "LFP cells", dependency: 0.46 },
  { source: "SAMSUNG", target: "TSLA", relation: "FABRICATES", component: "FSD inference SoC", dependency: 0.83 },

  // Assembly
  { source: "FOXCONN", target: "AAPL", relation: "ASSEMBLES", component: "iPhone final assembly", dependency: 0.67 },
  { source: "PEGATRON", target: "AAPL", relation: "ASSEMBLES", component: "iPhone final assembly", dependency: 0.19 },
  { source: "FOXCONN", target: "NVDA", relation: "ASSEMBLES", component: "GB200 rack integration", dependency: 0.52 },
  { source: "FOXCONN", target: "DELL", relation: "ASSEMBLES", component: "server chassis", dependency: 0.44 },

  // Freight
  { source: "MAERSK", target: "AAPL", relation: "SHIPS", component: "TPEB container freight", dependency: 0.28 },
  { source: "MAERSK", target: "DELL", relation: "SHIPS", component: "TPEB container freight", dependency: 0.31 },
];

export const NODE_BY_ID = new Map(NODES.map((n) => [n.id, n]));

/** Outbound adjacency, i.e. "who depends on me" — the direction shock travels. */
export const DOWNSTREAM = EDGES.reduce<Map<string, GraphEdge[]>>((acc, e) => {
  const list = acc.get(e.source) ?? [];
  list.push(e);
  acc.set(e.source, list);
  return acc;
}, new Map());
