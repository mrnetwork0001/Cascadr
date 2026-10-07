"""The supply-chain graph the agent reasons over.

Nodes are 19 companies in the electronics supply chain. Node size is the
latest full fiscal year's revenue from the company's income statement, as
served by Yahoo Finance, converted to USD at the exchange rate on the fiscal
year-end date.

Edges live in data/edges.json, each with the evidence behind its dependency
figure: the sources (URL, publisher, date and a quote that appears on the
page), the reasoning from sources to number, the period it describes, a
confidence grade, caveats and any counter-evidence. They came from a research
pass on 2026-09-24 in which each supplier's links were researched from primary
pages and then independently re-checked. The links into Alphabet, Meta and
Amazon were added on 2026-10-07 from primary pages, each quote checked
against the raw page text, without a second independent verifier. Each of
those three buys AI accelerators from several named suppliers and designs its
own, so every link into them is scoped to the company's AI accelerator supply
and weighted "one of several" (0.25). One hop at 0.25 stays below the trade
threshold, so they are traded when a headline shocks them directly, not
through contagion.

Provenance classes (weakest wins along a path, see app.traversal):

    DISCLOSED    the share is stated in a filing or official statement
    REPORTED     a specific share published by a named analyst or outlet
    QUALITATIVE  the relationship is sourced, but only described in words;
                 the number comes from one fixed mapping:
                     sole / only / exclusive supplier   0.95
                     primary / main supplier            0.70
                     one of two named suppliers         0.50
                     one of several named suppliers     0.25

Links that could not be sourced were removed, not kept with a guessed weight;
data/edges.json lists them under "removed" with the reason. That removal left
Lynas Rare Earths and A.P. Moller-Maersk with no sourced link to any other
company, so they are no longer in the graph.

Tickers are underlying equities, which on Bitget trade as stock perpetual
futures (f"{ticker}USDT") and can therefore be shorted. Tokenized xStocks
(AAPLx, NVDAx) are spot-only and deliberately not referenced. Two tickers are
the base Bitget lists rather than a home-market code: SAMSUNG (SAMSUNGUSDT
tracks one Samsung Electronics common share, 005930.KS, in USD) and SKHY (SK
hynix's Nasdaq ADS, listed July 2026; one ADS is a tenth of a 000660.KS
share). Both were checked on 2026-10-07 against Bitget's live contract list
and its demo exchange's instrument list.
"""

import json
from pathlib import Path

from app.models import GraphEdge, GraphNode, Tier

_YF = "Yahoo Finance income statement"


def _node(
    id: str,
    name: str,
    tier: Tier,
    country: str,
    revenue_b: float,
    fy_end: str,
    yf: str,
    fx: str | None = None,
    ticker: str | None = None,
) -> GraphNode:
    return GraphNode(
        id=id,
        name=name,
        tier=tier,
        country=country,
        revenue_b=revenue_b,
        revenue_period=f"fiscal year ending {fy_end}",
        revenue_source=f"{_YF} ({yf})",
        revenue_note=fx,
        ticker=ticker,
    )


