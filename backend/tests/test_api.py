"""API surface: public reads work, state-changing calls are gated."""

import pytest
from fastapi.testclient import TestClient

from app.config import get_settings

WRITE_ENDPOINTS = [
    ("post", "/oracle", {"headline": "x"}),
    ("post", "/oracle/act", {"headline": "x"}),
    ("post", "/contagion", {"origin": "TSMC", "shock": 0.5}),
    ("post", "/execute", {"origin": "TSMC", "shock": 0.5}),
    ("post", "/agent/cycle", None),
    ("post", "/positions/sweep", None),
    ("post", "/positions/abc/close", None),
    ("post", "/ingest/edgar/refresh", None),
    ("get", "/ingest/edgar/NVDA", None),
    ("get", "/positions/reconcile", None),
]


def client(tmp_path, monkeypatch, token=None):
    monkeypatch.setenv("CASCADR_DB", str(tmp_path / "t.db"))
    monkeypatch.setenv("CASCADR_AUTONOMOUS", "false")
    monkeypatch.setenv("LLM_BASE_URL", "")
    if token is None:
        monkeypatch.delenv("CASCADR_ADMIN_TOKEN", raising=False)
        monkeypatch.setenv("CASCADR_ADMIN_TOKEN", "")
    else:
        monkeypatch.setenv("CASCADR_ADMIN_TOKEN", token)
    get_settings.cache_clear()
    from app.main import app
    return TestClient(app)


@pytest.mark.parametrize("method,path,body", WRITE_ENDPOINTS)
def test_writes_are_disabled_without_a_configured_token(tmp_path, monkeypatch, method, path, body):
    with client(tmp_path, monkeypatch) as c:
        r = getattr(c, method)(path, json=body) if body else getattr(c, method)(path)
        assert r.status_code == 503


@pytest.mark.parametrize("method,path,body", WRITE_ENDPOINTS)
def test_writes_reject_a_wrong_token(tmp_path, monkeypatch, method, path, body):
    with client(tmp_path, monkeypatch, token="s3cret") as c:
        kw = {"headers": {"X-Admin-Token": "nope"}}
        r = getattr(c, method)(path, json=body, **kw) if body else getattr(c, method)(path, **kw)
        assert r.status_code == 401


def test_public_reads_need_no_token(tmp_path, monkeypatch):
    with client(tmp_path, monkeypatch, token="s3cret") as c:
        h = c.get("/health").json()
        assert h["admin_endpoints"] is True and h["paper_trading"] is True
        g = c.get("/graph").json()
        assert g["stats"]["nodes"] == len(g["nodes"]) > 0
        assert c.get("/agent/decisions").status_code == 200
        assert c.get("/agent/feed").status_code == 200
        assert c.get("/positions").json()["paper"] is True


def test_cors_allows_reads_only(tmp_path, monkeypatch):
    with client(tmp_path, monkeypatch) as c:
        r = c.options("/execute", headers={
            "Origin": "http://localhost:4010", "Access-Control-Request-Method": "POST"})
        assert "POST" not in r.headers.get("access-control-allow-methods", "")


def test_token_is_checked_before_the_body_is_read(tmp_path, monkeypatch):
    # FastAPI parses a body before route dependencies run; an anonymous caller
    # must be turned away before that, however malformed or large the body.
    with client(tmp_path, monkeypatch, token="s3cret") as c:
        r = c.post("/contagion", content=b"{not json",
                   headers={"content-type": "application/json"})
        assert r.status_code == 401


def test_admin_bodies_are_capped(tmp_path, monkeypatch):
    with client(tmp_path, monkeypatch, token="s3cret") as c:
        r = c.post("/oracle", json={"headline": "x" * 20_000},
                   headers={"X-Admin-Token": "s3cret"})
        assert r.status_code == 413


def test_non_ascii_token_is_a_401_not_a_crash(tmp_path, monkeypatch):
    with client(tmp_path, monkeypatch, token="s3cret") as c:
        r = c.get("/positions/reconcile", headers={"X-Admin-Token": "café".encode()})
        assert r.status_code == 401


def test_before_id_is_bounded(tmp_path, monkeypatch):
    with client(tmp_path, monkeypatch) as c:
        assert c.get("/agent/decisions?before_id=99999999999999999999999").status_code == 422
        assert c.get("/agent/decisions?before_id=5").status_code == 200


