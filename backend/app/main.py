"""Cascadr API.

Owns everything the browser must not: graph access, contagion scoring, and
order submission. The frontend becomes a view over these endpoints.

Start with:  uvicorn app.main:app --reload --port 8010
"""

import asyncio
import json
from contextlib import asynccontextmanager
from datetime import UTC, datetime

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.config import get_settings
from app.graph.overlay import EdgeOverlay
from app.graph.repository import MemoryGraphRepository, index
from app.ingest.edgar import EdgarClient
from app.agent import AutonomousAgent
from app.ingest.feeds import FeedReader
from app.ingest.oracle import NewsOracle, OracleVerdict
from app.llm.client import LLMClient
from app.ingest.promote import ingest_disclosed_edges
from app.market.bitget import BitgetClient, perp_symbol
from app.models import CloseReason, ExitPolicy
from app.portfolio.manager import PortfolioManager
from app.portfolio.journal import Journal
from app.portfolio.store import PositionStore
from app.market.paper import PaperBroker
from app.risk import RiskLimits, RiskManager
from app.traversal import (
    implied_drawdown_pct,
    score_to_contagion,
    traverse_contagion,
)

TRADE_THRESHOLD = 0.32
# How often open positions are marked and tested against their exit rules.
SWEEP_SECONDS = 60

state: dict = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    s = get_settings()
    state["settings"] = s
    state["bitget"] = BitgetClient(s)
    state["edgar"] = EdgarClient(s.sec_user_agent)
    state["llm"] = LLMClient(s)
    state["oracle"] = NewsOracle(state["llm"])

    overlay = EdgeOverlay("disclosed_edges.json")
    state["overlay"] = overlay
    repo = MemoryGraphRepository(overlay=overlay)
    if s.neo4j_enabled:
        try:
            from app.graph.neo4j_repo import Neo4jGraphRepository

            candidate = Neo4jGraphRepository(s.neo4j_uri, s.neo4j_user, s.neo4j_password)
            await candidate.verify()
            repo = candidate
        except Exception as exc:
            # Falling back is correct, but it must be loud: silently serving
            # the seed graph while believing you are on Neo4j is worse than
            # failing to start.
            print(f"[graph] Neo4j unavailable ({type(exc).__name__}: {exc}); using seed graph")
    state["repo"] = repo

    store = PositionStore(s.cascadr_db)
    state["store"] = store
    state["portfolio"] = PortfolioManager(
        store, state["bitget"], RiskManager(RiskLimits()), PaperBroker()
    )
    state["journal"] = Journal(store.conn, starting_equity=100_000.0)
    state["feeds"] = FeedReader(
        store.conn, s.sec_user_agent, max_age_hours=s.cascadr_news_max_age_hours
    )
    state["agent"] = AutonomousAgent(
        conn=store.conn,
        feeds=state["feeds"],
        oracle=state["oracle"],
        repo=repo,
        contagion_fn=contagion,
        execute_fn=execute,
        shock_floor=s.cascadr_shock_floor,
        max_llm_calls_per_hour=s.cascadr_max_llm_per_hour,
    )
    state["sweep"] = {"last_ok": None, "consecutive_failures": 0, "runs": 0}

    async def sweeper():
        """Exits must fire whether or not anyone is watching the UI.

        The first pass runs immediately on boot, not after the interval: while
        the process was down, positions kept ageing and prices kept moving, so
        a time stop or a stop loss may already be overdue. Waiting a full
        interval would leave known-bad risk open for no reason.

        Failures back off instead of hot-looping, and never kill the loop —
        a dead sweeper is silent, and silence looks exactly like "nothing to
        do".
        """
        backoff = SWEEP_SECONDS
        while True:
            try:
                actions = await state["portfolio"].sweep()
                for a in actions:
                    if a["action"] not in ("HOLD", "NO_MARK"):
                        print(f"[sweep] {a['symbol']} {a['action']} {a.get('detail','')}")
                # Record the equity point every sweep: the paper-trading
                # track is scored on a time series, not a final balance.
                pm = state["portfolio"]
                realized, unrealized = await pm.book_pnl()
                open_rows = await store.open_positions()
                await state["journal"].record(
                    realized, unrealized,
                    sum(p.notional_usdt for p in open_rows), len(open_rows),
                )
                state["sweep"].update(
                    last_ok=datetime.now(UTC).isoformat(),
                    consecutive_failures=0,
                    runs=state["sweep"]["runs"] + 1,
                )
                backoff = SWEEP_SECONDS
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                state["sweep"]["consecutive_failures"] += 1
                print(
                    f"[sweep] FAILED x{state['sweep']['consecutive_failures']} "
                    f"{type(exc).__name__}: {exc}"
                )
                backoff = min(backoff * 2, 600)
            await asyncio.sleep(backoff)

    async def sensor():
        """The autonomous loop. Off unless CASCADR_AUTONOMOUS is exactly 'true'."""
        if not s.autonomous:
            print("[agent] autonomy OFF — set CASCADR_AUTONOMOUS=true to arm")
            return
        print(f"[agent] autonomy ON — polling every {s.cascadr_poll_seconds}s")
        # Let the app finish starting before the first poll.
        await asyncio.sleep(10)
        backoff = s.cascadr_poll_seconds
        while True:
            try:
                out = await state["agent"].cycle(execute=True)
                if out["fresh"]:
                    print(f"[agent] {out['fresh']} fresh headlines, acted on {len(out['acted'])}")
                backoff = s.cascadr_poll_seconds
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                state["agent"].stats["last_error"] = f"{type(exc).__name__}: {exc}"
                print(f"[agent] cycle failed: {type(exc).__name__}: {exc}")
                backoff = min(backoff * 2, 3600)
            await asyncio.sleep(backoff)

    task = asyncio.create_task(sweeper())
    sensor_task = asyncio.create_task(sensor())

    yield

    task.cancel()
    sensor_task.cancel()
    await state["feeds"].aclose()
    store.close()

    await state["bitget"].aclose()
    await state["edgar"].aclose()
    await state["llm"].aclose()
    if hasattr(state["repo"], "aclose"):
        await state["repo"].aclose()


