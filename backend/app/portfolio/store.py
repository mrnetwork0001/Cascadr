"""Durable position storage.

SQLite via the standard library: no service to run, no extra dependency, and
the book survives a restart — which is the whole point. Writes are tiny and
infrequent, but they still run in a worker thread (app.db.run) so a disk stall can
never block the event loop.

Every lifecycle transition also appends to `position_events`, giving an audit
trail you can reconstruct the book from if the positions table is ever wrong.
"""

import asyncio
import json
import sqlite3
from datetime import UTC, datetime
from pathlib import Path

from app import db
from app.models import CloseReason, ExitPolicy, Position, PositionStatus

SCHEMA = """
CREATE TABLE IF NOT EXISTS positions (
    id                TEXT PRIMARY KEY,
    symbol            TEXT NOT NULL,
    side              TEXT NOT NULL,
    size              REAL NOT NULL,
    notional_usdt     REAL NOT NULL,
    leverage          INTEGER NOT NULL,
    entry_price       REAL NOT NULL,
    opened_at         TEXT NOT NULL,
    thesis            TEXT NOT NULL DEFAULT '',
    origin            TEXT NOT NULL DEFAULT '',
    client_oid        TEXT NOT NULL DEFAULT '',
    paper             INTEGER NOT NULL DEFAULT 1,
    status            TEXT NOT NULL,
    policy            TEXT NOT NULL,
    closed_at         TEXT,
    exit_price        REAL,
    close_reason      TEXT,
    realized_pnl_usdt REAL,
    source            TEXT NOT NULL DEFAULT 'unknown',
    close_attempts    INTEGER NOT NULL DEFAULT 0,
    original_size          REAL,
    original_notional_usdt REAL
);

CREATE TABLE IF NOT EXISTS store_meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_positions_status ON positions(status);

CREATE TABLE IF NOT EXISTS position_events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    position_id TEXT NOT NULL,
    at          TEXT NOT NULL,
    kind        TEXT NOT NULL,
    detail      TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS ix_events_position ON position_events(position_id);
"""

# Applied after SCHEMA so databases created by earlier versions are upgraded
# in place. Each step is idempotent.
MIGRATIONS = [
    # Rows from before the column existed cannot say who opened them.
    "ALTER TABLE positions ADD COLUMN source TEXT NOT NULL DEFAULT 'unknown'",
    "ALTER TABLE positions ADD COLUMN close_attempts INTEGER NOT NULL DEFAULT 0",
    # The old guard covered CLOSED rows too, so once a thesis had been traded
    # and closed (e.g. TSMC->AMD) it could never be traded again. Only one
    # OPEN position per thesis is the actual invariant.
    "DROP INDEX IF EXISTS ux_positions_client_oid",
    """CREATE UNIQUE INDEX IF NOT EXISTS ux_positions_open_client_oid
         ON positions(client_oid) WHERE client_oid != '' AND status = 'OPEN'""",
    "ALTER TABLE positions ADD COLUMN original_size REAL",
    "ALTER TABLE positions ADD COLUMN original_notional_usdt REAL",
    # Rows from before these columns. Where no slice was ever booked the
    # current size is the size as opened; an open row that was already
    # partially closed is left unknown rather than given a wrong original.
    """UPDATE positions SET original_size = size, original_notional_usdt = notional_usdt
         WHERE original_size IS NULL
           AND (status = 'CLOSED' OR realized_pnl_usdt IS NULL)""",
]


def _row_to_position(r: sqlite3.Row) -> Position:
    return Position(
        id=r["id"],
        symbol=r["symbol"],
        side=r["side"],
        size=r["size"],
        notional_usdt=r["notional_usdt"],
        leverage=r["leverage"],
        entry_price=r["entry_price"],
        opened_at=datetime.fromisoformat(r["opened_at"]),
        thesis=r["thesis"],
        origin=r["origin"],
        client_oid=r["client_oid"],
        paper=bool(r["paper"]),
        status=PositionStatus(r["status"]),
        policy=ExitPolicy(**json.loads(r["policy"])),
        closed_at=datetime.fromisoformat(r["closed_at"]) if r["closed_at"] else None,
        exit_price=r["exit_price"],
        close_reason=CloseReason(r["close_reason"]) if r["close_reason"] else None,
        realized_pnl_usdt=r["realized_pnl_usdt"],
        source=r["source"],
        close_attempts=r["close_attempts"],
        original_size=r["original_size"],
        original_notional_usdt=r["original_notional_usdt"],
    )


