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


def test_pnl_scales_with_leverage():
    # 5% favourable move on 20k at 2x == 2000 USDT
    assert make().pnl_usdt(190.0) == pytest.approx(2000.0)


# --- exit precedence -------------------------------------------------------

def test_holds_while_nothing_has_happened():
    assert ev(make(), 199.0) is None


def test_take_profit_at_the_modelled_drawdown():
    assert ev(make(target=5.5), 189.0) is CloseReason.TAKE_PROFIT


def test_stop_loss_on_adverse_move():
    assert ev(make(stop=6.0), 213.0) is CloseReason.STOP_LOSS


def test_time_stop_after_the_validated_window():
    assert ev(make(hours_old=121), 199.0) is CloseReason.TIME_STOP


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
    await store.mark_closed(p.id, 190.0, CloseReason.TAKE_PROFIT, 2000.0)

    assert await store.open_positions() == []
    done = await store.get(p.id)
    assert done.status is PositionStatus.CLOSED
    assert done.close_reason is CloseReason.TAKE_PROFIT
    assert done.realized_pnl_usdt == pytest.approx(2000.0)
    assert any(e["kind"] == "CLOSED" for e in await store.events())
    store.close()
