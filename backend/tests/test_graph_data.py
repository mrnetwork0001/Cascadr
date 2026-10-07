"""The shipped graph carries no unsourced numbers.

These guard the promise the UI makes: every link has evidence behind it, and
no hand-guessed weight slips back in.
"""

import json
import re

from app.graph.repository import index
from app.graph.seed import EDGES, EDGES_PATH, NODES
from app.models import Provenance
from app.traversal import TRADE_THRESHOLD, traverse_contagion

NODE_IDS = {n.id for n in NODES}
# The published mapping for sourced-but-unquantified relationships.
QUALITATIVE_BUCKETS = {0.95, 0.70, 0.50, 0.25}
# Buy AI accelerators from several named suppliers and design their own.
HYPERSCALERS = {"GOOGL", "META", "AMZN"}


def test_every_edge_connects_two_graph_nodes():
    for e in EDGES:
        assert e.source in NODE_IDS and e.target in NODE_IDS, (e.source, e.target)


def test_every_node_is_connected():
    touched = {e.source for e in EDGES} | {e.target for e in EDGES}
    assert NODE_IDS == touched


def test_every_edge_is_sourced():
    for e in EDGES:
        key = f"{e.source}->{e.target}"
        assert e.provenance is not Provenance.ESTIMATED, key
        assert e.sources, key
        assert e.basis.strip(), key
        assert e.as_of.strip(), key
        assert e.confidence in {"high", "medium", "low"}, key
        for s in e.sources:
            assert s.url.startswith("https://"), key
            assert s.quote.strip(), key


def test_qualitative_edges_use_the_mapping_rule():
    for e in EDGES:
        if e.provenance is Provenance.QUALITATIVE:
            assert e.dependency in QUALITATIVE_BUCKETS, (e.source, e.target, e.dependency)


def test_removed_edges_are_not_shipped():
    removed = {(r["source"], r["target"]) for r in json.loads(EDGES_PATH.read_text())["removed"]}
    assert removed
    assert not removed & {(e.source, e.target) for e in EDGES}


def test_every_node_has_a_traceable_revenue():
    for n in NODES:
        assert n.revenue_b > 0 and n.revenue_period and n.revenue_source, n.id


def test_tickers_are_unique_bitget_bases():
    # Prices and positions are keyed by ticker; two nodes sharing one would
    # silently collapse into a single row.
    tickers = [n.ticker for n in NODES if n.ticker]
    assert len(tickers) == len(set(tickers))
    for t in tickers:
        assert re.fullmatch(r"[A-Z]+", t), t


def test_hyperscalers_trade_first_order_only():
    """No shock carries a contagion score into a hyperscaler over the trade
    threshold: they trade only when a headline names them. If this fails, a
    stronger link was added; update the note in app/graph/seed.py."""
    by_id, down = index(NODES, EDGES)
    for origin in by_id:
        for p in traverse_contagion(origin, 1.0, by_id, down):
            if p.target in HYPERSCALERS:
                assert p.score < TRADE_THRESHOLD, (origin, p.target, p.score)


def test_every_filing_fact_cites_its_filing():
    from app.graph.seed import FILING_FACTS
    assert FILING_FACTS
    for node, facts in FILING_FACTS.items():
        assert node in NODE_IDS, node
        for f in facts:
            assert f["url"].startswith("https://www.sec.gov/Archives/edgar/data/"), node
            assert f["quote"].strip() and f["accession"] and f["form"] in {"10-K", "20-F"}, node
            assert f["pct"] is None or 0 < f["pct"] < 100, node
            if f["pct"] is not None:
                assert f"{f['pct']:g}%" in f["quote"].replace(" %", "%"), (node, f["pct"])
