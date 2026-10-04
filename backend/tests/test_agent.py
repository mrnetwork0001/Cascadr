"""Agent bookkeeping: contagion recorded per decision, all entities used."""

import sqlite3

import pytest

from app.agent import AutonomousAgent
from app.graph.repository import MemoryGraphRepository


class _Stub:
    stats = {}


def agent(tmp_path):
    conn = sqlite3.connect(tmp_path / "a.db", check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return AutonomousAgent(conn=conn, feeds=_Stub(), oracle=_Stub(),
                           repo=MemoryGraphRepository(), execute_fn=None)


@pytest.mark.asyncio
async def test_exposures_propagate_every_entity(tmp_path):
    a = agent(tmp_path)
    repo = MemoryGraphRepository()
    edges = await repo.edges()
    origins = sorted({e.source for e in edges})
    # Pick two origins whose full downstream cones (all hops) differ, so the
    # second entity must contribute targets the first cannot reach.
    cone = {o: {e["target"] for e in await a.exposures_for([o], 1.0)} for o in origins}
    pair = next((x, y) for x in origins for y in origins if x != y and cone[y] - cone[x])
    single = {e["target"] for e in await a.exposures_for([pair[0]], 1.0)}
    both = {e["target"] for e in await a.exposures_for(list(pair), 1.0)}
    assert single < both, "the second entity's downstream must be included"


@pytest.mark.asyncio
async def test_no_exposure_without_entities_or_shock(tmp_path):
    a = agent(tmp_path)
    assert await a.exposures_for([], 0.9) == []
    assert await a.exposures_for(["TSMC"], 0.0) == []


@pytest.mark.asyncio
async def test_backfill_fills_old_rows(tmp_path):
    a = agent(tmp_path)
    repo = MemoryGraphRepository()
    origin = next(e.source for e in await repo.edges())
    a._conn.execute(
        "INSERT INTO agent_decisions (at, headline, action, entities, shock, exposures) "
        "VALUES ('2026-01-01T00:00:00+00:00', 'h', 'DECLINED', ?, 0.9, NULL)", (origin,))
    a._conn.commit()
    assert await a.backfill_exposures() == 1
    row = (await a.decisions(1))[0]
    assert row["exposures"] and row["entities"] == [origin]


@pytest.mark.asyncio
async def test_graph_change_restates_only_decisions_that_did_not_act(tmp_path):
    a = agent(tmp_path)
    origin = next(e.source for e in await MemoryGraphRepository().edges())
    for action in ("DECLINED", "TRADED"):
        a._conn.execute(
            "INSERT INTO agent_decisions (at, headline, action, entities, shock, exposures) "
            "VALUES ('2026-01-01T00:00:00+00:00', 'h', ?, ?, 0.9, '[\"recorded\"]')",
            (action, origin))
    a._conn.commit()
    assert await a.sync_exposures("graph-v1") == 1  # first start: DECLINED restated
    assert await a.sync_exposures("graph-v1") == 0  # same graph: nothing to do
    assert await a.sync_exposures("graph-v2") == 1  # graph changed: DECLINED again
    traded = a._conn.execute(
        "SELECT exposures FROM agent_decisions WHERE action='TRADED'").fetchone()[0]
    assert traded == '["recorded"]'  # what the trade was decided on is kept


def test_outcomes_name_what_happened():
    from app.agent import outcome
    assert outcome([{}], [])[0] == "TRADED"
    assert outcome([], [])[0] == "NO_TRADABLE_EXPOSURE"
    assert outcome([], [{"kind": "venue", "reason": "paper reject"}])[0] == "REJECTED_BY_VENUE"
    assert outcome([], [{"kind": "duplicate", "reason": "dup"}])[0] == "ALREADY_HOLDING"
    assert outcome([], [{"kind": "no_mark", "reason": "x"}])[0] == "NO_MARKET_PRICE"
    mixed = outcome([], [{"kind": "venue", "reason": "v"}, {"kind": "risk", "reason": "r"}])
    assert mixed[0] == "BLOCKED_BY_RISK" and "venue 1" in mixed[1] and "risk 1" in mixed[1]


@pytest.mark.asyncio
async def test_recorded_exposures_carry_their_factors(tmp_path):
    """A decision's score can be re-derived from what is stored with it."""
    import math
    a = agent(tmp_path)
    for e in await a.exposures_for(["TSMC"], 0.8):
        if e["is_origin"]:
            continue
        product = math.prod(l["dependency"] for l in e["links"])
        expected = 0.8 * product * e["hop_decay"] ** len(e["links"])
        assert math.isclose(e["score"], round(expected, 4), abs_tol=1e-4)
        assert [l["source"] for l in e["links"]] + [e["target"]] == e["hops"]


@pytest.mark.asyncio
@pytest.mark.parametrize("llm_configured", [True, False])
async def test_keyword_fallback_is_never_traded(tmp_path, llm_configured):
    """If the LLM fails, a keyword match ('TSMC ... earthquake' scores 0.45)
    must not open positions. A transient failure leaves the headline unseen
    for the next cycle; with no LLM at all it is recorded and declined."""
    from datetime import UTC, datetime
    from app.ingest.feeds import Headline
    from app.ingest.oracle import NewsOracle

    h = Headline("Taiwan Semiconductor fabs halted by earthquake", "Test", "https://x", datetime.now(UTC))
    seen, executed = [], []

    class Feeds:
        stats = {}
        async def poll(self, nodes):
            return [h]
        async def mark_seen(self, headline, acted):
            seen.append(headline.title)

    class Oracle:
        async def analyse(self, title, nodes):
            return NewsOracle._heuristic(title, nodes)

    Oracle.llm_configured = llm_configured

    async def execute(exposures, headline, source):
        executed.append(headline)
        return {"opened": [], "skipped": []}

    conn = sqlite3.connect(tmp_path / "a.db", check_same_thread=False)
    conn.row_factory = sqlite3.Row
    a = AutonomousAgent(conn=conn, feeds=Feeds(), oracle=Oracle(),
                        repo=MemoryGraphRepository(), execute_fn=execute)
    assert NewsOracle._heuristic(h.title, await a._repo.nodes()).shock >= 0.40
    await a.cycle(execute=True)
    assert executed == []
    rows = await a.decisions(10)
    if llm_configured:
        assert rows == [] and seen == []  # retried with the LLM next cycle
    else:
        assert rows[0]["action"] == "DECLINED" and seen == [h.title]