class PositionStore:
    def __init__(self, path: str | Path = "cascadr.db"):
        self.path = str(path)
        self._conn = sqlite3.connect(self.path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        # Survive an unclean shutdown without corrupting the book.
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.executescript(SCHEMA)
        for stmt in MIGRATIONS:
            try:
                self._conn.execute(stmt)
            except sqlite3.OperationalError as exc:
                # "duplicate column name" on an already-upgraded database.
                if "duplicate column" not in str(exc):
                    raise
        self._restate_pnl_formula()
        self._conn.commit()
        self._lock = asyncio.Lock()

    def _restate_pnl_formula(self) -> None:
        """One-time fix for books written before P&L stopped applying leverage
        twice (notional already includes it). Closed positions are restated
        exactly: realized = direction x (entry - exit) x size. Equity snapshots
        cannot be restated from what was stored, so they are moved to
        equity_snapshots_legacy and the journal starts again, rather than
        serving a curve built from the wrong formula."""
        done = self._conn.execute(
            "SELECT value FROM store_meta WHERE key='pnl_formula'"
        ).fetchone()
        if done:
            return
        if self._conn.execute("SELECT COUNT(*) FROM positions").fetchone()[0]:
            self._conn.execute(
                """UPDATE positions SET realized_pnl_usdt =
                       (CASE WHEN upper(side)='SHORT' THEN 1.0 ELSE -1.0 END)
                       * (entry_price - exit_price) * size
                   WHERE status='CLOSED' AND exit_price IS NOT NULL"""
            )
            has_journal = self._conn.execute(
                "SELECT 1 FROM sqlite_master WHERE type='table' AND name='equity_snapshots'"
            ).fetchone()
            if has_journal:
                self._conn.execute(
                    "CREATE TABLE IF NOT EXISTS equity_snapshots_legacy AS "
                    "SELECT * FROM equity_snapshots WHERE 0"
                )
                self._conn.execute(
                    "INSERT INTO equity_snapshots_legacy SELECT * FROM equity_snapshots"
                )
                self._conn.execute("DELETE FROM equity_snapshots")
        self._conn.execute(
            "INSERT INTO store_meta (key, value) VALUES ('pnl_formula', 'notional_x_move')"
        )

    @property
    def conn(self) -> sqlite3.Connection:
        return self._conn

    def close(self) -> None:
        self._conn.close()

    # -- sync internals, always called via db.run ----------------------

    def _insert(self, p: Position) -> None:
        self._conn.execute(
            """INSERT INTO positions (id, symbol, side, size, notional_usdt, leverage,
                   entry_price, opened_at, thesis, origin, client_oid, paper, status,
                   policy, source, original_size, original_notional_usdt)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                p.id, p.symbol, p.side, p.size, p.notional_usdt, p.leverage,
                p.entry_price, p.opened_at.isoformat(), p.thesis, p.origin,
                p.client_oid, int(p.paper), p.status.value, p.policy.model_dump_json(),
                p.source, p.size, p.notional_usdt,
            ),
        )
        self._event(
            p.id, "OPENED",
            f"{p.side} {p.symbol} {p.notional_usdt:.0f} USDT @ {p.entry_price:.4f} ({p.source})",
        )
        self._conn.commit()

    def _event(self, position_id: str, kind: str, detail: str = "") -> None:
        self._conn.execute(
            "INSERT INTO position_events (position_id, at, kind, detail) VALUES (?,?,?,?)",
            (position_id, datetime.now(UTC).isoformat(), kind, detail),
        )

    def _close(
        self, pid: str, exit_price: float, reason: CloseReason, pnl: float, size: float,
        last_fill: float | None = None,
    ) -> bool:
        booked = self._conn.execute(
            "SELECT realized_pnl_usdt FROM positions WHERE id=?", (pid,)
        ).fetchone()
        earlier = (booked[0] if booked else None) or 0.0
        # Adds to whatever earlier partial closes already booked. Conditional
        # on the state the caller priced, so a concurrent close cannot book
        # the same units twice.
        # The closed row shows the whole trade: size and notional as opened,
        # and exit_price as the size-weighted average across every slice.
        cur = self._conn.execute(
            """UPDATE positions SET status=?, closed_at=?, exit_price=?, close_reason=?,
                   realized_pnl_usdt=COALESCE(realized_pnl_usdt, 0) + ?,
                   size=COALESCE(original_size, size),
                   notional_usdt=COALESCE(original_notional_usdt, notional_usdt)
               WHERE id=? AND status=? AND size=?""",
            (
                PositionStatus.CLOSED.value, datetime.now(UTC).isoformat(),
                exit_price, reason.value, pnl, pid, PositionStatus.OPEN.value, size,
            ),
        )
        if cur.rowcount != 1:
            self._conn.rollback()
            return False
        if earlier:
            # Say which number is which: the last slice, and the whole trade.
            detail = (
                f"{reason.value} last slice @ {(last_fill or exit_price):.4f} pnl={pnl:+.2f}; "
                f"trade avg exit {exit_price:.4f}, total pnl={earlier + pnl:+.2f}"
            )
        else:
            detail = f"{reason.value} @ {exit_price:.4f} pnl={pnl:+.2f}"
        self._event(pid, "CLOSED", detail)
        self._conn.commit()
        return True

    # -- async API ---------------------------------------------------------

    async def add(self, p: Position) -> bool:
        """False when an open position already exists for this thesis."""
        async with self._lock:
            try:
                await db.run(self._insert, p)
                return True
            except sqlite3.IntegrityError:
                return False

    async def open_positions(self) -> list[Position]:
        rows = await db.run(
            lambda: self._conn.execute(
                "SELECT * FROM positions WHERE status=? ORDER BY opened_at",
                (PositionStatus.OPEN.value,),
            ).fetchall()
        )
        return [_row_to_position(r) for r in rows]

    async def all_positions(self, limit: int = 200) -> list[Position]:
        rows = await db.run(
            lambda: self._conn.execute(
                "SELECT * FROM positions ORDER BY opened_at DESC LIMIT ?", (limit,)
            ).fetchall()
        )
        return [_row_to_position(r) for r in rows]

    async def get(self, pid: str) -> Position | None:
        row = await db.run(
            lambda: self._conn.execute(
                "SELECT * FROM positions WHERE id=?", (pid,)
            ).fetchone()
        )
        return _row_to_position(row) if row else None

    async def mark_closed(
        self, pid: str, exit_price: float, reason: CloseReason, pnl: float, size: float,
        last_fill: float | None = None,
    ) -> bool:
        """Close the position if it is still OPEN at `size`; False otherwise."""
        async with self._lock:
            return await db.run(self._close, pid, exit_price, reason, pnl, size, last_fill)

    def _partial_close(
        self, pid: str, expected_size: float, size: float, notional: float,
        realized: float, detail: str,
    ) -> bool:
        cur = self._conn.execute(
            """UPDATE positions SET size=?, notional_usdt=?,
                   realized_pnl_usdt=COALESCE(realized_pnl_usdt, 0) + ?,
                   close_attempts=close_attempts + 1
               WHERE id=? AND status=? AND size=?""",
            (size, notional, realized, pid, PositionStatus.OPEN.value, expected_size),
        )
        if cur.rowcount != 1:
            self._conn.rollback()
            return False
        self._event(
            pid, "PARTIAL_CLOSE",
            f"{detail}; size -> {size:.4f}, slice pnl={realized:+.2f}",
        )
        self._conn.commit()
        return True

    async def partial_close(
        self, pid: str, expected_size: float, size: float, notional: float,
        realized: float, detail: str,
    ) -> bool:
        """Shrink a position after a partial close and BOOK the closed slice's
        P&L. It stays OPEN. Applies only if the position is still OPEN at
        `expected_size` - the size the fill was priced on."""
        async with self._lock:
            return await db.run(
                self._partial_close, pid, expected_size, size, notional, realized, detail
            )

    def _close_rejected(self, pid: str, detail: str) -> None:
        self._conn.execute(
            "UPDATE positions SET close_attempts=close_attempts + 1 WHERE id=?", (pid,)
        )
        self._event(pid, "CLOSE_REJECTED", detail)
        self._conn.commit()

    async def close_rejected(self, pid: str, detail: str) -> None:
        """Record a rejected close. Bumping the attempt counter makes the next
        paper retry a fresh draw rather than a replay of the same rejection."""
        async with self._lock:
            await db.run(self._close_rejected, pid, detail)

    async def note(self, pid: str, kind: str, detail: str) -> None:
        async with self._lock:
            await db.run(
                lambda: (self._event(pid, kind, detail), self._conn.commit())
            )

    async def events(self, limit: int = 100) -> list[dict]:
        rows = await db.run(
            lambda: self._conn.execute(
                "SELECT * FROM position_events ORDER BY id DESC LIMIT ?", (limit,)
            ).fetchall()
        )
        return [dict(r) for r in rows]
