"""Durable position storage.

SQLite via the standard library: no service to run, no extra dependency, and
the book survives a restart — which is the whole point. Writes are tiny and
infrequent, but they still run through asyncio.to_thread so a disk stall can
never block the event loop.

Every lifecycle transition also appends to `position_events`, giving an audit
trail you can reconstruct the book from if the positions table is ever wrong.
"""

import asyncio
import json
import sqlite3
from datetime import UTC, datetime
from pathlib import Path

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
    realized_pnl_usdt REAL
);

CREATE INDEX IF NOT EXISTS ix_positions_status ON positions(status);

/* One open position per thesis. This is the idempotency guard: a replayed
   signal cannot double the risk. */
CREATE UNIQUE INDEX IF NOT EXISTS ux_positions_client_oid
    ON positions(client_oid) WHERE client_oid != '';

CREATE TABLE IF NOT EXISTS position_events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    position_id TEXT NOT NULL,
    at          TEXT NOT NULL,
    kind        TEXT NOT NULL,
    detail      TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS ix_events_position ON position_events(position_id);
"""


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
    )


class PositionStore:
    def __init__(self, path: str | Path = "cascadr.db"):
        self.path = str(path)
        self._conn = sqlite3.connect(self.path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        # Survive an unclean shutdown without corrupting the book.
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.executescript(SCHEMA)
        self._conn.commit()
        self._lock = asyncio.Lock()

    @property
    def conn(self) -> sqlite3.Connection:
        return self._conn

    def close(self) -> None:
        self._conn.close()

    # -- sync internals, always called via to_thread ----------------------

    def _insert(self, p: Position) -> None:
        self._conn.execute(
            """INSERT INTO positions (id, symbol, side, size, notional_usdt, leverage,
                   entry_price, opened_at, thesis, origin, client_oid, paper, status, policy)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                p.id, p.symbol, p.side, p.size, p.notional_usdt, p.leverage,
                p.entry_price, p.opened_at.isoformat(), p.thesis, p.origin,
                p.client_oid, int(p.paper), p.status.value, p.policy.model_dump_json(),
            ),
        )
        self._event(p.id, "OPENED", f"{p.side} {p.symbol} {p.notional_usdt:.0f} USDT @ {p.entry_price}")
        self._conn.commit()

    def _event(self, position_id: str, kind: str, detail: str = "") -> None:
        self._conn.execute(
            "INSERT INTO position_events (position_id, at, kind, detail) VALUES (?,?,?,?)",
            (position_id, datetime.now(UTC).isoformat(), kind, detail),
        )

    def _close(
        self, pid: str, exit_price: float, reason: CloseReason, pnl: float
    ) -> None:
        self._conn.execute(
            """UPDATE positions SET status=?, closed_at=?, exit_price=?,
                   close_reason=?, realized_pnl_usdt=? WHERE id=? AND status=?""",
            (
                PositionStatus.CLOSED.value, datetime.now(UTC).isoformat(),
                exit_price, reason.value, pnl, pid, PositionStatus.OPEN.value,
            ),
        )
        self._event(pid, "CLOSED", f"{reason.value} @ {exit_price} pnl={pnl:+.2f}")
        self._conn.commit()

    # -- async API ---------------------------------------------------------

    async def add(self, p: Position) -> bool:
        """False when an open position already exists for this thesis."""
        async with self._lock:
            try:
                await asyncio.to_thread(self._insert, p)
                return True
            except sqlite3.IntegrityError:
                return False

    async def open_positions(self) -> list[Position]:
        rows = await asyncio.to_thread(
            lambda: self._conn.execute(
                "SELECT * FROM positions WHERE status=? ORDER BY opened_at",
                (PositionStatus.OPEN.value,),
            ).fetchall()
        )
        return [_row_to_position(r) for r in rows]

    async def all_positions(self, limit: int = 200) -> list[Position]:
        rows = await asyncio.to_thread(
            lambda: self._conn.execute(
                "SELECT * FROM positions ORDER BY opened_at DESC LIMIT ?", (limit,)
            ).fetchall()
        )
        return [_row_to_position(r) for r in rows]

    async def get(self, pid: str) -> Position | None:
        row = await asyncio.to_thread(
            lambda: self._conn.execute(
                "SELECT * FROM positions WHERE id=?", (pid,)
            ).fetchone()
        )
        return _row_to_position(row) if row else None

    async def mark_closed(
        self, pid: str, exit_price: float, reason: CloseReason, pnl: float
    ) -> None:
        async with self._lock:
            await asyncio.to_thread(self._close, pid, exit_price, reason, pnl)

    def _resize(self, pid: str, size: float, notional: float) -> None:
        self._conn.execute(
            "UPDATE positions SET size=?, notional_usdt=? WHERE id=?",
            (size, notional, pid),
        )
        self._event(pid, "RESIZED", f"size -> {size:.4f}, notional -> {notional:.2f}")
        self._conn.commit()

    async def resize(self, pid: str, size: float, notional: float) -> None:
        """Shrink a position after a partial close. It stays OPEN."""
        async with self._lock:
            await asyncio.to_thread(self._resize, pid, size, notional)

    async def note(self, pid: str, kind: str, detail: str) -> None:
        async with self._lock:
            await asyncio.to_thread(
                lambda: (self._event(pid, kind, detail), self._conn.commit())
            )

    async def events(self, limit: int = 100) -> list[dict]:
        rows = await asyncio.to_thread(
            lambda: self._conn.execute(
                "SELECT * FROM position_events ORDER BY id DESC LIMIT ?", (limit,)
            ).fetchall()
        )
        return [dict(r) for r in rows]
