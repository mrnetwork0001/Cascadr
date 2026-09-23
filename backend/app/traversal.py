"""Contagion propagation.

A direct port of lib/traversal.ts. The constants must stay identical to the
frontend's or the terminal will display scores the backend did not produce;
tests/test_traversal.py pins the shared values.
"""

from collections import deque

from app.models import Contagion, ExposurePath, GraphEdge, GraphNode, Provenance

HOP_DECAY = 0.62
MAX_HOPS = 3
MIN_SCORE = 0.08

# Provenance of a path is only as good as its weakest link.
_PROVENANCE_RANK = {
    Provenance.DISCLOSED: 0,
    Provenance.INFERRED: 1,
    Provenance.ESTIMATED: 2,
}


def traverse_contagion(
    origin_id: str,
    shock: float,
    nodes: dict[str, GraphNode],
    downstream: dict[str, list[GraphEdge]],
) -> list[ExposurePath]:
    """Breadth-first walk of the downstream cone, strongest path per target."""
    best: dict[str, ExposurePath] = {}
    queue: deque[tuple[str, list[str], float, Provenance]] = deque(
        [(origin_id, [origin_id], shock, Provenance.DISCLOSED)]
    )

    while queue:
        node_id, hops, score, worst = queue.popleft()
        if len(hops) > MAX_HOPS + 1:
            continue

        for edge in downstream.get(node_id, []):
            # Real supply graphs contain cycles (Samsung both supplies and
            # competes); never revisit a node within one path.
            if edge.target in hops:
                continue

            next_score = score * edge.dependency * HOP_DECAY
            if next_score < MIN_SCORE:
                continue

            next_hops = [*hops, edge.target]
            next_worst = (
                edge.provenance
                if _PROVENANCE_RANK[edge.provenance] > _PROVENANCE_RANK[worst]
                else worst
            )

            prev = best.get(edge.target)
            if prev is None or next_score > prev.score:
                best[edge.target] = ExposurePath(
                    target=edge.target,
                    hops=next_hops,
                    score=next_score,
                    rationale=_describe(edge, nodes, len(next_hops) - 1),
                    weakest_provenance=next_worst,
                )

            queue.append((edge.target, next_hops, next_score, next_worst))

    return sorted(best.values(), key=lambda p: p.score, reverse=True)


def _describe(edge: GraphEdge, nodes: dict[str, GraphNode], hops: int) -> str:
    src = nodes[edge.source].name if edge.source in nodes else edge.source
    return (
        f"{round(edge.dependency * 100)}% of {edge.component} sourced from "
        f"{src} · {hops}-hop exposure"
    )


def score_to_contagion(score: float) -> Contagion:
    if score >= 0.55:
        return Contagion.CRITICAL
    if score >= 0.32:
        return Contagion.STRESSED
    if score >= MIN_SCORE:
        return Contagion.WATCH
    return Contagion.NOMINAL


def implied_drawdown_pct(score: float) -> float:
    """Expected move on the underlying, in percent. Convex: the market prices
    small disruptions away but re-rates severe ones."""
    return -(score**1.4) * 14.5
