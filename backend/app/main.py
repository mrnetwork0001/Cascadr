"""Cascadr API.

Owns everything the browser must not: graph access, contagion scoring, and
order submission. The frontend is a read-only view over the GET endpoints.

Two classes of endpoint:

  * GET  - public, read-only, and serve only real data: the sourced graph,
           live Bitget quotes, the agent's recorded decisions, the paper book.
  * POST - change state or spend money (LLM credits, paper positions). Every
           one requires the X-Admin-Token header. With no token configured
           they are disabled outright rather than left open.

Start with:  uvicorn app.main:app --reload --port 8010
"""

import asyncio
import json
import secrets
from contextlib import asynccontextmanager
from datetime import UTC, datetime

from fastapi import Depends, FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app.agent import AutonomousAgent
from app.config import get_settings
from app.graph.repository import MemoryGraphRepository, index
from app.graph.repository import fingerprint as graph_fingerprint
from app.graph.seed import FILING_FACTS
from app.ingest.edgar import EdgarClient
from app.ingest.feeds import FeedReader
from app.ingest.oracle import NewsOracle, OracleVerdict
from app.ingest.promote import ingest_disclosed_edges
from app.llm.client import LLMClient
from app.market.bitget import BitgetClient, perp_symbol
from app.market.bitget_demo import BitgetDemo
from app.market.paper import PaperBroker
from app.models import CloseReason, ExitPolicy
from app.portfolio.journal import Journal
from app.portfolio.manager import PortfolioManager
from app.portfolio.store import PositionStore
from app.risk import RiskLimits, RiskManager
from app.traversal import (
    HOP_DECAY,
    MAX_HOPS,
    TRADE_THRESHOLD,
    implied_drawdown_pct,
    score_to_contagion,
    traverse_contagion,
)

# How often open positions are marked and tested against their exit rules.
SWEEP_SECONDS = 60

state: dict = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    s = get_settings()
    state["settings"] = s
    state["bitget"] = BitgetClient(s)
    state["demo"] = BitgetDemo(s)
    state["edgar"] = EdgarClient(s.sec_user_agent)
    state["llm"] = LLMClient(s)
    state["oracle"] = NewsOracle(state["llm"])

    repo = MemoryGraphRepository()
    if s.neo4j_enabled:
        try:
            from app.graph.neo4j_repo import Neo4jGraphRepository

            candidate = Neo4jGraphRepository(s.neo4j_uri, s.neo4j_user, s.neo4j_password)
            await candidate.verify()
            # Every served edge must carry its evidence. A database that
            # cannot return sources would silently put unsourced weights in
            # front of the agent, so it is refused rather than trusted.
            unsourced = [e for e in await candidate.edges() if not e.sources]
            if unsourced:
                await candidate.aclose()
                raise RuntimeError(f"{len(unsourced)} edges without sources")
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
        store,
        state["bitget"],
        RiskManager(RiskLimits(starting_equity_usdt=s.cascadr_paper_equity)),
        PaperBroker(),
        demo=state["demo"],
    )
    state["journal"] = Journal(store.conn, starting_equity=s.cascadr_paper_equity)
    state["feeds"] = FeedReader(
        store.conn, s.sec_user_agent, max_age_hours=s.cascadr_news_max_age_hours
    )
    state["agent"] = AutonomousAgent(
        conn=store.conn,
        feeds=state["feeds"],
        oracle=state["oracle"],
        repo=repo,
        execute_fn=_execute,
        shock_floor=s.cascadr_shock_floor,
        max_llm_calls_per_hour=s.cascadr_max_llm_per_hour,
    )
    filled = await state["agent"].sync_exposures(
        graph_fingerprint(await repo.nodes(), await repo.edges())
    )
    if filled:
        print(f"[agent] computed exposures for {filled} earlier decisions", flush=True)
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
                        print(f"[sweep] {a['symbol']} {a['action']} {a.get('detail','')}", flush=True)
                # Record the equity point every sweep: the paper-trading
                # track is scored on a time series, not a final balance.
                pm = state["portfolio"]
                realized, unrealized = await pm.book_pnl()
                open_rows = await store.open_positions()
                if unrealized is None:
                    # An unpriced position makes equity unknown; a partial
                    # figure would put a false jump in the series.
                    print("[sweep] journal point skipped: an open position has no mark", flush=True)
                else:
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
                    f"{type(exc).__name__}: {exc}",
                    flush=True,
                )
                backoff = min(backoff * 2, 600)
            await asyncio.sleep(backoff)

    async def sensor():
        """The autonomous loop. Off unless CASCADR_AUTONOMOUS is 'true'."""
        if not s.autonomous:
            print("[agent] autonomy OFF — set CASCADR_AUTONOMOUS=true to arm", flush=True)
            return
        print(f"[agent] autonomy ON — polling every {s.cascadr_poll_seconds}s", flush=True)
        # Let the app finish starting before the first poll.
        await asyncio.sleep(10)
        backoff = s.cascadr_poll_seconds
        while True:
            try:
                out = await state["agent"].cycle(execute=True)
                if out["fresh"]:
                    print(
                        f"[agent] {out['fresh']} fresh headlines, acted on {len(out['acted'])}",
                        flush=True,
                    )
                backoff = s.cascadr_poll_seconds
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                state["agent"].stats["last_error"] = f"{type(exc).__name__}: {exc}"
                print(f"[agent] cycle failed: {type(exc).__name__}: {exc}", flush=True)
                backoff = min(backoff * 2, 3600)
            await asyncio.sleep(backoff)

    task = asyncio.create_task(sweeper())
    sensor_task = asyncio.create_task(sensor())

    yield

    task.cancel()
    sensor_task.cancel()
    await asyncio.gather(task, sensor_task, return_exceptions=True)
    # A cancelled task's asyncio.to_thread work keeps running in its worker
    # thread. Closing the SQLite connection under it crashes the process, so
    # wait for every worker to finish first.
    await asyncio.get_running_loop().shutdown_default_executor()
    await state["feeds"].aclose()
    store.close()

    await state["bitget"].aclose()
    await state["demo"].aclose()
    await state["edgar"].aclose()
    await state["llm"].aclose()
    if hasattr(state["repo"], "aclose"):
        await state["repo"].aclose()


