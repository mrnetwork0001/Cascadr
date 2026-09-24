"""Traversal tests, pinned to the sourced graph in app/graph/data/edges.json.

Expected scores are derived from the edge data rather than typed in, so a
re-sourced weight moves the expectation with it; what is locked here is the
arithmetic (shock x dependency x decay^hops) and the rules around it.
"""

import math

from app.graph.seed import EDGES, NODES
from app.models import Contagion
from app.traversal import (
    HOP_DECAY,
    implied_drawdown_pct,
    score_to_contagion,
    traverse_contagion,
)

NODE_BY_ID = {n.id: n for n in NODES}
DOWNSTREAM: dict[str, list] = {}
for e in EDGES:
    DOWNSTREAM.setdefault(e.source, []).append(e)
DEP = {(e.source, e.target): e.dependency for e in EDGES}


def paths():
    return {p.target: p for p in traverse_contagion("TSMC", 0.88, NODE_BY_ID, DOWNSTREAM)}


def test_direct_customer_score_is_shock_times_dependency_times_decay():
    assert math.isclose(paths()["NVDA"].score, 0.88 * DEP[("TSMC", "NVDA")] * HOP_DECAY, rel_tol=1e-9)


def test_worst_hit_direct_customer_is_the_most_dependent_one():
    p = paths()
    direct = {t: d for (s, t), d in DEP.items() if s == "TSMC"}
    worst = max(p.values(), key=lambda x: x.score)
    assert direct[worst.target] == max(direct.values())
    # AMD's 10-K: TSMC makes all of its CPU and GPU wafers at 7nm and below.
    assert worst.target == "AMD"


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


def test_paths_stop_at_max_hops():
    """/overview publishes max_hops; no path may be longer."""
    from app.models import GraphEdge, GraphNode, Provenance, Tier
    from app.traversal import MAX_HOPS
    ids = [f"N{i}" for i in range(MAX_HOPS + 3)]
    nodes = {i: GraphNode(id=i, name=i, tier=Tier.BRAND, country="US", revenue_b=1) for i in ids}
    down = {a: [GraphEdge(source=a, target=b, relation="SUPPLIES", component="x",
                          dependency=1.0, provenance=Provenance.DISCLOSED)]
            for a, b in zip(ids, ids[1:])}
    paths = traverse_contagion("N0", 1.0, nodes, down)
    assert max(len(p.hops) - 1 for p in paths) == MAX_HOPS
