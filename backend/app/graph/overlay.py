"""Disclosed edges learned from filings, persisted alongside the seed graph.

Kept in a JSON file rather than merged into seed.py by hand: the seed is
curated estimates a human wrote, this is machine-extracted evidence with
citations, and conflating the two would destroy the provenance distinction the
whole model depends on.

Overlay edges win over seed edges for the same pair — a cited filing beats an
estimate.
"""

import json
from pathlib import Path

from app.models import GraphEdge


class EdgeOverlay:
    def __init__(self, path: str | Path = "disclosed_edges.json"):
        self.path = Path(path)
        self._edges: list[GraphEdge] = []
        # Disclosed concentration that named no counterparty. Not an edge, but
        # a real measure of how concentrated a node's revenue is.
        self._node_facts: dict[str, list[dict]] = {}
        self.load()

    def load(self) -> None:
        if not self.path.exists():
            self._edges = []
            return
        try:
            raw = json.loads(self.path.read_text())
            if isinstance(raw, dict):
                self._edges = [GraphEdge(**e) for e in raw.get("edges", [])]
                self._node_facts = raw.get("node_facts", {})
            else:  # legacy: a bare list of edges
                self._edges = [GraphEdge(**e) for e in raw]
        except Exception:
            # A corrupt overlay must not take the service down; the seed graph
            # is always a valid fallback.
            self._edges = []

    def save(self) -> None:
        self.path.write_text(
            json.dumps(
                {
                    "edges": [e.model_dump() for e in self._edges],
                    "node_facts": self._node_facts,
                },
                indent=2,
            )
        )

    def replace(
        self, edges: list[GraphEdge], node_facts: dict[str, list[dict]] | None = None
    ) -> None:
        self._edges = list(edges)
        if node_facts is not None:
            self._node_facts = node_facts
        self.save()

    @property
    def node_facts(self) -> dict[str, list[dict]]:
        return dict(self._node_facts)

    def concentration_pct(self, node_id: str) -> float | None:
        """Largest disclosed single-customer share of this node's revenue.

        A node that books 22% of revenue from one customer is structurally
        fragile to a demand shock, whether or not we know who the customer is.
        """
        facts = self._node_facts.get(node_id) or []
        return max((f["pct"] for f in facts), default=None)

    @property
    def edges(self) -> list[GraphEdge]:
        return list(self._edges)

    def merge(self, base: list[GraphEdge]) -> list[GraphEdge]:
        """Seed edges, with disclosed edges overriding matching pairs."""
        by_pair = {(e.source, e.target, e.component): e for e in base}
        for e in self._edges:
            by_pair[(e.source, e.target, e.component)] = e
        return list(by_pair.values())
