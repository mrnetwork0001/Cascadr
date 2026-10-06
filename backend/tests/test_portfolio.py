"""Exit-rule and persistence tests.

These pin the behaviour that decides when real money stops being at risk, so
they assert the boundaries explicitly rather than trusting the happy path.
"""

from datetime import UTC, datetime, timedelta

import pytest

from app.models import CloseReason, ExitPolicy, Position, PositionStatus
from app.portfolio.manager import PortfolioManager
from app.portfolio.store import PositionStore

ENTRY = 200.0


def make(
    *, entry: float = ENTRY, hours_old: float = 0.0, target: float | None = 5.5,
    stop: float = 6.0, hold: float = 120.0,
) -> Position:
    return Position(
        id="p1", symbol="NVDAUSDT", side="SHORT", size=100.0,
        notional_usdt=20_000.0, leverage=2, entry_price=entry,
        opened_at=datetime.now(UTC) - timedelta(hours=hours_old),
        policy=ExitPolicy(max_hold_hours=hold, stop_loss_pct=stop, take_profit_pct=target),
    )


ev = PortfolioManager.evaluate_exit


# --- direction -------------------------------------------------------------

def test_short_profits_when_price_falls():
    assert make().pnl_pct(190.0) == pytest.approx(5.0)


def test_short_loses_when_price_rises():
    assert make().pnl_pct(210.0) == pytest.approx(-5.0)


def test_pnl_does_not_double_count_leverage():
    # notional is the full position value: a 5% favourable move on a 20k
    # position is 1,000 USDT whatever the leverage. The old formula multiplied
    # by leverage again and reported 2,000.
    assert make().pnl_usdt(190.0) == pytest.approx(1000.0)


def test_leverage_shows_up_in_return_on_margin():
    # 20k at 2x posts 10k of margin; 1,000 on 10k is 10%.
    assert make().roe_pct(190.0) == pytest.approx(10.0)


# --- exit precedence -------------------------------------------------------

def test_holds_while_nothing_has_happened():
    assert ev(make(), 199.0) is None


def test_take_profit_at_the_modelled_drawdown():
    assert ev(make(target=5.5), 189.0) is CloseReason.TAKE_PROFIT


def test_stop_loss_on_adverse_move():
    assert ev(make(stop=6.0), 213.0) is CloseReason.STOP_LOSS


def test_time_stop_after_the_validated_window():
    assert ev(make(hours_old=121), 199.0) is CloseReason.TIME_STOP


def test_default_hold_is_five_trading_days():
    """5 US trading days = 7 calendar days = 168h, the window research/ measured."""
    assert ExitPolicy().max_hold_hours == 168.0


def test_stop_loss_outranks_time_stop():
    """An old, losing position must stop out — not linger to its time stop."""
    assert ev(make(hours_old=999, stop=6.0), 220.0) is CloseReason.STOP_LOSS


def test_no_take_profit_when_target_is_unset():
    assert ev(make(target=None), 150.0) is None


# --- boundaries ------------------------------------------------------------

def test_stop_triggers_exactly_at_threshold():
    assert ev(make(stop=6.0), ENTRY * 1.06) is CloseReason.STOP_LOSS


def test_just_inside_the_stop_still_holds():
    assert ev(make(stop=6.0, target=None), ENTRY * 1.0599) is None


def test_time_stop_triggers_exactly_at_the_hour():
    assert ev(make(hours_old=120.0), 199.0) is CloseReason.TIME_STOP


# --- persistence -----------------------------------------------------------

@pytest.mark.asyncio
async def test_book_survives_a_restart(tmp_path):
    db = tmp_path / "t.db"
    store = PositionStore(db)
    p = make()
    p.client_oid = "cascadr-tsmc-nvda"
    assert await store.add(p) is True
    store.close()

    # A brand new process, same file.
    again = PositionStore(db)
    rows = await again.open_positions()
    assert len(rows) == 1 and rows[0].symbol == "NVDAUSDT"
    again.close()


@pytest.mark.asyncio
async def test_duplicate_thesis_is_rejected(tmp_path):
    store = PositionStore(tmp_path / "t.db")
    a, b = make(), make()
    a.client_oid = b.client_oid = "cascadr-tsmc-nvda"
    b.id = "p2"
    assert await store.add(a) is True
    assert await store.add(b) is False, "a replayed signal must not double risk"
    store.close()


