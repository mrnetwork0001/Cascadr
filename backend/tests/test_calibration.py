"""The trading thresholds, pinned to the calibration in research/README.md.

Shocks below are the lowest the agent's LLM gave the verified historical
disruptions' real headlines over 8 calls each (research/calibrate.py, two runs
on 2026-10-04); the noise
ceiling is the highest shock among the 1,466 live headlines the LLM scored from
2026-09-24 to 2026-10-04. If the graph or the thresholds change, these say
whether the agent would still trade the events its own research supports.
"""

from app.config import Settings
from app.graph.repository import index
from app.graph.seed import EDGES, NODES
from app.traversal import TRADE_THRESHOLD, traverse_contagion

BY_ID, DOWN = index(NODES, EDGES)

# (origin, lowest recorded LLM shock, the event's documented downstream names)
VERIFIED_EVENTS = {
    "Hualien earthquake 2024": ("TSMC", 0.45, ["NVDA", "AAPL", "AMD", "QCOM", "AVGO"]),
    "Foxconn Zhengzhou 2022": ("FOXCONN", 0.55, ["AAPL"]),
}
LIVE_NOISE_CEILING = 0.33


def tradable(origin: str, shock: float) -> set[str]:
    return {
        BY_ID[p.target].ticker
        for p in traverse_contagion(origin, shock, BY_ID, DOWN)
        if BY_ID[p.target].ticker and p.score >= TRADE_THRESHOLD
    }


def test_shock_floor_separates_disruption_from_live_noise():
    floor = Settings.model_fields["cascadr_shock_floor"].default
    assert LIVE_NOISE_CEILING < floor
    assert all(shock >= floor for _, shock, _ in VERIFIED_EVENTS.values())


def test_verified_events_would_be_traded():
    for name, (origin, shock, names) in VERIFIED_EVENTS.items():
        assert set(names) <= tradable(origin, shock), name
