"""Calibrate the agent's thresholds against the verified historical events.

Scores real headlines from each event in research/events.py with the same
LLM oracle the live agent uses, then shows the exposure the sourced graph
gives each documented downstream name at that shock, against the shock floor
and the trade threshold. Spends a dozen LLM calls; needs LLM_* in .env.

    ./.venv/bin/python -m research.calibrate
"""

import asyncio

from app.config import get_settings
from app.graph.repository import index
from app.graph.seed import EDGES, NODES
from app.ingest.oracle import NewsOracle
from app.llm.client import LLMClient
from app.traversal import TRADE_THRESHOLD, traverse_contagion
from research.events import EVENTS

# Titles of articles cited in research/events.py, as published.
HEADLINES = {
    "TSMC": [
        "TSMC Evacuates Some Fabs After Strongest Taiwan Quake in 25 Years",
        "TSMC plants evacuated after earthquake, some production lines halted",
    ],
    "FOXCONN": [
        "Chinese cities brace for wave of Foxconn workers from COVID-hit Zhengzhou",
        "Foxconn COVID woes may hit up to 30% of iPhone Nov shipments from Zhengzhou plant",
    ],
    "SAMSUNG": [
        "Austin Energy shuts power off to Samsung, other major users",
        "Samsung chip production halted in Austin after winter storm power blackouts",
    ],
}
SAMPLES = 2  # the LLM's shock varies between calls; take the lowest


async def main() -> None:
    s = get_settings()
    llm = LLMClient(s)
    oracle = NewsOracle(llm)
    by_id, down = index(NODES, EDGES)
    print(f"model {s.llm_model} | shock floor {s.cascadr_shock_floor} | trade threshold {TRADE_THRESHOLD}\n")
    for ev in EVENTS:
        shocks = []
        for h in HEADLINES[ev.origin]:
            for _ in range(SAMPLES):
                shocks.append((await oracle.analyse(h, NODES)).shock)
        low = min(shocks)
        scores = {
            by_id[p.target].ticker: p.score
            for p in traverse_contagion(ev.origin, low, by_id, down)
            if by_id[p.target].ticker
        }
        print(f"{ev.name}: shocks {sorted(round(x, 2) for x in shocks)}, lowest {low:.2f}")
        for t in ev.downstream:
            sc = scores.get(t, 0.0)
            print(f"   {t:<5} exposure {sc:.3f}  {'TRADES' if sc >= TRADE_THRESHOLD else '-'}")
    await llm.aclose()


if __name__ == "__main__":
    asyncio.run(main())
