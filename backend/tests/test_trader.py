"""The LLM's trading decision: what it is shown, what it may choose, and the
guardrails that hold whatever it answers."""

import sqlite3
from datetime import UTC, datetime, timedelta

import pytest

from app.agent import PASSED, TRADED, AutonomousAgent
from app.graph.repository import MemoryGraphRepository
from app.ingest.feeds import Headline
from app.llm.client import LLMResult
from app.models import CloseReason, ExitPolicy, Position
from app.trader import (
    MAX_HOLD_HOURS,
    MAX_TAKE_PROFIT_PCT,
    LLMTrader,
    TradeCall,
    TradePlan,
    leverage_for,
    notional_for,
)


class FakeLLM:
    def __init__(self, parsed, detail="ok"):
        self.parsed, self.detail, self.prompts = parsed, detail, []

    def describe(self):
        return {"model": "test-model", "configured": True}

    async def complete_json(self, system, user, max_tokens=2000):
        self.prompts.append(user)
        return LLMResult(self.parsed, self.detail, {"provider": "0xabc"})


class Verdict:
    entities, shock, severity, confidence = ["AAPL"], 0.45, "HIGH", 0.8
    reasoning, uncertainty, engine, model, provenance = "recall", "u", "llm", "m", {}


def candidate(symbol="AAPLUSDT", origin=True):
    exposure = {
        "target": "AAPL", "name": "Apple", "ticker": "AAPL", "origin": "AAPL",
        "hops": ["AAPL"], "score": 0.45, "contagion": "STRESSED",
        "implied_drawdown_pct": -3.1, "is_origin": origin, "links": [],
    }
    return {"symbol": symbol, "exposure": exposure, "mark": 335.0, "change_24h_pct": 0.3}


async def decide(parsed, cands=None):
    llm = FakeLLM(parsed)
    plan = await LLMTrader(llm).decide(
        headline="Apple recalls iPhones", source="Macworld", published=None,
        verdict=Verdict(), candidates=cands or [candidate()], book={"equity": 50_000, "open": []},
    )
    return plan, llm


@pytest.mark.asyncio
async def test_the_llm_sees_the_candidates_prices_and_book():
    _, llm = await decide({"calls": []})
    prompt = llm.prompts[0]
    assert "AAPLUSDT" in prompt and "directly hit" in prompt
    assert "Price 335.00" in prompt and "+0.30%" in prompt and "Equity about 50,000" in prompt


@pytest.mark.asyncio
async def test_the_llms_numbers_are_clamped_to_their_bounds():
    plan, _ = await decide({"calls": [{"symbol": "AAPLUSDT", "short": True, "conviction": 7,
                                        "take_profit_pct": 99, "hold_hours": 999, "reason": "r"}]})
    c = plan.call_for("AAPLUSDT")
    assert plan.engine == "llm" and c.short and c.conviction == 1.0
    assert c.take_profit_pct == MAX_TAKE_PROFIT_PCT and c.hold_hours == MAX_HOLD_HOURS


@pytest.mark.asyncio
async def test_calls_on_unoffered_symbols_are_ignored_and_missing_calls_pass():
    plan, _ = await decide({"calls": [{"symbol": "TSLAUSDT", "short": True, "conviction": 1}]})
    assert [c.symbol for c in plan.calls] == ["AAPLUSDT"]
    assert plan.calls[0].short is False and "TSLAUSDT" in plan.detail


@pytest.mark.asyncio
async def test_only_an_explicit_true_opens_a_short():
    plan, _ = await decide({"calls": [{"symbol": "AAPLUSDT", "short": "yes", "conviction": 0.9}]})
    assert plan.calls[0].short is False


@pytest.mark.asyncio
async def test_no_answer_means_no_trade():
    plan, _ = await decide(None)
    assert plan.engine == "unavailable" and plan.calls == []


def test_size_and_leverage_follow_conviction():
    assert notional_for(0.0, 50_000) == 5_000 and notional_for(1.0, 50_000) == 25_000
    assert leverage_for(0.74) == 2 and leverage_for(0.75) == 3


@pytest.mark.asyncio
async def test_a_review_closes_only_on_an_explicit_close():
    p = Position(id="p", symbol="AAPLUSDT", side="SHORT", size=10, notional_usdt=3350,
                 leverage=2, entry_price=335.0, opened_at=datetime.now(UTC) - timedelta(hours=5),
                 thesis="t", policy=ExitPolicy(take_profit_pct=3.0))
    for answer, expected in [({"action": "CLOSE", "reason": "r"}, "CLOSE"),
                             ({"action": "maybe"}, "HOLD"), (None, "UNAVAILABLE")]:
        r = await LLMTrader(FakeLLM(answer)).review(position=p, mark=330.0, news=[])
        assert r.action == expected