def test_reads_survive_a_bitget_outage(tmp_path, monkeypatch):
    from app.market.bitget import BitgetClient

    async def down(self, *a, **k):
        raise ConnectionError("bitget down")

    monkeypatch.setattr(BitgetClient, "tickers", down)
    monkeypatch.setattr(BitgetClient, "contracts", down)
    with client(tmp_path, monkeypatch) as c:
        o = c.get("/overview")
        assert o.status_code == 200
        body = o.json()
        assert body["instruments"]["listed_on_bitget"] is None and body["market_error"]
        assert body["graph"]["nodes"] > 0
        assert c.get("/positions").status_code == 200
        assert c.get("/market/quotes").status_code == 503


def test_one_headline_opens_at_most_one_cluster_allowance(tmp_path, monkeypatch):
    """A headline naming several suppliers is still one bet, while every
    position keeps its real root cause as its risk cluster."""
    import asyncio
    from app.market.bitget import BitgetClient
    from app.market.paper import PaperBroker

    async def marks(self, tickers):
        return {t: 100.0 for t in tickers}

    monkeypatch.setattr(BitgetClient, "marks", marks)
    with client(tmp_path, monkeypatch) as c:
        from app import main
        # Frictionless fills, so every refusal below is the headline cap.
        main.state["portfolio"]._paper = PaperBroker(reject_rate=0.0, partial_rate=0.0)
        exps = asyncio.run(main.state["agent"].exposures_for(["ASML", "TSMC", "SAMSUNG"], 1.0))
        result = asyncio.run(main._execute(exps, "test headline", "manual"))
        opened = [o["position"] for o in result["opened"]]
        limits = main.state["portfolio"].risk.limits
        assert 0 < len(opened) <= limits.max_positions_per_cluster
        assert sum(p.notional_usdt for p in opened) <= limits.max_cluster_notional_usdt
        by_target = {e["ticker"]: e["origin"] for e in exps if e.get("ticker")}
        for p in opened:
            assert p.origin == by_target[p.symbol.removesuffix("USDT")]
        assert any(s["kind"] == "risk" and "one headline" in s["reason"] for s in result["skipped"])


def _first_order_run(tmp_path, monkeypatch, shock, trade_origin="true"):
    import asyncio
    from app.market.bitget import BitgetClient
    from app.market.paper import PaperBroker

    async def marks(self, tickers):
        return {t: 100.0 for t in tickers}

    monkeypatch.setattr(BitgetClient, "marks", marks)
    monkeypatch.setenv("CASCADR_TRADE_ORIGIN", trade_origin)
    with client(tmp_path, monkeypatch) as c:
        from app import main
        main.state["portfolio"]._paper = PaperBroker(reject_rate=0.0, partial_rate=0.0)
        exps = asyncio.run(main.state["agent"].exposures_for(["AAPL"], shock))
        return asyncio.run(main._execute(exps, "Apple recalls iPhone units", "agent"))


def test_a_shock_to_a_tradable_company_shorts_it_directly(tmp_path, monkeypatch):
    """First-order: a 0.42 shock naming Apple (like the 2026-10-05 recall
    headline) shorts AAPL itself; Apple has nothing downstream in the graph."""
    result = _first_order_run(tmp_path, monkeypatch, 0.42)
    opened = [o["position"] for o in result["opened"]]
    assert [p.symbol for p in opened] == ["AAPLUSDT"]
    assert opened[0].origin == "AAPL" and "first-order" in opened[0].thesis


def test_first_order_needs_the_shock_floor(tmp_path, monkeypatch):
    # The floor is 0.25: just below it nothing trades, at it Apple does.
    assert _first_order_run(tmp_path, monkeypatch, 0.24)["opened"] == []
    (tmp_path / "at").mkdir()
    opened = _first_order_run(tmp_path / "at", monkeypatch, 0.25)["opened"]
    assert [o["position"].symbol for o in opened] == ["AAPLUSDT"]


def test_first_order_can_be_switched_off(tmp_path, monkeypatch):
    assert _first_order_run(tmp_path, monkeypatch, 0.42, trade_origin="false")["opened"] == []


def test_paper_report_names_the_venue_that_fills(tmp_path, monkeypatch):
    with client(tmp_path, monkeypatch) as c:
        r = c.get("/paper/report").json()
    # No demo key in tests: the simulator fills, and the report says so.
    assert r["venue"] == "cascadr-sim" and r["fills"].startswith("simulated")