NODES: list[GraphNode] = [
    # Upstream materials & tooling
    _node("ASML", "ASML Holding", Tier.MATERIAL, "NL", 38.38, "2025-12-31", "ASML",
          "EUR 32.67B at 1.17473 USD/EUR on 2025-12-31", ticker="ASML"),
    _node("SHIN_ETSU", "Shin-Etsu Chemical", Tier.MATERIAL, "JP", 16.10, "2026-03-31", "4063.T",
          "JPY 2,574.0B at 0.00625622 USD/JPY on 2026-03-31"),

    # Fabrication & components
    _node("TSMC", "Taiwan Semiconductor", Tier.SUPPLIER, "TW", 121.91, "2025-12-31", "2330.TW",
          "TWD 3,809.1B at 0.0320066 USD/TWD on 2025-12-31", ticker="TSM"),
    _node("SK_HYNIX", "SK Hynix", Tier.SUPPLIER, "KR", 67.56, "2025-12-31", "000660.KS",
          "KRW 97,146.7B at 0.000695454 USD/KRW on 2025-12-31", ticker="SKHY"),
    _node("SAMSUNG", "Samsung Electronics", Tier.SUPPLIER, "KR", 232.01, "2025-12-31", "005930.KS",
          "KRW 333,605.9B at 0.000695454 USD/KRW on 2025-12-31", ticker="SAMSUNG"),
    # The whole group: SONY is Sony Group's listing, and the image sensors
    # Apple buys come from its semiconductor segment.
    _node("SONY", "Sony Group", Tier.SUPPLIER, "JP", 78.08, "2026-03-31", "SONY",
          "JPY 12,479.6B at 0.00625622 USD/JPY on 2026-03-31", ticker="SONY"),
    _node("CATL", "CATL", Tier.SUPPLIER, "CN", 60.56, "2025-12-31", "300750.SZ",
          "CNY 423.70B at 0.142937 USD/CNY on 2025-12-31"),

    # Assembly
    _node("FOXCONN", "Hon Hai / Foxconn", Tier.MANUFACTURER, "TW", 259.35, "2025-12-31", "2317.TW",
          "TWD 8,103.1B at 0.0320066 USD/TWD on 2025-12-31"),
    _node("PEGATRON", "Pegatron", Tier.MANUFACTURER, "TW", 35.76, "2025-12-31", "4938.TW",
          "TWD 1,117.2B at 0.0320066 USD/TWD on 2025-12-31"),

    # Tradable downstream
    _node("NVDA", "NVIDIA", Tier.BRAND, "US", 215.94, "2026-01-25", "NVDA", ticker="NVDA"),
    _node("AAPL", "Apple", Tier.BRAND, "US", 416.16, "2025-09-27", "AAPL", ticker="AAPL"),
    _node("AMD", "Advanced Micro Devices", Tier.BRAND, "US", 34.64, "2025-12-27", "AMD", ticker="AMD"),
    _node("QCOM", "Qualcomm", Tier.BRAND, "US", 44.28, "2025-09-28", "QCOM", ticker="QCOM"),
    _node("AVGO", "Broadcom", Tier.BRAND, "US", 63.89, "2025-11-02", "AVGO", ticker="AVGO"),
    _node("TSLA", "Tesla", Tier.BRAND, "US", 94.83, "2025-12-31", "TSLA", ticker="TSLA"),
    _node("DELL", "Dell Technologies", Tier.BRAND, "US", 113.54, "2026-01-30", "DELL", ticker="DELL"),
    # Hyperscalers: end buyers of AI accelerators.
    _node("GOOGL", "Alphabet", Tier.BRAND, "US", 402.84, "2025-12-31", "GOOGL", ticker="GOOGL"),
    _node("META", "Meta Platforms", Tier.BRAND, "US", 200.97, "2025-12-31", "META", ticker="META"),
    _node("AMZN", "Amazon", Tier.BRAND, "US", 716.92, "2025-12-31", "AMZN", ticker="AMZN"),
]

EDGES_PATH = Path(__file__).parent / "data" / "edges.json"
FILING_FACTS_PATH = Path(__file__).parent / "data" / "filing_facts.json"


def load_edges(path: Path = EDGES_PATH) -> list[GraphEdge]:
    raw = json.loads(path.read_text())
    return [GraphEdge(**e) for e in raw["edges"]]


def load_filing_facts(path: Path = FILING_FACTS_PATH) -> dict[str, list[dict]]:
    """Customer-concentration facts read by hand from each company's latest
    annual filing, each with the sentence it came from. Display only: they
    describe how concentrated a company's revenue is, not a supply link."""
    return json.loads(path.read_text())["facts"]


EDGES: list[GraphEdge] = load_edges()
FILING_FACTS: dict[str, list[dict]] = load_filing_facts()