@pytest.mark.asyncio
async def test_closing_records_reason_and_pnl(tmp_path):
    store = PositionStore(tmp_path / "t.db")
    p = make()
    await store.add(p)
    assert await store.mark_closed(p.id, 190.0, CloseReason.TAKE_PROFIT, 2000.0, p.size)

    assert await store.open_positions() == []
    done = await store.get(p.id)
    assert done.status is PositionStatus.CLOSED
    assert done.close_reason is CloseReason.TAKE_PROFIT
    assert done.realized_pnl_usdt == pytest.approx(2000.0)  # value passed in
    assert any(e["kind"] == "CLOSED" for e in await store.events())
    store.close()


@pytest.mark.asyncio
async def test_a_closed_thesis_can_be_traded_again(tmp_path):
    """The guard is one OPEN position per thesis. Previously a closed
    TSMC->AMD position blocked TSMC->AMD forever."""
    store = PositionStore(tmp_path / "t.db")
    a = make(); a.client_oid = "cascadr-tsmc-amd"
    await store.add(a)
    await store.mark_closed(a.id, 190.0, CloseReason.TIME_STOP, 10.0, a.size)
    b = make(); b.id = "p2"; b.client_oid = "cascadr-tsmc-amd"
    assert await store.add(b) is True
    store.close()


@pytest.mark.asyncio
async def test_partial_close_books_the_slice_pnl(tmp_path):
    store = PositionStore(tmp_path / "t.db")
    p = make()
    await store.add(p)
    assert await store.partial_close(p.id, p.size, 60.0, 60.0 * ENTRY, 400.0, "partial")
    assert await store.mark_closed(p.id, 190.0, CloseReason.TAKE_PROFIT, 600.0, 60.0)
    done = await store.get(p.id)
    # Slice and remainder both counted; the slice used to be dropped.
    assert done.realized_pnl_usdt == pytest.approx(1000.0)
    assert done.close_attempts == 1
    store.close()


@pytest.mark.asyncio
async def test_rejected_close_bumps_the_attempt_counter(tmp_path):
    store = PositionStore(tmp_path / "t.db")
    p = make()
    await store.add(p)
    await store.close_rejected(p.id, "venue rejected")
    await store.close_rejected(p.id, "venue rejected")
    assert (await store.get(p.id)).close_attempts == 2
    store.close()


def test_paper_retry_is_a_new_draw():
    """Same order, successive attempts must not all share one outcome."""
    from app.market.paper import PaperBroker
    b = PaperBroker(reject_rate=0.5, partial_rate=0.0)
    outcomes = {b.fill(client_oid="x:close", side="buy", size=1, mark=100.0, attempt=a).accepted
                for a in range(1, 30)}
    assert outcomes == {True, False}


def test_upgrading_an_old_database(tmp_path):
    """A book written by the previous schema opens and gains the new columns."""
    import sqlite3
    db = tmp_path / "old.db"
    c = sqlite3.connect(db)
    c.executescript("""
      CREATE TABLE positions (id TEXT PRIMARY KEY, symbol TEXT NOT NULL, side TEXT NOT NULL,
        size REAL NOT NULL, notional_usdt REAL NOT NULL, leverage INTEGER NOT NULL,
        entry_price REAL NOT NULL, opened_at TEXT NOT NULL, thesis TEXT NOT NULL DEFAULT '',
        origin TEXT NOT NULL DEFAULT '', client_oid TEXT NOT NULL DEFAULT '',
        paper INTEGER NOT NULL DEFAULT 1, status TEXT NOT NULL, policy TEXT NOT NULL,
        closed_at TEXT, exit_price REAL, close_reason TEXT, realized_pnl_usdt REAL);
      CREATE UNIQUE INDEX ux_positions_client_oid ON positions(client_oid) WHERE client_oid != '';
    """)
    c.commit(); c.close()
    store = PositionStore(db)
    cols = {r[1] for r in store.conn.execute("PRAGMA table_info(positions)")}
    assert {"source", "close_attempts"} <= cols
    idx = {r[1] for r in store.conn.execute("PRAGMA index_list(positions)")}
    assert "ux_positions_client_oid" not in idx and "ux_positions_open_client_oid" in idx
    store.close()


