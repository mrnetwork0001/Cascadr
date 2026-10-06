"""Paper-trading journal.

Agentic Trading is judged 50% on quantitative paper-trading results: Sharpe,
max drawdown, win rate. Those cannot be computed from a list of open positions
- they need an equity *time series*. This records one every sweep.

Everything here is real: real Bitget marks, real positions, real exits. Only
the fills are simulated, and they carry modelled slippage. Nothing is
backfilled - the series starts when the agent starts.
"""

import asyncio
import math
import sqlite3
from datetime import UTC, datetime

from app import db

SCHEMA = """
CREATE TABLE IF NOT EXISTS equity_snapshots (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    at             TEXT NOT NULL,
    equity_usdt    REAL NOT NULL,
    realized_usdt  REAL NOT NULL,
    unrealized_usdt REAL NOT NULL,
    gross_notional REAL NOT NULL,
    open_positions INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_snapshots_at ON equity_snapshots(at);
"""


class Journal:
    def __init__(self, conn: sqlite3.Connection, starting_equity: float = 100_000.0):
        self._conn = conn
        self._conn.executescript(SCHEMA)
        self._conn.commit()
        self.starting_equity = starting_equity
        self._lock = asyncio.Lock()

    def _record(self, realized, unrealized, gross, n) -> None:
        self._conn.execute(
            """INSERT INTO equity_snapshots
               (at, equity_usdt, realized_usdt, unrealized_usdt, gross_notional, open_positions)
               VALUES (?,?,?,?,?,?)""",
            (
                datetime.now(UTC).isoformat(),
                self.starting_equity + realized + unrealized,
                realized, unrealized, gross, n,
            ),
        )
        self._conn.commit()

    async def record(self, realized: float, unrealized: float, gross: float, n: int):
        async with self._lock:
            await db.run(self._record, realized, unrealized, gross, n)

    async def series(self, limit: int = 20_000) -> list[dict]:
        rows = await db.run(
            lambda: self._conn.execute(
                "SELECT * FROM equity_snapshots ORDER BY at LIMIT ?", (limit,)
            ).fetchall()
        )
        return [dict(r) for r in rows]

    async def stats(self, closed: list) -> dict:
        """Sharpe, max drawdown and win rate from the recorded series.

        Sharpe is annualised from the observed sampling interval. With only
        hours of history it is not a meaningful estimate, so `samples` and
        `hours_tracked` are reported alongside - a Sharpe from 40 minutes of
        data should be read as diagnostic, not as performance.
        """
        s = await self.series()
        if len(s) < 3:
            return {
                "samples": len(s),
                "hours_tracked": 0.0,
                "note": "insufficient history - the series starts when the agent starts",
            }

        eq = [r["equity_usdt"] for r in s]
        t0 = datetime.fromisoformat(s[0]["at"])
        t1 = datetime.fromisoformat(s[-1]["at"])
        hours = (t1 - t0).total_seconds() / 3600.0

        rets = [
            (eq[i] - eq[i - 1]) / eq[i - 1]
            for i in range(1, len(eq))
            if eq[i - 1] > 0
        ]
        mean = sum(rets) / len(rets) if rets else 0.0
        var = sum((r - mean) ** 2 for r in rets) / (len(rets) - 1) if len(rets) > 1 else 0.0
        sd = math.sqrt(var)

        # Annualise from the actual observed interval rather than assuming daily.
        interval_h = hours / max(len(rets), 1)
        periods_per_year = (365 * 24) / interval_h if interval_h > 0 else 0
        sharpe = (mean / sd * math.sqrt(periods_per_year)) if sd > 0 else None

        peak, max_dd = eq[0], 0.0
        for v in eq:
            peak = max(peak, v)
            max_dd = max(max_dd, (peak - v) / peak if peak else 0.0)

        wins = [p for p in closed if (p.realized_pnl_usdt or 0) > 0]
        return {
            "samples": len(s),
            "hours_tracked": round(hours, 2),
            "starting_equity": self.starting_equity,
            "current_equity": round(eq[-1], 2),
            "total_return_pct": round((eq[-1] / eq[0] - 1) * 100, 4),
            "sharpe_annualised": round(sharpe, 2) if sharpe is not None else None,
            "max_drawdown_pct": round(max_dd * 100, 3),
            "closed_trades": len(closed),
            "win_rate_pct": round(len(wins) / len(closed) * 100, 1) if closed else None,
            "caveat": (
                "Sharpe annualised from a short window is diagnostic, not "
                "performance. Judge it against hours_tracked."
            ),
        }