# --- the agent loop with the decision wired in ------------------------------

def loop_agent(tmp_path, plan: TradePlan):
    h = Headline("Apple recalls iPhone 18 Pro Max", "Macworld", "https://x", datetime.now(UTC))
    seen, executed = [], []

    class Feeds:
        stats = {}

        async def poll(self, nodes):
            return [h]

        async def mark_seen(self, headline, acted):
            seen.append(headline.title)

    class Oracle:
        llm_configured = True

        async def analyse(self, title, nodes):
            v = Verdict()
            return v

    async def decide_fn(h, verdict, exposures):
        return plan

    async def execute(exposures, headline, source, plan=None):
        executed.append(plan)
        call = plan.call_for("AAPLUSDT") if plan else None
        if call and call.short:
            return {"opened": [{"position": None}], "skipped": []}
        return {"opened": [], "skipped": [{"kind": "passed", "reason": "PASSED: r"}]}

    conn = sqlite3.connect(tmp_path / "a.db", check_same_thread=False)
    conn.row_factory = sqlite3.Row
    a = AutonomousAgent(conn=conn, feeds=Feeds(), oracle=Oracle(), repo=MemoryGraphRepository(),
                        execute_fn=execute, decide_fn=decide_fn)
    return a, seen, executed


@pytest.mark.asyncio
async def test_the_llms_plan_reaches_execution_and_the_record(tmp_path):
    plan = TradePlan(engine="llm", summary="short Apple", calls=[
        TradeCall(symbol="AAPLUSDT", short=True, conviction=0.6, reason="recall")])
    a, seen, executed = loop_agent(tmp_path, plan)
    await a.cycle(execute=True)
    row = (await a.decisions(1))[0]
    assert executed == [plan] and row["action"] == TRADED
    assert row["trade_plan"]["summary"] == "short Apple"
    assert row["trade_plan"]["calls"][0]["conviction"] == 0.6


@pytest.mark.asyncio
async def test_an_llm_pass_is_recorded_as_passed(tmp_path):
    plan = TradePlan(engine="llm", calls=[TradeCall(symbol="AAPLUSDT", short=False, reason="priced in")])
    a, _, _ = loop_agent(tmp_path, plan)
    await a.cycle(execute=True)
    assert (await a.decisions(1))[0]["action"] == PASSED


@pytest.mark.asyncio
async def test_no_trade_decision_means_no_trade_and_a_retry(tmp_path):
    a, seen, executed = loop_agent(tmp_path, TradePlan(engine="unavailable", detail="timeout"))
    await a.cycle(execute=True)
    assert executed == [] and seen == [] and await a.decisions(5) == []
    assert "trade decision unavailable" in a.stats["last_error"]


# --- the executor applies the plan ------------------------------------------

def test_the_executor_trades_only_what_the_llm_chose(tmp_path, monkeypatch):
    import asyncio

    from app.market.bitget import BitgetClient
    from app.market.paper import PaperBroker
    from tests.test_api import client

    async def marks(self, tickers):
        return {t: 100.0 for t in tickers}

    monkeypatch.setattr(BitgetClient, "marks", marks)
    with client(tmp_path, monkeypatch):
        from app import main
        main.state["portfolio"]._paper = PaperBroker(reject_rate=0.0, partial_rate=0.0)
        exps = asyncio.run(main.state["agent"].exposures_for(["TSMC"], 0.6))
        tradable = [e for e in exps if main._tradable_exposure(e)]
        assert len(tradable) >= 2
        chosen, other = tradable[0], tradable[1]
        sym = lambda e: f"{e['ticker']}USDT"
        plan = TradePlan(engine="llm", calls=[
            TradeCall(symbol=sym(chosen), short=True, conviction=0.5, take_profit_pct=2.5,
                      hold_hours=48, reason="depends on TSMC"),
            TradeCall(symbol=sym(other), short=False, reason="already priced"),
        ])
        result = asyncio.run(main._execute(exps, "TSMC fab fire", "agent", plan))
    (opened,) = [o["position"] for o in result["opened"]]
    assert opened.symbol == sym(chosen)
    assert opened.notional_usdt == notional_for(0.5, 100_000) or opened.notional_usdt <= notional_for(0.5, 100_000)
    assert opened.policy.max_hold_hours == 48 and opened.policy.take_profit_pct == 2.5
    assert opened.policy.stop_loss_pct == 6.0 and opened.thesis.startswith("depends on TSMC")
    kinds = {s["symbol"]: s["kind"] for s in result["skipped"]}
    assert kinds[sym(other)] == "passed"
    # Everything the LLM was not offered is skipped, never traded.
    assert all(k == "passed" for k in kinds.values())


def test_agent_exit_is_a_close_reason():
    assert CloseReason("AGENT_EXIT") is CloseReason.AGENT_EXIT
