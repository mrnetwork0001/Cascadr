"""Portfolio risk tests.

The cluster limit is the important one: a contagion cascade produces several
tickers that are really a single bet, and sizing them independently is the
failure mode this layer exists to prevent.
"""

from datetime import UTC, datetime

import pytest

from app.models import Position
from app.risk import RiskLimits, RiskManager


def pos(origin: str, notional: float, symbol: str = "NVDAUSDT") -> Position:
    return Position(
        id=f"{origin}-{symbol}-{notional}", symbol=symbol, side="SHORT", size=1.0,
        notional_usdt=notional, leverage=2, entry_price=100.0,
        opened_at=datetime.now(UTC), origin=origin,
    )


def rm(**kw) -> RiskManager:
    return RiskManager(RiskLimits(**kw))


def test_allows_a_first_position():
    d = rm().vet(cluster="TSMC", requested_notional=20_000, open_positions=[])
    assert d.allowed and d.approved_notional_usdt == 20_000


def test_cluster_position_count_is_capped():
    """Five names from one shock is one bet - the cap must bite at three."""
    book = [pos("TSMC", 10_000, s) for s in ("NVDAUSDT", "AAPLUSDT", "AMDUSDT")]
    d = rm(max_positions_per_cluster=3).vet(
        cluster="TSMC", requested_notional=10_000, open_positions=book
    )
    assert not d.allowed
    assert "share one root cause" in d.reason


def test_a_different_shock_is_a_different_cluster():
    book = [pos("TSMC", 10_000, s) for s in ("NVDAUSDT", "AAPLUSDT", "AMDUSDT")]
    d = rm(max_positions_per_cluster=3).vet(
        cluster="MAERSK", requested_notional=10_000, open_positions=book
    )
    assert d.allowed, "an unrelated shock must not be blocked by another cluster"


def test_cluster_notional_scales_rather_than_rejects():
    book = [pos("TSMC", 90_000, "NVDAUSDT")]
    d = rm(max_cluster_notional_usdt=100_000).vet(
        cluster="TSMC", requested_notional=40_000, open_positions=book
    )
    assert d.allowed and d.scaled
    assert d.approved_notional_usdt == pytest.approx(10_000)


def test_rejects_when_headroom_is_below_the_minimum():
    book = [pos("TSMC", 99_500, "NVDAUSDT")]
    d = rm(max_cluster_notional_usdt=100_000, min_notional_usdt=2_000).vet(
        cluster="TSMC", requested_notional=20_000, open_positions=book
    )
    assert not d.allowed


def test_gross_limit_binds_across_clusters():
    book = [pos(f"S{i}", 40_000, f"X{i}USDT") for i in range(6)]
    d = rm(max_gross_notional_usdt=250_000, max_positions_total=99).vet(
        cluster="NEW", requested_notional=50_000, open_positions=book
    )
    assert d.allowed and d.scaled
    assert d.approved_notional_usdt == pytest.approx(10_000)


def test_drawdown_halts_all_new_risk():
    d = rm(starting_equity_usdt=100_000, max_drawdown_pct=15).vet(
        cluster="TSMC", requested_notional=1_000, open_positions=[],
        realized_pnl=-12_000, unrealized_pnl=-4_000,
    )
    assert not d.allowed and "HALTED" in d.reason


def test_profit_never_counts_as_drawdown():
    assert rm().drawdown_pct(realized=5_000, unrealized=1_000) == 0.0


def test_snapshot_reports_cluster_concentration():
    book = [pos("TSMC", 40_000, "NVDAUSDT"), pos("TSMC", 30_000, "AAPLUSDT")]
    snap = rm().snapshot(book, realized=0.0, unrealized=-500.0)
    assert snap["clusters"]["TSMC"]["positions"] == 2
    assert snap["clusters"]["TSMC"]["notional"] == pytest.approx(70_000)
    assert not snap["halted"]


def test_same_ticker_cannot_be_shorted_twice_across_clusters():
    """Two shocks can both implicate NVDA. That is one exposure, not two."""
    book = [pos("TSMC", 30_000, "NVDAUSDT")]
    d = rm().vet(
        cluster="SK_HYNIX", symbol="NVDAUSDT",
        requested_notional=20_000, open_positions=book,
    )
    assert not d.allowed
    assert "one exposure, not two" in d.reason


def test_a_different_ticker_in_a_new_cluster_is_fine():
    book = [pos("TSMC", 30_000, "NVDAUSDT")]
    d = rm().vet(
        cluster="SK_HYNIX", symbol="DELLUSDT",
        requested_notional=20_000, open_positions=book,
    )
    assert d.allowed
