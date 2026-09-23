"""Parity tests.

These pin the numbers the TypeScript engine produces. If the backend and the
frontend ever disagree, the terminal shows scores nobody computed — so these
values are locked here on purpose.
"""

import math

from app.graph.seed import EDGES, NODES
from app.models import Contagion
from app.traversal import (
    implied_drawdown_pct,
    score_to_contagion,
    traverse_contagion,
)

NODE_BY_ID = {n.id: n for n in NODES}
DOWNSTREAM: dict[str, list] = {}
for e in EDGES:
    DOWNSTREAM.setdefault(e.source, []).append(e)


def paths():
    return {p.target: p for p in traverse_contagion("TSMC", 0.88, NODE_BY_ID, DOWNSTREAM)}


def test_direct_customer_score_matches_frontend():
    # 0.88 shock x 0.92 dependency x 0.62 decay == 0.5019...
    assert math.isclose(paths()["NVDA"].score, 0.88 * 0.92 * 0.62, rel_tol=1e-9)


def test_apple_is_the_worst_hit_direct_customer():
    p = paths()
    assert max(p.values(), key=lambda x: x.score).target == "AAPL"


def test_scores_below_floor_are_dropped():
    assert all(p.score >= 0.08 for p in paths().values())


def test_no_path_revisits_a_node():
    for p in paths().values():
        assert len(p.hops) == len(set(p.hops))


def test_contagion_bands():
    assert score_to_contagion(0.93) is Contagion.CRITICAL
    assert score_to_contagion(0.50) is Contagion.STRESSED
    assert score_to_contagion(0.10) is Contagion.WATCH
    assert score_to_contagion(0.01) is Contagion.NOMINAL


def test_implied_drawdown_is_negative_and_convex():
    assert implied_drawdown_pct(0.5) < 0
    # Doubling exposure more than doubles the expected move.
    assert implied_drawdown_pct(0.8) < 2 * implied_drawdown_pct(0.4)


def test_origin_is_never_its_own_target():
    assert "TSMC" not in paths()