@pytest.mark.asyncio
async def test_a_stale_close_books_nothing(tmp_path):
    """Two closes priced on the same snapshot: only the first may book."""
    store = PositionStore(tmp_path / "t.db")
    p = make()
    await store.add(p)
    assert await store.partial_close(p.id, 100.0, 60.0, 60.0 * ENTRY, 400.0, "first")
    assert not await store.partial_close(p.id, 100.0, 60.0, 60.0 * ENTRY, 400.0, "stale")
    assert not await store.mark_closed(p.id, 190.0, CloseReason.STOP_LOSS, 999.0, 100.0)
    done = await store.get(p.id)
    assert done.status is PositionStatus.OPEN and done.realized_pnl_usdt == pytest.approx(400.0)
    store.close()


@pytest.mark.asyncio
async def test_concurrent_closes_through_the_manager_book_once(tmp_path):
    from app.market.paper import PaperBroker

    class Venue:
        async def close_position(self, *a):
            return True, True, "paper", None

    store = PositionStore(tmp_path / "t.db")
    p = make()
    await store.add(p)
    pm = PortfolioManager(store, Venue(), paper=PaperBroker(reject_rate=0.0, partial_rate=0.0))
    import asyncio
    results = await asyncio.gather(*(pm.close(p, 190.0, CloseReason.MANUAL) for _ in range(3)))
    assert results.count("already closed") == 2
    done = await store.get(p.id)
    assert done.status is PositionStatus.CLOSED
    assert done.realized_pnl_usdt == pytest.approx(pm._slice_pnl(p, p.size, done.exit_price))
    store.close()


def test_legacy_book_is_restated_once(tmp_path):
    """Closed P&L written by the leverage-doubled formula is restated exactly;
    the equity journal it produced is set aside, not served."""
    import sqlite3
    from app.portfolio.journal import Journal
    db = tmp_path / "legacy.db"
    store = PositionStore(db)
    j = Journal(store.conn)
    p = make()
    store.conn.execute("DELETE FROM store_meta")  # as if written before the fix
    store._insert(p)
    store.conn.execute(
        "UPDATE positions SET status='CLOSED', exit_price=210.0, realized_pnl_usdt=-2000.0")
    store.conn.execute(
        "INSERT INTO equity_snapshots (at, equity_usdt, realized_usdt, unrealized_usdt, "
        "gross_notional, open_positions) VALUES ('2026-01-01', 98000, -2000, 0, 0, 0)")
    store.conn.commit(); store.close()

    store = PositionStore(db)
    row = store.conn.execute("SELECT realized_pnl_usdt FROM positions").fetchone()
    assert row[0] == pytest.approx(-1000.0)  # 100 units x (200 - 210), leverage not re-applied
    assert store.conn.execute("SELECT COUNT(*) FROM equity_snapshots").fetchone()[0] == 0
    assert store.conn.execute("SELECT COUNT(*) FROM equity_snapshots_legacy").fetchone()[0] == 1
    store.conn.execute("UPDATE positions SET realized_pnl_usdt=-5")
    store.conn.commit(); store.close()
    store = PositionStore(db)  # second start: nothing restated again
    assert store.conn.execute("SELECT realized_pnl_usdt FROM positions").fetchone()[0] == -5
    store.close()


@pytest.mark.asyncio
async def test_concurrent_misses_make_one_upstream_call():
    import asyncio
    import httpx
    from app.config import Settings
    from app.market.bitget import BitgetClient
    calls = 0

    async def handler(request):
        nonlocal calls
        calls += 1
        await asyncio.sleep(0.05)
        return httpx.Response(200, json={"data": [{"symbol": "NVDAUSDT", "markPrice": "1"}]})

    c = BitgetClient(Settings(), httpx.AsyncClient(
        base_url="https://x", transport=httpx.MockTransport(handler)))
    await asyncio.gather(*(c.marks(["NVDA"]) for _ in range(50)))
    assert calls == 1
    await c.aclose()


def test_open_fills_are_drawn_per_order():
    """Seeding by thesis alone made some theses rejected forever."""
    from app.market.paper import PaperBroker
    b = PaperBroker(reject_rate=0.5, partial_rate=0.0)
    draws = {b.fill(client_oid=f"cascadr-asml-aapl-{i:08x}:open", side="sell",
                    size=1, mark=100.0).accepted for i in range(40)}
    assert draws == {True, False}