app = FastAPI(title="Cascadr API", version="0.2.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origins,
    # Browsers only ever read. Admin calls come from curl/scripts, which do
    # not use CORS at all.
    allow_methods=["GET"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Admin gate
# ---------------------------------------------------------------------------


def _admin_check(raw_token: bytes | None) -> tuple[int, str] | None:
    """None when the token is right, else (status, message). Compared as
    bytes: compare_digest rejects non-ASCII str, which would turn a bad token
    into a 500 instead of a 401."""
    expected = get_settings().cascadr_admin_token
    if not expected:
        return 503, "admin endpoints disabled: CASCADR_ADMIN_TOKEN is not set"
    if not raw_token or not secrets.compare_digest(raw_token, expected.encode("utf-8")):
        return 401, "missing or invalid X-Admin-Token"
    return None


def require_admin(x_admin_token: str | None = Header(default=None)) -> None:
    """Every state-changing endpoint depends on this.

    These endpoints spend LLM credits, open and close paper positions, and can
    make the autonomous agent skip headlines. They were previously callable by
    anyone who found the URL.
    """
    # Starlette decodes header bytes as latin-1; this recovers the raw bytes.
    raw = x_admin_token.encode("latin-1") if x_admin_token is not None else None
    if (failure := _admin_check(raw)) is not None:
        raise HTTPException(*failure)


ADMIN = [Depends(require_admin)]

# Largest request body an admin call needs (a headline, a shock).
MAX_BODY_BYTES = 16_384


class AdminGate:
    """Every non-read request is an admin call. Checks the token from the
    headers before the body is read, so an anonymous caller cannot make the
    server buffer and parse an arbitrarily large body - FastAPI parses the
    body before it runs route dependencies. Also caps admin body size."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope["method"] in ("GET", "HEAD", "OPTIONS"):
            return await self.app(scope, receive, send)
        headers = dict(scope["headers"])
        failure = _admin_check(headers.get(b"x-admin-token"))
        if failure is None:
            try:
                too_big = int(headers.get(b"content-length", b"0")) > MAX_BODY_BYTES
            except ValueError:
                too_big = True
            if too_big:
                failure = (413, f"request body over {MAX_BODY_BYTES} bytes")
        if failure is None:
            return await self.app(scope, _capped(receive), send)
        status, message = failure
        body = json.dumps({"detail": message}).encode()
        await send({"type": "http.response.start", "status": status,
                    "headers": [(b"content-type", b"application/json"),
                                (b"content-length", str(len(body)).encode())]})
        await send({"type": "http.response.body", "body": body})


def _capped(receive):
    """Enforce MAX_BODY_BYTES on bodies that arrive without Content-Length."""
    seen = 0

    async def wrapped():
        nonlocal seen
        message = await receive()
        if message["type"] == "http.request":
            seen += len(message.get("body", b""))
            if seen > MAX_BODY_BYTES:
                raise HTTPException(413, f"request body over {MAX_BODY_BYTES} bytes")
        return message

    return wrapped


# Added last, so it runs first: nothing reaches routing unchecked.
app.add_middleware(AdminGate)


# ---------------------------------------------------------------------------
# Market data that may be unavailable
# ---------------------------------------------------------------------------


OVERVIEW_MARKET_TIMEOUT = 3.0


def _market_error(exc: Exception) -> str:
    return f"Bitget market data unavailable ({type(exc).__name__})"


async def _marks(tickers: list[str]) -> tuple[dict[str, float], str | None]:
    """Marks, or ({}, reason) when Bitget cannot be reached. Pages built from
    the database must keep working through a market-data outage; they show
    prices as unavailable instead of failing outright."""
    try:
        return await state["bitget"].marks(tickers), None
    except Exception as exc:
        return {}, _market_error(exc)


# ---------------------------------------------------------------------------
# Health and overview
# ---------------------------------------------------------------------------


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
        "paper_venue": state["portfolio"].venue,
        "trading_credentials": s.has_trading_credentials,
        "admin_endpoints": bool(s.cascadr_admin_token),
        "llm": state["llm"].describe(),
        "autonomous": {
            "armed": s.autonomous,
            "poll_seconds": s.cascadr_poll_seconds,
            "shock_floor": s.cascadr_shock_floor,
            "trade_threshold": TRADE_THRESHOLD,
            "max_llm_per_hour": s.cascadr_max_llm_per_hour,
            **state["agent"].stats,
        },
        "feeds": state["feeds"].stats,
        "sweep": {
            "interval_seconds": SWEEP_SECONDS,
            "runs": sweep["runs"],
            "last_ok": sweep["last_ok"],
            "consecutive_failures": sweep["consecutive_failures"],
            "healthy": not stalled,
        },
    }


@app.get("/overview")
async def overview():
    """Everything the landing page shows, from live state. Nothing cached into
    the page at build time."""
    s = state["settings"]
    nodes = await state["repo"].nodes()
    edges = await state["repo"].edges()
    tickers = [n.ticker for n in nodes if n.ticker]
    counts = await state["agent"].counts()
    seen = await state["feeds"].seen_count()
    open_rows = await state["store"].open_positions()
    market_error = None
    # Bounded, so the landing page (which gives up after 8s) always gets an
    # answer: a hanging Bitget shows as unavailable, not as a blank page.
    try:
        listed = await asyncio.wait_for(state["bitget"].listed_symbols(), OVERVIEW_MARKET_TIMEOUT)
        listed_count: int | None = sum(1 for t in tickers if perp_symbol(t) in listed)
    except Exception as exc:
        listed_count, market_error = None, _market_error(exc)
    try:
        realized, unrealized = await asyncio.wait_for(
            state["portfolio"].book_pnl(), OVERVIEW_MARKET_TIMEOUT
        )
    except Exception as exc:
        realized, unrealized = await state["portfolio"].realized_pnl(), None
        market_error = _market_error(exc)
    prov: dict[str, int] = {}
    for e in edges:
        prov[str(e.provenance)] = prov.get(str(e.provenance), 0) + 1
    return {
        "graph": {
            "nodes": len(nodes),
            "edges": len(edges),
            "edges_by_provenance": prov,
            "max_hops": MAX_HOPS,
            # Published so pages that explain a score use the engine's own
            # constant instead of a copy that could drift.
            "hop_decay": HOP_DECAY,
        },
        "instruments": {
            "graph_tickers": len(tickers),
            "listed_on_bitget": listed_count,
        },
        "agent": {
            "armed": s.autonomous,
            "poll_seconds": s.cascadr_poll_seconds,
            "shock_floor": s.cascadr_shock_floor,
            "trade_threshold": TRADE_THRESHOLD,
            "llm_model": s.llm_model,
            "cycles_since_restart": state["agent"].stats["cycles"],
            "last_cycle": state["agent"].stats["last_cycle"],
            "headlines_seen": seen,
            "decisions": counts,
        },
        "paper": {
            "starting_equity": s.cascadr_paper_equity,
            # Equity needs live marks; without them it is unknown, not zero.
            "equity": round(s.cascadr_paper_equity + realized + unrealized, 2)
            if unrealized is not None
            else None,
            "realized_usdt": round(realized, 2),
            "unrealized_usdt": round(unrealized, 2) if unrealized is not None else None,
            "open_positions": len(open_rows),
            # Bitget answered but an open position has no mark (e.g. a
            # suspended contract): equity is unknown, market data is not down.
            "unpriced": unrealized is None and market_error is None,
        },
        "paper_trading": s.paper_trading,
        "paper_venue": state["portfolio"].venue,
        "trading_credentials": s.has_trading_credentials,
        "market_error": market_error,
    }


# ---------------------------------------------------------------------------
# Graph and market data (public, read-only)
# ---------------------------------------------------------------------------


@app.get("/graph")
async def get_graph():
    """The graph the agent reasons over, with every edge's evidence."""
    nodes = await state["repo"].nodes()
    edges = await state["repo"].edges()
    prov: dict[str, int] = {}
    for e in edges:
        prov[str(e.provenance)] = prov.get(str(e.provenance), 0) + 1
    return {
        "nodes": [n.model_dump() for n in nodes],
        "edges": [e.model_dump() for e in edges],
        "concentration": FILING_FACTS,
        "stats": {"nodes": len(nodes), "edges": len(edges), "edges_by_provenance": prov},
    }


@app.get("/market/quotes")
async def market_quotes():
    """Live Bitget stock-perp quotes for every tradable graph company: last,
    mark and Bitget's own 24h open/high/low/change. Served from a ~3s cache."""
    nodes = await state["repo"].nodes()
    by_ticker = {n.ticker: n for n in nodes if n.ticker}
    try:
        quotes = await state["bitget"].quotes(list(by_ticker))
    except Exception as exc:
        raise HTTPException(503, _market_error(exc)) from exc
    for q in quotes:
        q["id"] = by_ticker[q["ticker"]].id
    return {"quotes": quotes, "source": "Bitget public API v2 /mix/market/tickers"}


@app.get("/market/tradable")
async def tradable():
    """Reconcile graph tickers against Bitget's live contract list."""
    nodes = await state["repo"].nodes()
    tickers = [n.ticker for n in nodes if n.ticker]
    try:
        listed = await state["bitget"].listed_symbols()
        marks = await state["bitget"].marks(tickers)
    except Exception as exc:
        raise HTTPException(503, _market_error(exc)) from exc
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


# ---------------------------------------------------------------------------
# The agent (public reads)
# ---------------------------------------------------------------------------


@app.get("/agent/decisions")
async def agent_decisions(
    limit: int = 60, before_id: int | None = Query(default=None, ge=1, le=2**63 - 1)
):
    """Every decision, including the refusals, newest first.

    The declines matter as much as the trades: on live feeds most headlines
    are valuation chatter, and an agent that passes on them is working.
    """
    limit = max(1, min(limit, 200))
    rows = await state["agent"].decisions(limit, before_id)
    return {"decisions": rows, "counts": await state["agent"].counts()}


@app.get("/agent/latest")
async def agent_latest():
    """The most recent decision whose verdict implies downstream exposure
    (the one worth drawing on the graph), plus the most recent decision
    overall."""
    rows = await state["agent"].decisions(1000)
    with_exposure = next(
        (r for r in rows if any(not e.get("is_origin") for e in r["exposures"])), None
    )
    return {"latest": rows[0] if rows else None, "latest_with_exposure": with_exposure}


@app.get("/agent/feed")
async def agent_feed(limit: int = 80):
    """One chronological stream of everything the agent and the book did:
    decisions on real headlines, and paper position events (opens, closes,
    partial fills, rejected closes). This is the terminal's execution log."""
    limit = max(1, min(limit, 300))
    decisions = await state["agent"].decisions(limit)
    events = await state["store"].events(limit)
    positions = {p.id: p for p in await state["store"].all_positions(limit=5000)}
    items = [{"kind": "decision", "at": d["at"], **d} for d in decisions]
    for e in events:
        p = positions.get(e["position_id"])
        items.append(
            {
                "kind": "position",
                "at": e["at"],
                "event": e["kind"],
                "detail": e["detail"],
                "position_id": e["position_id"],
                "symbol": p.symbol if p else None,
                "origin": p.origin if p else None,
                "source": p.source if p else None,
            }
        )
    items.sort(key=lambda x: x["at"], reverse=True)
    return {"items": items[:limit]}


@app.get("/agent/headlines")
async def agent_headlines(limit: int = 40):
    limit = max(1, min(limit, 200))
    return {
        "seen_total": await state["feeds"].seen_count(),
        "recent": await state["feeds"].recent(limit),
    }


# ---------------------------------------------------------------------------
# Scoring and execution
# ---------------------------------------------------------------------------


class HeadlineRequest(BaseModel):
    headline: str
    source: str = "MANUAL"
    # Off by default: reading a headline must never place an order implicitly.
    execute: bool = False


class ShockRequest(BaseModel):
    origin: str
    shock: float
    headline: str = "Manual shock"


async def _score(origin: str, shock: float) -> dict:
    nodes = await state["repo"].nodes()
    edges = await state["repo"].edges()
    by_id, downstream = index(nodes, edges)
    if origin not in by_id:
        raise HTTPException(404, f"Unknown graph node: {origin}")

    paths = traverse_contagion(origin, shock, by_id, downstream)
    marks, market_error = await _marks([n.ticker for n in nodes if n.ticker])
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
    o = by_id[origin]
    return {
        "origin": {"id": o.id, "name": o.name, "shock": shock,
                   "contagion": score_to_contagion(shock)},
        "exposures": exposures,
        "market_error": market_error,
    }


async def _execute(exposures: list[dict], headline: str, source: str) -> dict:
    """Open paper positions for every tradable exposure in a recorded set.

    Takes the exposures exactly as the decision recorded them (strongest path
    per company across every disrupted entity), so what is traded is what the
    record says. Whether anything reaches the exchange is decided by
    BitgetClient's gates; every position is persisted with its exit policy and
    its source ("agent" or "manual"). Each skip says why: risk, venue,
    no_mark, duplicate or error.

    Each position keeps its real root cause (the exposure's origin) as its
    risk cluster. Separately, one headline is one bet: however many suppliers
    it names, it opens at most one cluster's allowance of positions and
    notional in total.
    """
    tradable = [
        e for e in exposures
        if not e.get("is_origin") and e.get("ticker") and e["score"] >= TRADE_THRESHOLD
    ]
    opened, skipped = [], []
    if not tradable:
        return {"opened": opened, "skipped": skipped}
    marks, market_error = await _marks([e["ticker"] for e in tradable])
    pm: PortfolioManager = state["portfolio"]
    limits = pm.risk.limits
    headline_notional = 0.0
    for e in tradable:
        symbol = perp_symbol(e["ticker"])
        mark = marks.get(e["ticker"])
        if not mark:
            skipped.append({"symbol": symbol, "kind": "no_mark",
                            "reason": market_error or f"no Bitget mark for {symbol}"})
            continue
        notional = round((18_000 + e["score"] * 42_000) / 500) * 500
        if (
            len(opened) >= limits.max_positions_per_cluster
            or headline_notional + notional > limits.max_cluster_notional_usdt
        ):
            skipped.append({"symbol": symbol, "kind": "risk", "reason": (
                "RISK: one headline is one bet — its cluster allowance "
                f"({limits.max_positions_per_cluster} positions / "
                f"{limits.max_cluster_notional_usdt:,.0f} USDT) is used")})
            continue
        try:
            position, detail, kind = await pm.open_short(
                ticker=e["ticker"],
                notional_usdt=notional,
                leverage=3 if e["score"] >= 0.55 else 2,
                mark=mark,
                thesis=f"{e.get('rationale', '')} — on: {headline[:160]}",
                origin=e["origin"],
                # The model's own implied drawdown becomes the profit target.
                target_pct=e["implied_drawdown_pct"],
                source=source,
            )
        except Exception as exc:
            # Recorded per exposure, so positions already opened for this
            # headline stay on its record.
            skipped.append({"symbol": symbol, "kind": "error",
                            "reason": f"{type(exc).__name__}: {exc}"[:200]})
            continue
        if position is None:
            skipped.append({"symbol": symbol, "kind": kind, "reason": detail})
        else:
            opened.append({"position": position, "detail": detail})
            headline_notional += position.notional_usdt
    return {"opened": opened, "skipped": skipped}


@app.post("/oracle", dependencies=ADMIN)
async def oracle(req: HeadlineRequest):
    """Ask the LLM to read one headline (spends LLM credits)."""
    nodes = await state["repo"].nodes()
    verdict: OracleVerdict = await state["oracle"].analyse(req.headline, nodes)
    return {"headline": req.headline, "source": req.source, "verdict": verdict}


@app.post("/oracle/act", dependencies=ADMIN)
async def oracle_act(req: HeadlineRequest):
    """headline -> LLM -> graph -> risk -> paper orders, for an operator-supplied
    headline. Positions opened here are recorded with source="manual"."""
    nodes = await state["repo"].nodes()
    verdict: OracleVerdict = await state["oracle"].analyse(req.headline, nodes)
    if not verdict.entities or verdict.shock <= 0:
        return {"verdict": verdict, "acted": False,
                "reason": "no graph entity resolved, or shock scored at zero"}
    exposures = await state["agent"].exposures_for(verdict.entities, verdict.shock)
    if not req.execute:
        return {"verdict": verdict, "acted": False,
                "reason": "execute=false — analysis only", "exposures": exposures}
    result = await _execute(exposures, req.headline, "manual")
    return {"verdict": verdict, "acted": True, "exposures": exposures, "execution": result}


@app.post("/contagion", dependencies=ADMIN)
async def contagion(req: ShockRequest):
    """What-if scoring of a hypothetical shock. Operator tool only."""
    return await _score(req.origin, req.shock)


@app.post("/execute", dependencies=ADMIN)
async def execute(req: ShockRequest):
    """Open paper positions for a hypothetical shock (source="manual")."""
    nodes = await state["repo"].nodes()
    if req.origin not in {n.id for n in nodes}:
        raise HTTPException(404, f"Unknown graph node: {req.origin}")
    exposures = await state["agent"].exposures_for([req.origin], req.shock)
    result = await _execute(exposures, req.headline, "manual")
    return {"exposures": exposures, **result}


@app.post("/agent/cycle", dependencies=ADMIN)
async def agent_cycle(execute: bool = False):
    """Run one sense-reason-act pass now, instead of waiting for the timer."""
    return await state["agent"].cycle(execute=execute)


# ---------------------------------------------------------------------------
# The paper book
# ---------------------------------------------------------------------------


@app.get("/positions")
async def positions():
    """The paper book, each position marked on its own venue: Bitget's demo
    mark for positions on Bitget's demo exchange, Bitget's live mark
    otherwise."""
    rows = await state["store"].all_positions(limit=500)
    open_rows = [p for p in rows if p.status == "OPEN"]
    try:
        marks, market_error = await state["portfolio"].position_marks(open_rows), None
    except Exception as exc:
        marks, market_error = {}, _market_error(exc)

    out, unrealized = [], 0.0
    for p in rows:
        item = p.model_dump()
        if p.status == "OPEN":
            mark = marks.get(p.id)
            item["mark"] = mark
            if mark:
                item["pnl_pct"] = round(p.pnl_pct(mark), 3)
                item["roe_pct"] = round(p.roe_pct(mark), 3)
                item["pnl_usdt"] = round(p.pnl_usdt(mark), 2)
                item["would_exit"] = PortfolioManager.evaluate_exit(p, mark)
                unrealized += p.pnl_usdt(mark)
        item["age_hours"] = round(p.age_hours(p.closed_at) if p.closed_at else p.age_hours(), 2)
        out.append(item)

    realized = sum(p.realized_pnl_usdt or 0.0 for p in rows)
    unpriced = sum(1 for p in open_rows if not marks.get(p.id))
    return {
        "positions": out,
        "open": len(open_rows),
        # A partial sum would understate the book; unknown is reported as such.
        "unrealized_usdt": round(unrealized, 2) if not unpriced else None,
        "realized_usdt": round(realized, 2),
        "paper": state["settings"].paper_trading,
        "venue": state["portfolio"].venue,
        "market_error": market_error,
    }


@app.post("/positions/sweep", dependencies=ADMIN)
async def sweep_now():
    """Force an immediate mark-and-exit pass instead of waiting for the loop."""
    return {"actions": await state["portfolio"].sweep()}


@app.post("/positions/{pid}/close", dependencies=ADMIN)
async def close_position(pid: str, price: float | None = Query(default=None, gt=0)):
    p, detail = await state["portfolio"].close_by_id(pid, CloseReason.MANUAL, price)
    if p is None:
        raise HTTPException(404, detail)
    return {"position": p, "detail": detail}


@app.get("/positions/reconcile", dependencies=ADMIN)
async def reconcile():
    """Our book vs the exchange's (signed request; operator only)."""
    return await state["portfolio"].reconcile()


@app.get("/positions/events")
async def position_events(limit: int = 100):
    return {"events": await state["store"].events(max(1, min(limit, 500)))}


@app.get("/paper/report")
async def paper_report():
    """Paper-trading performance: the quantitative half of the Agentic track."""
    rows = await state["store"].all_positions(limit=5000)
    closed = [p for p in rows if p.status == "CLOSED"]
    stats = await state["journal"].stats(closed)
    return {
        "mode": "paper",
        "marks": "Bitget stock-perp mark price, live",
        "fills": "simulated at the live price with modelled slippage, partials and rejects",
        "stats": stats,
        "closed_trades": [
            {
                "symbol": p.symbol, "origin": p.origin, "source": p.source,
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


@app.get("/venue")
async def venue():
    """Where paper trades are filled, and what that venue itself reports.

    On Bitget's demo exchange this reads Bitget's own view of the demo account
    (balances and open positions) so the record can be checked against the
    venue rather than taken from Cascadr's word."""
    pm: PortfolioManager = state["portfolio"]
    demo: BitgetDemo = state["demo"]
    nodes = await state["repo"].nodes()
    out: dict = {"venue": pm.venue}
    if pm.venue != "bitget-demo":
        out["detail"] = "simulated fills at Bitget's live prices (no Bitget demo key configured)"
        return out
    try:
        listed = await demo.instruments()
        out["graph_symbols_listed"] = sorted(
            perp_symbol(n.ticker) for n in nodes if n.ticker and perp_symbol(n.ticker) in listed
        )
        out["bitget_positions"] = [
            {k: r.get(k) for k in ("symbol", "posSide", "total", "size", "qty", "avgPrice",
                                   "openPriceAvg", "markPrice", "unrealisedPnl", "unrealizedPL",
                                   "leverage", "createdTime", "updatedTime") if k in r}
            for r in await demo.positions()
        ]
        assets = await demo.assets()
        out["bitget_account"] = assets
    except Exception as exc:
        out["error"] = f"{type(exc).__name__}: {str(exc)[:160]}"
    return out


@app.get("/risk")
async def risk_snapshot():
    """Portfolio exposure, cluster concentration and drawdown state."""
    pm: PortfolioManager = state["portfolio"]
    try:
        realized, unrealized, unpriced = await pm.book_pnl_for_risk()
    except Exception as exc:
        # Drawdown cannot be computed without marks; do not report a guess.
        raise HTTPException(503, _market_error(exc)) from exc
    snap = pm.risk.snapshot(await state["store"].open_positions(), realized, unrealized)
    # The same figures the risk engine decides on, with any stand-in named.
    snap["unpriced"] = unpriced
    if unpriced:
        snap["note"] = "unpriced positions are valued at their stop-loss for the drawdown check"
    return snap


@app.get("/policy")
async def policy():
    """The exit policy new positions inherit, and where the numbers come from."""
    d = ExitPolicy().model_dump()
    d["provenance"] = (
        "max_hold_hours = 5 US trading days (7 calendar days), the window the "
        "event study in research/ measured; take_profit_pct is set per position "
        "from the model's implied drawdown."
    )
    return d


# ---------------------------------------------------------------------------
# Filings
# ---------------------------------------------------------------------------


@app.post("/ingest/edgar/refresh", dependencies=ADMIN)
async def refresh_disclosed_edges():
    """Re-read every tradable name's latest 10-K and report the concentration
    sentences the extractor finds. Candidates only: pattern matching misreads
    filings (a regional revenue share, a table heading, a top-five total), so
    nothing it finds is served until a person has checked it against the
    filing and added it to app/graph/data/filing_facts.json."""
    nodes = await state["repo"].nodes()
    return await ingest_disclosed_edges(state["edgar"], nodes)


@app.get("/ingest/edgar/{ticker}", dependencies=ADMIN)
async def ingest_edgar(ticker: str):
    """Fetch concentration facts from a live 10-K (outbound SEC request)."""
    return {"ticker": ticker.upper(), "concentrations": await state["edgar"].concentrations(ticker)}
