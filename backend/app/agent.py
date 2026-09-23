"""The autonomous loop — sense, reason, act.

This is what makes Cascadr an agent rather than a dashboard with a button.
Every cycle:

    poll RSS  ->  pre-filter  ->  LLM reasons  ->  graph  ->  risk  ->  orders

Every decision is recorded, including the refusals. A log of only the trades
would hide the most important behaviour: on live feeds the overwhelming
majority of headlines are valuation chatter and product news, and the agent
declining to trade them is the system working, not the system idle.

Guards, because an autonomous trader that misbehaves is worse than one that
does not run:

  * `CASCADR_AUTONOMOUS` must be explicitly "true". Default is off.
  * An hourly ceiling on LLM calls bounds spend even if a feed floods.
  * A shock floor stops marginal reads from reaching the risk layer at all.
  * Every order still passes the same risk gates and paper gate as a manual one.
"""

import asyncio
import sqlite3
from datetime import UTC, datetime

from app.ingest.feeds import FeedReader, Headline, mentions_graph_entity
from app.ingest.oracle import NewsOracle

SCHEMA = """
CREATE TABLE IF NOT EXISTS agent_decisions (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    at         TEXT NOT NULL,
    headline   TEXT NOT NULL,
    source     TEXT NOT NULL DEFAULT '',
    engine     TEXT NOT NULL DEFAULT '',
    model      TEXT,
    entities   TEXT NOT NULL DEFAULT '',
    shock      REAL NOT NULL DEFAULT 0,
    severity   TEXT NOT NULL DEFAULT '',
    confidence REAL NOT NULL DEFAULT 0,
    reasoning  TEXT NOT NULL DEFAULT '',
    action     TEXT NOT NULL,
    detail     TEXT NOT NULL DEFAULT '',
    provider   TEXT
);
CREATE INDEX IF NOT EXISTS ix_decisions_at ON agent_decisions(at);
"""


class AutonomousAgent:
    def __init__(
        self,
        *,
        conn: sqlite3.Connection,
        feeds: FeedReader,
        oracle: NewsOracle,
        repo,
        contagion_fn,
        execute_fn,
        shock_floor: float = 0.45,
        max_llm_calls_per_hour: int = 60,
    ):
        self._conn = conn
        self._conn.executescript(SCHEMA)
        self._conn.commit()
        self._feeds = feeds
        self._oracle = oracle
        self._repo = repo
        self._contagion = contagion_fn
        self._execute = execute_fn
        self.shock_floor = shock_floor
        self.max_llm_per_hour = max_llm_calls_per_hour
        self._llm_calls: list[datetime] = []
        self._lock = asyncio.Lock()
        self.stats = {
            "cycles": 0, "headlines_seen": 0, "reasoned": 0,
            "traded": 0, "declined": 0, "last_cycle": None, "last_error": None,
        }

    # -- budget ------------------------------------------------------------

    def _llm_budget_left(self) -> int:
        cutoff = datetime.now(UTC).timestamp() - 3600
        self._llm_calls = [t for t in self._llm_calls if t.timestamp() > cutoff]
        return self.max_llm_per_hour - len(self._llm_calls)

    # -- recording ---------------------------------------------------------

    def _write(self, row: tuple) -> None:
        self._conn.execute(
            """INSERT INTO agent_decisions
               (at, headline, source, engine, model, entities, shock, severity,
                confidence, reasoning, action, detail, provider)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            row,
        )
        self._conn.commit()

    async def _record(self, h: Headline, v, action: str, detail: str = "") -> None:
        async with self._lock:
            await asyncio.to_thread(
                self._write,
                (
                    datetime.now(UTC).isoformat(), h.title, h.source,
                    getattr(v, "engine", ""), getattr(v, "model", None),
                    ",".join(getattr(v, "entities", []) or []),
                    float(getattr(v, "shock", 0.0)), getattr(v, "severity", ""),
                    float(getattr(v, "confidence", 0.0)),
                    getattr(v, "reasoning", "")[:600], action, detail[:400],
                    (getattr(v, "provenance", {}) or {}).get("provider"),
                ),
            )

    async def decisions(self, limit: int = 60) -> list[dict]:
        rows = await asyncio.to_thread(
            lambda: self._conn.execute(
                "SELECT * FROM agent_decisions ORDER BY id DESC LIMIT ?", (limit,)
            ).fetchall()
        )
        return [dict(r) for r in rows]

    # -- the loop ----------------------------------------------------------

    async def cycle(self, execute: bool = True) -> dict:
        """One sense-reason-act pass."""
        nodes = await self._repo.nodes()
        fresh = await self._feeds.poll(nodes)
        self.stats["cycles"] += 1
        self.stats["headlines_seen"] += len(fresh)
        acted: list[dict] = []

        for h in fresh:
            # Free filter first — irrelevant chatter must not cost a token.
            if not mentions_graph_entity(h.title, nodes):
                await self._feeds.mark_seen(h, acted=False)
                continue

            if self._llm_budget_left() <= 0:
                # Leave it unseen so the next hour can reconsider it.
                self.stats["last_error"] = "hourly LLM budget exhausted"
                break

            self._llm_calls.append(datetime.now(UTC))
            verdict = await self._oracle.analyse(h.title, nodes)
            self.stats["reasoned"] += 1

            if not verdict.entities or verdict.shock < self.shock_floor:
                self.stats["declined"] += 1
                await self._record(
                    h, verdict, "DECLINED",
                    f"shock {verdict.shock:.2f} below floor {self.shock_floor:.2f}"
                    if verdict.entities else "no graph entity resolved",
                )
                await self._feeds.mark_seen(h, acted=False)
                continue

            from app.main import ShockRequest  # late import: avoids a cycle

            req = ShockRequest(
                origin=verdict.entities[0], shock=verdict.shock, headline=h.title
            )
            if not execute:
                await self._record(h, verdict, "ANALYSED", "execute disabled")
                await self._feeds.mark_seen(h, acted=False)
                continue

            result = await self._execute(req)
            opened = result.get("opened", [])
            skipped = result.get("skipped", [])
            self.stats["traded"] += len(opened)
            await self._record(
                h, verdict,
                "TRADED" if opened else "BLOCKED",
                f"opened {len(opened)}, blocked {len(skipped)}"
                + (f" — {skipped[0]['reason'][:120]}" if skipped and not opened else ""),
            )
            await self._feeds.mark_seen(h, acted=True)
            acted.append({"headline": h.title, "opened": len(opened)})

        self.stats["last_cycle"] = datetime.now(UTC).isoformat()
        return {"fresh": len(fresh), "acted": acted, "stats": dict(self.stats)}
