"""Filing-fact -> graph-edge tests. Direction is the thing most easily wrong."""

from app.ingest.edgar import Concentration
from app.ingest.promote import edges_from
from app.models import Provenance

KNOWN = {"NVDA", "AAPL", "FOXCONN", "TSMC", "SAMSUNG"}


def fact(sentence: str, pct: float = 22.0) -> Concentration:
    return Concentration(
        ticker="NVDA", company="NVIDIA CORP", pct=pct, sentence=sentence,
        filing_date="2026-02-25", accession="0001045810-26-000021",
        source_url="https://sec.gov/x",
    )


def test_named_customer_becomes_an_edge_pointing_at_the_filer():
    """A customer cutting orders hurts the FILER, so contagion flows customer -> filer."""
    edges, unnamed = edges_from(
        [fact("Sales to Foxconn represented 22% of total revenue.")], "NVDA", KNOWN
    )
    assert len(edges) == 1 and not unnamed
    assert edges[0].source == "FOXCONN" and edges[0].target == "NVDA"


def test_edge_is_marked_disclosed_and_cited():
    e = edges_from([fact("Sales to Foxconn were 22% of revenue.")], "NVDA", KNOWN)[0][0]
    assert e.provenance is Provenance.DISCLOSED
    assert "0001045810-26-000021" in e.citation


def test_percentage_becomes_the_dependency_weight():
    e = edges_from([fact("Foxconn was 22% of revenue.", 22.0)], "NVDA", KNOWN)[0][0]
    assert e.dependency == 0.22


def test_unnamed_customer_is_recorded_but_never_guessed_into_an_edge():
    edges, unnamed = edges_from(
        [fact("Sales to one direct customer represented 22% of total revenue.")],
        "NVDA", KNOWN,
    )
    assert edges == [] and len(unnamed) == 1
    assert unnamed[0]["pct"] == 22.0


def test_self_reference_is_not_an_edge():
    edges, _ = edges_from([fact("NVIDIA reported 22% of revenue.")], "NVDA", KNOWN)
    assert edges == []


def test_companies_outside_the_graph_are_ignored():
    edges, unnamed = edges_from(
        [fact("Sales to Microsoft were 22% of revenue.")], "NVDA", KNOWN
    )
    assert edges == [] and len(unnamed) == 1


def test_alias_variants_resolve_to_one_node():
    a = edges_from([fact("Hon Hai was 22% of revenue.")], "NVDA", KNOWN)[0]
    b = edges_from([fact("Foxconn was 22% of revenue.")], "NVDA", KNOWN)[0]
    assert a[0].source == b[0].source == "FOXCONN"