app = FastAPI(title="Cascadr API", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    s = state["settings"]
    sweep = state["sweep"]
    # A stalled sweeper means exits are not firing; that is a health problem,
    # not a detail, so it degrades the overall status.
    stalled = sweep["consecutive_failures"] >= 3
    return {
        "status": "degraded" if stalled else "ok",
        "graph_backend": getattr(state["repo"], "backend", "unknown"),
        "paper_trading": s.paper_trading,
        "trading_credentials": s.has_trading_credentials,
        "max_order_usdt": s.cascadr_max_order_usdt,
        "llm": state["llm"].describe(),
        "autonomous": {
            "armed": s.autonomous,
            "poll_seconds": s.cascadr_poll_seconds,
            "shock_floor": s.cascadr_shock_floor,
            **state["agent"].stats,
        },
        "sweep": {
            "interval_seconds": SWEEP_SECONDS,
            "runs": sweep["runs"],
            "last_ok": sweep["last_ok"],
            "consecutive_failures": sweep["consecutive_failures"],
            "healthy": not stalled,
        },
    }


@app.get("/graph")
async def get_graph():
    nodes = await state["repo"].nodes()
    edges = await state["repo"].edges()
    overlay = state["overlay"]
    disclosed = sum(1 for e in edges if e.provenance == "DISCLOSED")

    enriched = []
    for n in nodes:
        item = n.model_dump()
        pct = overlay.concentration_pct(n.id)
        if pct is not None:
            item["disclosed_concentration_pct"] = pct
        enriched.append(item)

    return {
        "nodes": enriched,
        "edges": edges,
        "stats": {
            "nodes": len(nodes),
            "edges": len(edges),
            "disclosed_edges": disclosed,
            "estimated_edges": len(edges) - disclosed,
            "nodes_with_disclosed_concentration": sum(
                1 for n in enriched if "disclosed_concentration_pct" in n
            ),
        },
    }


@app.get("/market/tradable")
async def tradable():
    """Reconcile graph tickers against Bitget's live contract list.

    This is the check that catches instrument drift: a ticker the graph thinks
    it can short but Bitget does not list would fail at execution time.
    """
    nodes = await state["repo"].nodes()
    listed = await state["bitget"].listed_symbols()
    tickers = [n.ticker for n in nodes if n.ticker]
    marks = await state["bitget"].marks(tickers)

    rows = []
    for n in nodes:
        if not n.ticker:
            continue
        sym = perp_symbol(n.ticker)
        rows.append(
            {
                "id": n.id,
                "name": n.name,
                "ticker": n.ticker,
                "symbol": sym,
                "listed": sym in listed,
                "mark": marks.get(n.ticker),
            }
        )
    return {"instruments": rows, "unlisted": [r["symbol"] for r in rows if not r["listed"]]}


class HeadlineRequest(BaseModel):
    headline: str
    source: str = "MANUAL"
    # Off by default: reading a headline must never place an order implicitly.
    execute: bool = False


@app.post("/oracle")
async def oracle(req: HeadlineRequest):
    """Let the LLM read a raw headline and decide what it means.

    This is the decision point: the model resolves entities and sets the shock
    magnitude that the graph multiplies into position size. The response
    always states which engine ran, so a reader can tell an LLM judgement from
    the keyword fallback.
    """
    nodes = await state["repo"].nodes()
    verdict: OracleVerdict = await state["oracle"].analyse(req.headline, nodes)
    return {"headline": req.headline, "source": req.source, "verdict": verdict}


@app.post("/oracle/act")
async def oracle_act(req: HeadlineRequest):
    """Full event-driven loop: headline -> LLM -> graph -> risk -> orders.

    The single endpoint that demonstrates the agent end to end.
    """
    nodes = await state["repo"].nodes()
    verdict: OracleVerdict = await state["oracle"].analyse(req.headline, nodes)

    if not verdict.entities or verdict.shock <= 0:
        return {
            "verdict": verdict,
            "acted": False,
            "reason": "no graph entity resolved, or shock scored at zero",
        }

    origin = verdict.entities[0]
    shock_req = ShockRequest(origin=origin, shock=verdict.shock, headline=req.headline)
    scored = await contagion(shock_req)

    if not req.execute:
        return {"verdict": verdict, "acted": False, "reason": "execute=false — analysis only", "exposures": scored["exposures"]}

    return {"verdict": verdict, "acted": True, "execution": await execute(shock_req)}


class ShockRequest(BaseModel):
    origin: str
    shock: float = 0.85
    headline: str = "Manual shock"


@app.post("/contagion")
async def contagion(req: ShockRequest):
    nodes = await state["repo"].nodes()
    edges = await state["repo"].edges()
    by_id, downstream = index(nodes, edges)

    if req.origin not in by_id:
        raise HTTPException(404, f"Unknown graph node: {req.origin}")

    paths = traverse_contagion(req.origin, req.shock, by_id, downstream)
    marks = await state["bitget"].marks([n.ticker for n in nodes if n.ticker])

    exposures = []
    for p in paths:
        node = by_id[p.target]
        exposures.append(
            {
                "target": p.target,
                "name": node.name,
                "ticker": node.ticker,
                "symbol": perp_symbol(node.ticker) if node.ticker else None,
                "hops": p.hops,
                "score": round(p.score, 4),
                "contagion": score_to_contagion(p.score),
                "implied_drawdown_pct": round(implied_drawdown_pct(p.score), 2),
                "rationale": p.rationale,
                "provenance": p.weakest_provenance,
                "mark": marks.get(node.ticker) if node.ticker else None,
                "tradable": bool(node.ticker) and p.score >= TRADE_THRESHOLD,
            }
        )

    origin = by_id[req.origin]
    return {
        "origin": {
            "id": origin.id,
            "name": origin.name,
            "shock": req.shock,
            "contagion": score_to_contagion(req.shock),
        },
        "headline": req.headline,
        "exposures": exposures,
    }


@app.post("/contagion/stream")
async def contagion_stream(req: ShockRequest):
    """Same traversal, emitted hop by hop as SSE.

    This replaces the frontend's setTimeout choreography: pacing becomes a
    property of the engine, not of the view.
    """
    payload = await contagion(req)

    async def gen():
        yield _sse("origin", payload["origin"])
        for e in payload["exposures"]:
            yield _sse("exposure", e)
        yield _sse("done", {"count": len(payload["exposures"])})

    return StreamingResponse(gen(), media_type="text/event-stream")


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, default=str)}\n\n"


