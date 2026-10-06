"""Contagion propagation.

The only place scores are computed. Every path records the edges it was
multiplied through, so any score can be re-derived from what was stored with
it, even after the graph changes.
"""

from collections import deque

from app.models import Contagion, ExposurePath, GraphEdge, GraphNode, PathLink, Provenance

HOP_DECAY = 0.62
MAX_HOPS = 3
MIN_SCORE = 0.08

# A headline is acted on only if the LLM scores its shock at or above the
# agent's shock floor (CASCADR_SHOCK_FLOOR, 0.40). An exposure that clears
# that floor is traded at or above TRADE_THRESHOLD.
#
# Calibrated on 2026-10-04 against the verified historical disruptions in
# research/events.py (research/README.md, "Calibrating the agent"). Over 8
# LLM calls per event, their real headlines scored 0.45-0.65; the 1,466 live
# headlines the LLM scored from 2026-09-24 to 10-04 peaked at 0.33. A 0.40 floor keeps
# a margin on both sides, so the floor alone separates disruption from noise.
# At the lowest recorded shocks the events' documented downstream names score
# 0.196-0.28 on the sourced graph. The old threshold, 0.32, dated from guessed
# and higher weights and would have traded none of them; 0.18 trades them all,
# and adds no trade on live noise, which never reaches the floor.
TRADE_THRESHOLD = 0.18

# Provenance of a path is only as good as its weakest link.
_PROVENANCE_RANK = {
    Provenance.DISCLOSED: 0,
    Provenance.REPORTED: 1,
    Provenance.INFERRED: 2,
    Provenance.QUALITATIVE: 3,
    Provenance.ESTIMATED: 4,
}


def traverse_contagion(
    origin_id: str,
    shock: float,
    nodes: dict[str, GraphNode],
    downstream: dict[str, list[GraphEdge]],
) -> list[ExposurePath]:
    """Breadth-first walk of the downstream cone, strongest path per target."""
    best: dict[str, ExposurePath] = {}
    queue: deque[tuple[str, list[str], float, Provenance, list[PathLink]]] = deque(
        [(origin_id, [origin_id], shock, Provenance.DISCLOSED, [])]
    )

    while queue:
        node_id, hops, score, worst, links = queue.popleft()
        # hops includes the origin, so len(hops) - 1 hops are already taken;
        # expand only while another hop stays within MAX_HOPS.
        if len(hops) > MAX_HOPS:
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
            next_links = [
                *links,
                PathLink(
                    source=edge.source, target=edge.target, component=edge.component,
                    dependency=edge.dependency, provenance=edge.provenance,
                    weight_note=edge.weight_note,
                ),
            ]
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
                    rationale=describe_path(next_links, nodes),
                    weakest_provenance=next_worst,
                    links=next_links,
                )

            queue.append((edge.target, next_hops, next_score, next_worst, next_links))

    return sorted(best.values(), key=lambda p: p.score, reverse=True)


# The published mapping for QUALITATIVE weights (see app/graph/seed.py).
QUALITATIVE_RULE = {
    0.95: "sole supplier",
    0.70: "primary supplier",
    0.50: "one of two suppliers",
    0.25: "one of several suppliers",
}


def weight_phrase(dependency: float, provenance: Provenance, note: str = "") -> str:
    """Say what a weight is: a disclosed or reported share is a share, said the
    way its source said it (a forecast, a range midpoint); a QUALITATIVE
    weight is a rule applied to wording, and must not read as a share."""
    if note:
        return f"weight {dependency:g} ({note})"
    if provenance is Provenance.DISCLOSED:
        return f"disclosed share {dependency:.0%}"
    if provenance is Provenance.REPORTED:
        return f"reported share {dependency:g}"
    if provenance is Provenance.QUALITATIVE:
        rule = QUALITATIVE_RULE.get(round(dependency, 2), "qualitative")
        return f"weight {dependency:.2f} ({rule})"
    return f"weight {dependency:.2f} ({str(provenance).lower()})"


def describe_path(links: list[PathLink], nodes: dict[str, GraphNode]) -> str:
    name = lambda i: nodes[i].name if i in nodes else i
    steps = "; ".join(
        f"{name(l.source)} → {name(l.target)}: {l.component}, "
        f"{weight_phrase(l.dependency, l.provenance, l.weight_note)}"
        for l in links
    )
    return f"{steps} · {len(links)}-hop exposure"


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