@pytest.mark.asyncio
async def test_concurrent_reads_of_one_query_are_consistent(tmp_path):
    """Two threads running the same SQL on the shared connection used to
    reset each other's cursor: books came back empty or half-read."""
    import asyncio
    store = PositionStore(tmp_path / "t.db")
    for i in range(3):
        p = make(); p.id = f"p{i}"; p.client_oid = f"cascadr-x-{i}"
        await store.add(p)
    for _ in range(100):
        results = await asyncio.gather(*(store.all_positions(limit=5000) for _ in range(4)),
                                       *(store.open_positions() for _ in range(4)))
        assert all(len(r) == 3 for r in results)
    store.close()


@pytest.mark.asyncio
async def test_a_slow_failure_is_shared_by_everyone_waiting():
    import asyncio
    import time
    import httpx
    from app.config import Settings
    from app.market import bitget
    from app.market.bitget import BitgetClient
    calls = 0

    async def handler(request):
        nonlocal calls
        calls += 1
        await asyncio.sleep(bitget.FAILURE_TTL_SECONDS + 0.2)
        return httpx.Response(503)

    bitget.FAILURE_TTL_SECONDS, saved = 0.3, bitget.FAILURE_TTL_SECONDS
    try:
        c = BitgetClient(Settings(), httpx.AsyncClient(
            base_url="https://x", transport=httpx.MockTransport(handler)))
        t = time.monotonic()
        results = await asyncio.gather(*(c.marks(["NVDA"]) for _ in range(5)), return_exceptions=True)
        assert all(isinstance(r, Exception) for r in results)
        assert calls == 1 and time.monotonic() - t < 2 * (bitget.FAILURE_TTL_SECONDS + 0.2)
        await c.aclose()
    finally:
        bitget.FAILURE_TTL_SECONDS = saved


@pytest.mark.asyncio
async def test_closed_row_shows_the_whole_trade(tmp_path):
    """After partial fills, the closed row keeps its opened size and an
    average exit, so realized = (entry - exit) x size still checks."""
    store = PositionStore(tmp_path / "t.db")
    p = make()  # short 100 @ 200
    await store.add(p)
    assert await store.partial_close(p.id, 100.0, 40.0, 40.0 * ENTRY, 600.0, "partial")  # 60 @ 190
    live = await store.get(p.id)
    final = PortfolioManager._slice_pnl(live, live.size, 195.0)  # 40 @ 195 -> +200
    assert await store.mark_closed(p.id, PortfolioManager._average_exit(live, final, 195.0),
                                   CloseReason.TAKE_PROFIT, final, live.size)
    done = await store.get(p.id)
    assert done.size == 100.0 and done.notional_usdt == 20_000.0
    assert done.realized_pnl_usdt == pytest.approx(800.0)
    assert (done.entry_price - done.exit_price) * done.size == pytest.approx(800.0)
    store.close()


@pytest.mark.asyncio
async def test_an_unpriced_position_does_not_freeze_the_book(tmp_path):
    """Reported equity stays unknown, but risk values the unpriced position at
    its stop-loss so the book can still act, and it can be closed by price."""
    class Venue:
        async def marks(self, tickers):
            return {t: 100.0 for t in tickers if t != "NVDA"}

        async def close_position(self, *a):
            return True, True, "paper", None

    from app.market.paper import PaperBroker
    store = PositionStore(tmp_path / "t.db")
    p = make()  # NVDA short, 20k notional, 6% stop
    await store.add(p)
    pm = PortfolioManager(store, Venue(), paper=PaperBroker(reject_rate=0.0, partial_rate=0.0))
    assert (await pm.book_pnl())[1] is None
    realized, unrealized, unpriced = await pm.book_pnl_for_risk()
    assert unpriced == ["NVDAUSDT"] and unrealized == pytest.approx(-1200.0)
    _, detail = await pm.close_by_id(p.id)
    assert "refusing to close blind" in detail
    _, detail = await pm.close_by_id(p.id, price=195.0)
    done = await store.get(p.id)
    # Booked at the operator's price, less the paper venue's modelled slippage.
    assert done.status is PositionStatus.CLOSED and 480.0 < done.realized_pnl_usdt <= 500.0
    assert any(e["kind"] == "PRICE_OVERRIDE" for e in await store.events())
    store.close()


def test_caps_scale_with_the_paper_account():
    from app.risk import RiskLimits
    full, half = RiskLimits.for_equity(100_000), RiskLimits.for_equity(50_000)
    assert full == RiskLimits()  # 100k reproduces the defaults exactly
    assert half.max_cluster_notional_usdt == 50_000 and half.max_gross_notional_usdt == 125_000
    assert half.max_positions_per_cluster == full.max_positions_per_cluster