@app.post("/execute")
async def execute(req: ShockRequest):
    """Score the shock and open positions for everything over the threshold.

    Whether anything reaches the exchange is decided by BitgetClient's gates;
    whether it is remembered is decided here — every position is persisted with
    its exit policy attached, so a restart does not orphan live risk.
    """
    scored = await contagion(req)
    pm: PortfolioManager = state["portfolio"]
    opened, skipped = [], []

    for e in scored["exposures"]:
        if not e["tradable"] or not e["mark"]:
            continue
        notional = round((18_000 + e["score"] * 42_000) / 500) * 500
        position, detail = await pm.open_short(
            ticker=e["ticker"],
            notional_usdt=notional,
            leverage=3 if e["score"] >= 0.55 else 2,
            mark=e["mark"],
            thesis=e["rationale"],
            origin=req.origin,
            # The model's own implied drawdown becomes the profit target.
            target_pct=e["implied_drawdown_pct"],
        )
        if position is None:
            skipped.append({"symbol": e["symbol"], "reason": detail})
        else:
            opened.append({"position": position, "detail": detail})

    return {"origin": scored["origin"], "opened": opened, "skipped": skipped}


@app.get("/positions")
async def positions():
    """The book, marked to the live tape."""
    pm: PortfolioManager = state["portfolio"]
    store: PositionStore = state["store"]

    rows = await store.all_positions()
    open_rows = [p for p in rows if p.status == "OPEN"]
    marks = await state["bitget"].marks(
        [p.symbol.removesuffix("USDT") for p in open_rows]
    )

    out, unrealized = [], 0.0
    for p in rows:
        mark = marks.get(p.symbol.removesuffix("USDT")) if p.status == "OPEN" else p.exit_price
        item = p.model_dump()
        if mark:
            item["mark"] = mark
            item["pnl_pct"] = round(p.pnl_pct(mark), 2)
            item["pnl_usdt"] = round(p.pnl_usdt(mark), 2)
            item["age_hours"] = round(p.age_hours(), 2)
            item["would_exit"] = (
                PortfolioManager.evaluate_exit(p, mark) if p.status == "OPEN" else None
            )
            if p.status == "OPEN":
                unrealized += p.pnl_usdt(mark)
        out.append(item)

    realized = sum(p.realized_pnl_usdt or 0.0 for p in rows if p.status == "CLOSED")
    return {
        "positions": out,
        "open": len(open_rows),
        "unrealized_usdt": round(unrealized, 2),
        "realized_usdt": round(realized, 2),
    }


