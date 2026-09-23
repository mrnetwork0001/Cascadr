"""Turn disclosed filing facts into graph edges.

app.ingest.edgar extracts concentration sentences. This module decides what
they mean for the graph.

Direction matters and is easy to get backwards. A 10-K disclosing "customer X
was 22% of our revenue" is a *revenue* dependency: if X cuts orders, the FILER
is hurt. Contagion therefore flows X -> filer, which is the reverse of a supply
edge. We emit it accordingly.

Sentences that name no counterparty ("one direct customer") still carry real
information — the filer is concentrated — but they cannot become an edge
without a second node, so they are recorded as node-level facts instead of
being guessed into a relationship.
"""

import re

from pydantic import BaseModel

from app.ingest.edgar import Concentration, EdgarClient
from app.models import GraphEdge, GraphNode, Provenance

# Aliases as they appear in filings, mapped to graph node ids. Filings are
# inconsistent ("Hon Hai", "Foxconn", "Hon Hai Precision"), so matching is done
# on this table rather than on node names.
ALIASES: dict[str, str] = {
    "apple": "AAPL",
    "nvidia": "NVDA",
    "advanced micro devices": "AMD",
    "qualcomm": "QCOM",
    "broadcom": "AVGO",
    "tesla": "TSLA",
    "dell": "DELL",
    "taiwan semiconductor": "TSMC",
    "tsmc": "TSMC",
    "asml": "ASML",
    "sony": "SONY",
    "samsung": "SAMSUNG",
    "sk hynix": "SK_HYNIX",
    "hynix": "SK_HYNIX",
    "hon hai": "FOXCONN",
    "foxconn": "FOXCONN",
    "pegatron": "PEGATRON",
    "catl": "CATL",
    "maersk": "MAERSK",
    "shin-etsu": "SHIN_ETSU",
    "lynas": "LYNAS",
}

_ALIAS_RE = re.compile(
    r"\b(" + "|".join(re.escape(a) for a in sorted(ALIASES, key=len, reverse=True)) + r")\b",
    re.I,
)


class IngestReport(BaseModel):
    tickers_checked: int = 0
    facts_found: int = 0
    edges_written: int = 0
    edges: list[GraphEdge] = []
    # Concentration disclosed but counterparty unnamed — real, but not an edge.
    unnamed_facts: list[dict] = []
    errors: list[str] = []


def _counterparties(c: Concentration, self_id: str) -> list[str]:
    found = []
    for m in _ALIAS_RE.finditer(c.sentence):
        node_id = ALIASES[m.group(1).lower()]
        if node_id != self_id and node_id not in found:
            found.append(node_id)
    return found


def edges_from(
    concentrations: list[Concentration], node_id: str, known: set[str]
) -> tuple[list[GraphEdge], list[dict]]:
    edges: list[GraphEdge] = []
    unnamed: list[dict] = []

    for c in concentrations:
        partners = [p for p in _counterparties(c, node_id) if p in known]
        if not partners:
            unnamed.append(
                {
                    "node": node_id,
                    "pct": c.pct,
                    "filing_date": c.filing_date,
                    "accession": c.accession,
                    "sentence": c.sentence[:220],
                }
            )
            continue

        for p in partners:
            edges.append(
                GraphEdge(
                    # Contagion flows from the customer to the filer.
                    source=p,
                    target=node_id,
                    relation="REVENUE_CONCENTRATION",
                    component=f"{c.pct:.0f}% of {node_id} revenue",
                    dependency=min(c.pct / 100.0, 1.0),
                    provenance=Provenance.DISCLOSED,
                    citation=f"{c.accession} ({c.filing_date}) {c.source_url}",
                )
            )
    return edges, unnamed


async def ingest_disclosed_edges(
    client: EdgarClient, nodes: list[GraphNode], limit_per_filing: int = 6
) -> IngestReport:
    report = IngestReport()
    known = {n.id for n in nodes}
    by_ticker = {n.ticker.upper(): n.id for n in nodes if n.ticker}

    for ticker, node_id in by_ticker.items():
        report.tickers_checked += 1
        try:
            facts = await client.concentrations(ticker, limit=limit_per_filing)
        except Exception as exc:
            report.errors.append(f"{ticker}: {type(exc).__name__}: {exc}")
            continue

        report.facts_found += len(facts)
        edges, unnamed = edges_from(facts, node_id, known)
        report.edges.extend(edges)
        report.unnamed_facts.extend(unnamed)

    # Keep the strongest disclosed edge per pair.
    best: dict[tuple[str, str], GraphEdge] = {}
    for e in report.edges:
        k = (e.source, e.target)
        if k not in best or e.dependency > best[k].dependency:
            best[k] = e
    report.edges = list(best.values())
    report.edges_written = len(report.edges)
    return report
