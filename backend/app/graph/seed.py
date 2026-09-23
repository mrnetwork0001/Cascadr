"""Curated seed graph.

Topology here is real and public (ASML -> TSMC -> fabless designers ->
assemblers -> brands). The dependency *weights* are hand-curated estimates,
so every seed edge is marked ESTIMATED. Edges promoted to DISCLOSED carry an
EDGAR citation and are written by app.ingest.edgar.

Tickers are underlying equities, which on Bitget trade as stock perpetual
futures (f"{ticker}USDT") and can therefore be shorted. Tokenized xStocks
(AAPLx, NVDAx) are spot-only and deliberately not referenced.
"""

from app.models import GraphEdge, GraphNode, Provenance, Tier

NODES: list[GraphNode] = [
    # Upstream materials & tooling
    GraphNode(id="ASML", name="ASML Holding", tier=Tier.MATERIAL, country="NL", revenue_b=30.2, ticker="ASML"),
    GraphNode(id="SHIN_ETSU", name="Shin-Etsu Chemical", tier=Tier.MATERIAL, country="JP", revenue_b=17.1),
    GraphNode(id="LYNAS", name="Lynas Rare Earths", tier=Tier.MATERIAL, country="AU", revenue_b=0.5),

    # Fabrication & components
    GraphNode(id="TSMC", name="Taiwan Semiconductor", tier=Tier.SUPPLIER, country="TW", revenue_b=87.9, ticker="TSM"),
    GraphNode(id="SK_HYNIX", name="SK Hynix", tier=Tier.SUPPLIER, country="KR", revenue_b=41.3),
    GraphNode(id="SAMSUNG", name="Samsung Electronics", tier=Tier.SUPPLIER, country="KR", revenue_b=198.4),
    GraphNode(id="SONY", name="Sony Semiconductor", tier=Tier.SUPPLIER, country="JP", revenue_b=88.2, ticker="SONY"),
    GraphNode(id="CATL", name="CATL", tier=Tier.SUPPLIER, country="CN", revenue_b=56.0),

    # Assembly & logistics
    GraphNode(id="FOXCONN", name="Hon Hai / Foxconn", tier=Tier.MANUFACTURER, country="TW", revenue_b=214.6),
    GraphNode(id="PEGATRON", name="Pegatron", tier=Tier.MANUFACTURER, country="TW", revenue_b=38.4),
    GraphNode(id="MAERSK", name="A.P. Moller-Maersk", tier=Tier.LOGISTICS, country="DK", revenue_b=51.1),

    # Tradable downstream
    GraphNode(id="NVDA", name="NVIDIA", tier=Tier.BRAND, country="US", revenue_b=130.5, ticker="NVDA"),
    GraphNode(id="AAPL", name="Apple", tier=Tier.BRAND, country="US", revenue_b=391.0, ticker="AAPL"),
    GraphNode(id="AMD", name="Advanced Micro Devices", tier=Tier.BRAND, country="US", revenue_b=25.8, ticker="AMD"),
    GraphNode(id="QCOM", name="Qualcomm", tier=Tier.BRAND, country="US", revenue_b=39.0, ticker="QCOM"),
    GraphNode(id="AVGO", name="Broadcom", tier=Tier.BRAND, country="US", revenue_b=51.6, ticker="AVGO"),
    GraphNode(id="TSLA", name="Tesla", tier=Tier.BRAND, country="US", revenue_b=97.7, ticker="TSLA"),
    GraphNode(id="DELL", name="Dell Technologies", tier=Tier.BRAND, country="US", revenue_b=95.6, ticker="DELL"),
]

_E = Provenance.ESTIMATED

EDGES: list[GraphEdge] = [
    GraphEdge(source="ASML", target="TSMC", relation="SUPPLIES", component="EUV lithography", dependency=1.0, provenance=_E),
    GraphEdge(source="ASML", target="SAMSUNG", relation="SUPPLIES", component="EUV lithography", dependency=1.0, provenance=_E),
    GraphEdge(source="SHIN_ETSU", target="TSMC", relation="SUPPLIES", component="300mm wafers", dependency=0.34, provenance=_E),
    GraphEdge(source="LYNAS", target="SONY", relation="SUPPLIES", component="rare earth magnets", dependency=0.22, provenance=_E),

    GraphEdge(source="TSMC", target="NVDA", relation="FABRICATES", component="4N / 3nm GPU dies", dependency=0.92, provenance=_E),
    GraphEdge(source="TSMC", target="AAPL", relation="FABRICATES", component="3nm A-series / M-series", dependency=0.95, provenance=_E),
    GraphEdge(source="TSMC", target="AMD", relation="FABRICATES", component="5nm CPU/GPU chiplets", dependency=0.88, provenance=_E),
    GraphEdge(source="TSMC", target="QCOM", relation="FABRICATES", component="4nm Snapdragon SoC", dependency=0.61, provenance=_E),
    GraphEdge(source="TSMC", target="AVGO", relation="FABRICATES", component="custom ASIC / SerDes", dependency=0.74, provenance=_E),
    GraphEdge(source="SAMSUNG", target="QCOM", relation="FABRICATES", component="4nm SoC (dual-source)", dependency=0.39, provenance=_E),

    GraphEdge(source="SK_HYNIX", target="NVDA", relation="SUPPLIES", component="HBM3E stacks", dependency=0.68, provenance=_E),
    GraphEdge(source="SAMSUNG", target="NVDA", relation="SUPPLIES", component="HBM3E stacks", dependency=0.24, provenance=_E),
    GraphEdge(source="SK_HYNIX", target="DELL", relation="SUPPLIES", component="DDR5 modules", dependency=0.41, provenance=_E),

    GraphEdge(source="SONY", target="AAPL", relation="SUPPLIES", component="CMOS image sensors", dependency=0.81, provenance=_E),
    GraphEdge(source="CATL", target="TSLA", relation="SUPPLIES", component="LFP cells", dependency=0.46, provenance=_E),
    GraphEdge(source="SAMSUNG", target="TSLA", relation="FABRICATES", component="FSD inference SoC", dependency=0.83, provenance=_E),

    GraphEdge(source="FOXCONN", target="AAPL", relation="ASSEMBLES", component="iPhone final assembly", dependency=0.67, provenance=_E),
    GraphEdge(source="PEGATRON", target="AAPL", relation="ASSEMBLES", component="iPhone final assembly", dependency=0.19, provenance=_E),
    GraphEdge(source="FOXCONN", target="NVDA", relation="ASSEMBLES", component="GB200 rack integration", dependency=0.52, provenance=_E),
    GraphEdge(source="FOXCONN", target="DELL", relation="ASSEMBLES", component="server chassis", dependency=0.44, provenance=_E),

    GraphEdge(source="MAERSK", target="AAPL", relation="SHIPS", component="TPEB container freight", dependency=0.28, provenance=_E),
    GraphEdge(source="MAERSK", target="DELL", relation="SHIPS", component="TPEB container freight", dependency=0.31, provenance=_E),
]