@app.post("/positions/sweep")
async def sweep_now():
    """Force an immediate mark-and-exit pass instead of waiting for the loop."""
    return {"actions": await state["portfolio"].sweep()}


@app.post("/positions/{pid}/close")
async def close_position(pid: str):
    p, detail = await state["portfolio"].close_by_id(pid, CloseReason.MANUAL)
    if p is None:
        raise HTTPException(404, detail)
    return {"position": p, "detail": detail}


@app.get("/positions/reconcile")
async def reconcile():
    """Our book vs the exchange's. Drift here is the thing that costs money."""
    return await state["portfolio"].reconcile()


@app.get("/positions/events")
async def position_events():
    return {"events": await state["store"].events()}


@app.get("/paper/report")
async def paper_report():
    """Paper-trading performance: the quantitative half of the Agentic track."""
    rows = await state["store"].all_positions(limit=1000)
    closed = [p for p in rows if p.status == "CLOSED"]
    stats = await state["journal"].stats(closed)
    return {
        "mode": "paper",
        "marks": "live Bitget stock-perp prices",
        "fills": "simulated with modelled slippage, partials and rejects",
        "stats": stats,
        "closed_trades": [
            {
                "symbol": p.symbol, "origin": p.origin,
                "entry": p.entry_price, "exit": p.exit_price,
                "reason": p.close_reason, "pnl_usdt": p.realized_pnl_usdt,
                "opened_at": p.opened_at, "closed_at": p.closed_at,
            }
            for p in closed
        ],
    }


