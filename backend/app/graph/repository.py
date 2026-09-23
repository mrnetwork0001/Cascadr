"""Graph access.

One protocol, two implementations. The service picks Neo4j when it is
configured and falls back to the in-memory seed otherwise, so the API surface
is identical whether or not a database is running.
"""

from typing import Protocol

from app.graph.seed import EDGES, NODES
from app.models import GraphEdge, GraphNode


class GraphRepository(Protocol):
    async def nodes(self) -> list[GraphNode]: ...
    async def edges(self) -> list[GraphEdge]: ...


class MemoryGraphRepository:
    """The curated seed graph, plus any disclosed edges ingested from filings."""

    backend = "memory"

    def __init__(
        self,
        nodes: list[GraphNode] | None = None,
        edges: list[GraphEdge] | None = None,
        overlay=None,
    ):
        self._nodes = list(nodes if nodes is not None else NODES)
        self._edges = list(edges if edges is not None else EDGES)
        self._overlay = overlay

    async def nodes(self) -> list[GraphNode]:
        return self._nodes

    async def edges(self) -> list[GraphEdge]:
        if self._overlay is None:
            return self._edges
        return self._overlay.merge(self._edges)


def index(nodes: list[GraphNode], edges: list[GraphEdge]):
    """(node_by_id, downstream_adjacency) — the shape traversal expects."""
    by_id = {n.id: n for n in nodes}
    downstream: dict[str, list[GraphEdge]] = {}
    for e in edges:
        downstream.setdefault(e.source, []).append(e)
    return by_id, downstream
