"""Graph access.

One protocol, two implementations. The service picks Neo4j when it is
configured and falls back to the in-memory seed otherwise, so the API surface
is identical whether or not a database is running.
"""

import hashlib
import json
from typing import Protocol

from app.graph.seed import EDGES, NODES
from app.models import GraphEdge, GraphNode


class GraphRepository(Protocol):
    async def nodes(self) -> list[GraphNode]: ...
    async def edges(self) -> list[GraphEdge]: ...


class MemoryGraphRepository:
    """The sourced graph from app/graph/seed.py and data/edges.json. Nothing
    else is merged in: an edge reaches the agent only after it has been
    sourced and checked by hand."""

    backend = "memory"

    def __init__(
        self,
        nodes: list[GraphNode] | None = None,
        edges: list[GraphEdge] | None = None,
    ):
        self._nodes = list(nodes if nodes is not None else NODES)
        self._edges = list(edges if edges is not None else EDGES)

    async def nodes(self) -> list[GraphNode]:
        return self._nodes

    async def edges(self) -> list[GraphEdge]:
        return self._edges


def index(nodes: list[GraphNode], edges: list[GraphEdge]):
    """(node_by_id, downstream_adjacency) — the shape traversal expects."""
    by_id = {n.id: n for n in nodes}
    downstream: dict[str, list[GraphEdge]] = {}
    for e in edges:
        downstream.setdefault(e.source, []).append(e)
    return by_id, downstream


def fingerprint(nodes: list[GraphNode], edges: list[GraphEdge]) -> str:
    """Changes whenever anything traversal depends on changes."""
    from app.traversal import HOP_DECAY, MAX_HOPS, MIN_SCORE

    key = {
        "constants": [HOP_DECAY, MAX_HOPS, MIN_SCORE],
        "nodes": sorted((n.id, n.ticker or "") for n in nodes),
        "edges": sorted((e.source, e.target, e.component, e.dependency, str(e.provenance)) for e in edges),
    }
    return hashlib.sha256(json.dumps(key).encode()).hexdigest()[:16]