@app.get("/paper/equity")
async def paper_equity():
    return {"series": await state["journal"].series()}


@app.get("/agent/decisions")
async def agent_decisions(limit: int = 60):
    """Every decision, including the refusals.

    The declines matter more than the trades: on live feeds most headlines are
    valuation chatter, and an agent that passes on them is working correctly.
    """
    rows = await state["agent"].decisions(limit)
    return {
        "decisions": rows,
        "summary": {
            "traded": sum(1 for r in rows if r["action"] == "TRADED"),
            "declined": sum(1 for r in rows if r["action"] == "DECLINED"),
            "blocked_by_risk": sum(1 for r in rows if r["action"] == "BLOCKED"),
        },
    }


@app.post("/agent/cycle")
async def agent_cycle(execute: bool = False):
    """Run one sense-reason-act pass now, instead of waiting for the timer."""
    return await state["agent"].cycle(execute=execute)


@app.get("/agent/headlines")
async def agent_headlines(limit: int = 40):
    return {
        "seen_total": await state["feeds"].seen_count(),
        "recent": await state["feeds"].recent(limit),
    }


@app.get("/risk")
async def risk_snapshot():
    """Portfolio exposure, cluster concentration and drawdown state.

    Clusters are keyed by originating shock: every name in one cascade shares
    a root cause, so cluster utilisation is the number that matters, not the
    position count.
    """
    pm: PortfolioManager = state["portfolio"]
    realized, unrealized = await pm.book_pnl()
    return pm.risk.snapshot(await state["store"].open_positions(), realized, unrealized)


@app.get("/policy")
async def policy():
    """The exit policy new positions inherit, and where the numbers come from."""
    d = ExitPolicy().model_dump()
    d["provenance"] = (
        "max_hold_hours is the 5-day window measured in research/ "
        "(CAR_d1_5); take_profit_pct is set per position from the model's "
        "implied drawdown."
    )
    return d


@app.post("/ingest/edgar/refresh")
async def refresh_disclosed_edges():
    """Re-read every tradable name's latest 10-K and rebuild the disclosed edges.

    Slow (one SEC request per filing, rate-limited on purpose) and safe to
    re-run: the overlay is replaced wholesale, never appended to.
    """
    nodes = await state["repo"].nodes()
    report = await ingest_disclosed_edges(state["edgar"], nodes)

    # Facts that named no counterparty are kept as node-level concentration
    # rather than thrown away: they measure fragility even without an edge.
    facts: dict[str, list[dict]] = {}
    for f in report.unnamed_facts:
        facts.setdefault(f["node"], []).append(
            {"pct": f["pct"], "accession": f["accession"], "filing_date": f["filing_date"]}
        )
    state["overlay"].replace(report.edges, facts)
    return report


@app.get("/ingest/edgar/{ticker}")
async def ingest_edgar(ticker: str):
    """Disclosed revenue-concentration facts from the latest 10-K, with citation."""
    return {"ticker": ticker.upper(), "concentrations": await state["edgar"].concentrations(ticker)}
