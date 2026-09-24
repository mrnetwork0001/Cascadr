"""The autonomous loop — sense, reason, act.

This is what makes Cascadr an agent rather than a dashboard with a button.
Every cycle:

    poll RSS  ->  pre-filter  ->  LLM reasons  ->  graph  ->  risk  ->  orders

Every decision is recorded, including the refusals, together with the article
link, the model's reasoning and uncertainty, and the contagion the verdict
implies on the graph. That record is what the terminal displays: the UI shows
the agent's actual decisions, never a scripted stand-in.

Guards, because an autonomous trader that misbehaves is worse than one that
does not run:

  * `CASCADR_AUTONOMOUS` must be explicitly "true". Default is off.
  * An hourly ceiling on LLM calls bounds spend even if a feed floods.
  * A shock floor stops marginal reads from reaching the risk layer at all.
  * Every order still passes the same risk gates and paper gate as a manual one.
"""

import asyncio
import json
import sqlite3
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime

from app import db
from app.graph.repository import index
from app.ingest.feeds import FeedReader, Headline, mentions_graph_entity
from app.ingest.oracle import NewsOracle
from app.traversal import (
    HOP_DECAY,
    implied_drawdown_pct,
    score_to_contagion,
    traverse_contagion,
)

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
    provider   TEXT,
    url        TEXT,
    published  TEXT,
    uncertainty TEXT NOT NULL DEFAULT '',
    exposures  TEXT
);
CREATE INDEX IF NOT EXISTS ix_decisions_at ON agent_decisions(at);
CREATE TABLE IF NOT EXISTS agent_meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
"""

MIGRATIONS = [
    "ALTER TABLE agent_decisions ADD COLUMN url TEXT",
    "ALTER TABLE agent_decisions ADD COLUMN published TEXT",
    "ALTER TABLE agent_decisions ADD COLUMN uncertainty TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE agent_decisions ADD COLUMN exposures TEXT",
]

# Decision outcomes. Each names what actually happened - the old "BLOCKED"
# label was also used when no exposure reached the trade threshold, although
# the risk layer never ran.
DECLINED = "DECLINED"  # no entity, or shock below the floor
TRADED = "TRADED"  # at least one paper position opened
BLOCKED_BY_RISK = "BLOCKED_BY_RISK"  # tradable exposure existed; the risk engine refused
REJECTED_BY_VENUE = "REJECTED_BY_VENUE"  # risk approved; the (paper) venue rejected the fill
NO_MARKET_PRICE = "NO_MARKET_PRICE"  # no Bitget mark to trade at
ALREADY_HOLDING = "ALREADY_HOLDING"  # the same thesis is already open
NO_TRADABLE_EXPOSURE = "NO_TRADABLE_EXPOSURE"  # nothing crossed the trade threshold
EXECUTION_FAILED = "EXECUTION_FAILED"  # the executor raised; see detail
ANALYSED = "ANALYSED"  # execution disabled for this cycle

# Why an open was skipped, as reported by the executor, and the outcome each
# maps to when nothing opened. Order is precedence for mixed results.
SKIP_OUTCOMES = [
    ("error", EXECUTION_FAILED),
    ("risk", BLOCKED_BY_RISK),
    ("venue", REJECTED_BY_VENUE),
    ("no_mark", NO_MARKET_PRICE),
    ("duplicate", ALREADY_HOLDING),
]

# (exposures, headline, source) -> {"opened": [...], "skipped": [{kind, reason}]}
ExecuteFn = Callable[[list[dict], str, str], Awaitable[dict]]


class AutonomousAgent:
    def __init__(
        self,
        *,
        conn: sqlite3.Connection,
        feeds: FeedReader,
        oracle: NewsOracle,
        repo,
        execute_fn: ExecuteFn,
        shock_floor: float = 0.45,
        max_llm_calls_per_hour: int = 60,
    ):
        self._conn = conn
        self._conn.executescript(SCHEMA)
        for stmt in MIGRATIONS:
            try:
                self._conn.execute(stmt)
            except sqlite3.OperationalError as exc:
                if "duplicate column" not in str(exc):
                    raise
        self._conn.commit()
        self._feeds = feeds
        self._oracle = oracle
        self._repo = repo
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

    # -- contagion for the record -------------------------------------------

    async def exposures_for(self, entities: list[str], shock: float) -> list[dict]:
        """What this verdict implies downstream, on the current graph.

        Every resolved entity is propagated (the strongest path per target
        wins), so a headline naming two suppliers is not silently reduced to
        its first one.
        """
        if not entities or shock <= 0:
            return []
        nodes = await self._repo.nodes()
        edges = await self._repo.edges()
        by_id, downstream = index(nodes, edges)
        best: dict[str, dict] = {}
        for origin in entities:
            if origin not in by_id:
                continue
            # The origin itself, at the shock the model assigned, so the UI
            # draws its severity from the server rather than re-deriving bands.
            o = by_id[origin]
            best[origin] = {
                "target": origin, "name": o.name, "ticker": o.ticker,
                "origin": origin, "hops": [origin], "score": round(shock, 4),
                "contagion": str(score_to_contagion(shock)),
                "implied_drawdown_pct": round(implied_drawdown_pct(shock), 2),
                "provenance": "", "is_origin": True,
                "rationale": "directly disrupted", "links": [], "hop_decay": HOP_DECAY,
            }
        for origin in entities:
            if origin not in by_id:
                continue
            for p in traverse_contagion(origin, shock, by_id, downstream):
                if p.target in best and (
                    best[p.target].get("is_origin") or best[p.target]["score"] >= p.score
                ):
                    continue
                node = by_id[p.target]
                best[p.target] = {
                    "target": p.target,
                    "name": node.name,
                    "ticker": node.ticker,
                    "origin": origin,
                    "hops": p.hops,
                    "score": round(p.score, 4),
                    "contagion": str(score_to_contagion(p.score)),
                    "implied_drawdown_pct": round(implied_drawdown_pct(p.score), 2),
                    "provenance": str(p.weakest_provenance),
                    "is_origin": False,
                    "rationale": p.rationale,
                    # The factors the score was multiplied from, frozen with
                    # the decision so its arithmetic survives graph edits.
                    "links": [l.model_dump(mode="json") for l in p.links],
                    "hop_decay": HOP_DECAY,
                }
        return sorted(best.values(), key=lambda e: e["score"], reverse=True)

    # -- recording ---------------------------------------------------------

    def _write(self, row: tuple) -> None:
        self._conn.execute(
            """INSERT INTO agent_decisions
               (at, headline, source, engine, model, entities, shock, severity,
                confidence, reasoning, action, detail, provider, url, published,
                uncertainty, exposures)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            row,
        )
        self._conn.commit()

    async def _record(
        self, h: Headline, v, action: str, detail: str, exposures: list[dict]
    ) -> None:
        async with self._lock:
            await db.run(
                self._write,
                (
                    datetime.now(UTC).isoformat(), h.title, h.source,
                    getattr(v, "engine", ""), getattr(v, "model", None),
                    ",".join(getattr(v, "entities", []) or []),
                    float(getattr(v, "shock", 0.0)), getattr(v, "severity", ""),
                    float(getattr(v, "confidence", 0.0)),
                    getattr(v, "reasoning", "")[:600], action, detail[:400],
                    (getattr(v, "provenance", {}) or {}).get("provider"),
                    h.url or None,
                    h.published.astimezone(UTC).isoformat() if h.published else None,
                    getattr(v, "uncertainty", "")[:600],
                    json.dumps(exposures),
                ),
            )

    @staticmethod
    def _row(r: sqlite3.Row) -> dict:
        d = dict(r)
        raw = d.get("exposures")
        d["exposures"] = json.loads(raw) if raw else []
        d["entities"] = [e for e in (d.get("entities") or "").split(",") if e]
        return d

    async def decisions(self, limit: int = 60, before_id: int | None = None) -> list[dict]:
        def q():
            if before_id:
                return self._conn.execute(
                    "SELECT * FROM agent_decisions WHERE id < ? ORDER BY id DESC LIMIT ?",
                    (before_id, limit),
                ).fetchall()
            return self._conn.execute(
                "SELECT * FROM agent_decisions ORDER BY id DESC LIMIT ?", (limit,)
            ).fetchall()

        return [self._row(r) for r in await db.run(q)]

    async def counts(self) -> dict:
        rows = await db.run(
            lambda: self._conn.execute(
                "SELECT action, COUNT(*) AS n FROM agent_decisions GROUP BY action"
            ).fetchall()
        )
        out = {r["action"]: r["n"] for r in rows}
        out["total"] = sum(out.values())
        return out

    async def sync_exposures(self, graph_fingerprint: str) -> int:
        """Keep stored exposures consistent with the graph being served.

        When the graph has changed since the last start, exposures of
        decisions that did not act on them (declined, or analysed with
        execution off) are restated on the current graph. Decisions whose
        exposures drove an outcome - a trade, a risk refusal, nothing over
        the threshold - keep the exposures they were decided on, so the record
        of why the agent acted is never rewritten. Returns rows filled."""

        def mark() -> None:
            row = self._conn.execute(
                "SELECT value FROM agent_meta WHERE key='graph_fingerprint'"
            ).fetchone()
            if row is None or row[0] != graph_fingerprint:
                self._conn.execute(
                    "UPDATE agent_decisions SET exposures=NULL WHERE action IN (?, ?)",
                    (DECLINED, ANALYSED),
                )
                self._conn.execute(
                    "INSERT OR REPLACE INTO agent_meta (key, value) VALUES ('graph_fingerprint', ?)",
                    (graph_fingerprint,),
                )
                self._conn.commit()

        await db.run(mark)
        return await self.backfill_exposures()

    async def backfill_exposures(self) -> int:
        """Decisions recorded before exposures were stored get them computed
        now, on the current graph, so the UI can show every decision's
        contagion. Returns how many rows were filled."""
        rows = await db.run(
            lambda: self._conn.execute(
                "SELECT id, entities, shock FROM agent_decisions WHERE exposures IS NULL"
            ).fetchall()
        )
        for r in rows:
            ents = [e for e in (r["entities"] or "").split(",") if e]
            exps = await self.exposures_for(ents, float(r["shock"] or 0.0))
            await db.run(
                lambda i=r["id"], e=json.dumps(exps): (
                    self._conn.execute(
                        "UPDATE agent_decisions SET exposures=? WHERE id=?", (e, i)
                    ),
                    self._conn.commit(),
                )
            )
        return len(rows)

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
            exposures = await self.exposures_for(verdict.entities, verdict.shock)

            if not verdict.entities or verdict.shock < self.shock_floor:
                self.stats["declined"] += 1
                await self._record(
                    h, verdict, DECLINED,
                    f"shock {verdict.shock:.2f} below floor {self.shock_floor:.2f}"
                    if verdict.entities else "no graph entity resolved",
                    exposures,
                )
                await self._feeds.mark_seen(h, acted=False)
                continue

            if not execute:
                await self._record(h, verdict, ANALYSED, "execute disabled", exposures)
                await self._feeds.mark_seen(h, acted=False)
                continue

            # Execution acts on exactly the exposures recorded above, so the
            # record of why the agent traded and what it traded cannot differ.
            try:
                result = await self._execute(exposures, h.title, "agent")
            except Exception as exc:
                # Still recorded and marked seen: the next cycle must not pay
                # for the same headline again.
                result = {"opened": [], "skipped": [], "error": f"{type(exc).__name__}: {exc}"}
            opened = result.get("opened", [])
            skipped = result.get("skipped", [])
            self.stats["traded"] += len(opened)
            if result.get("error"):
                action, detail = EXECUTION_FAILED, result["error"][:300]
            else:
                action, detail = outcome(opened, skipped)
            await self._record(h, verdict, action, detail, exposures)
            await self._feeds.mark_seen(h, acted=bool(opened))
            acted.append({"headline": h.title, "opened": len(opened), "action": action})

        self.stats["last_cycle"] = datetime.now(UTC).isoformat()
        return {"fresh": len(fresh), "acted": acted, "stats": dict(self.stats)}


def outcome(opened: list, skipped: list[dict]) -> tuple[str, str]:
    """Name what happened to a decision's tradable exposures."""
    kinds = [x.get("kind", "risk") for x in skipped]
    counts = ", ".join(f"{k} {kinds.count(k)}" for k, _ in SKIP_OUTCOMES if k in kinds)
    detail = f"opened {len(opened)}" + (f"; skipped: {counts}" if counts else "")
    if opened:
        return TRADED, detail
    if not skipped:
        return NO_TRADABLE_EXPOSURE, "no exposure reached the trade threshold"
    action = next(a for k, a in SKIP_OUTCOMES if k in kinds)
    first = next(x for x in skipped if x.get("kind", "risk") == next(k for k, _ in SKIP_OUTCOMES if k in kinds))
    return action, f"{detail} — {first.get('reason', '')[:120]}"
