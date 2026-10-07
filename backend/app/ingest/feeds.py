"""News sensing - the agent's eyes.

Polls public RSS for headlines about companies in the graph. Free, keyless,
and good enough to make the agent genuinely autonomous rather than a button
you press.

Three things this module is careful about, because an autonomous trader that
gets any of them wrong is dangerous rather than merely broken:

  * **Dedupe is persistent.** A headline seen before must never be traded
    twice. The seen-set lives in SQLite, so a restart does not replay three
    days of news as if it were breaking.
  * **The LLM is expensive, the pre-filter is free.** Only headlines that
    mention a graph entity are sent for reasoning. Everything else is dropped
    before it costs anything.
  * **Old news is not news.** Anything published outside the freshness window
    is recorded as seen and skipped - a week-old outage is already priced.
"""

import asyncio
import hashlib
import re
import sqlite3
from dataclasses import dataclass
from datetime import UTC, datetime
from email.utils import parsedate_to_datetime
from xml.etree import ElementTree

import httpx

from app import db
from app.models import GraphNode

GOOGLE_NEWS = "https://news.google.com/rss/search?q={q}&hl=en-US&gl=US&ceid=US:en"

SCHEMA = """
CREATE TABLE IF NOT EXISTS seen_headlines (
    fingerprint TEXT PRIMARY KEY,
    first_seen  TEXT NOT NULL,
    title       TEXT NOT NULL,
    source      TEXT NOT NULL DEFAULT '',
    acted       INTEGER NOT NULL DEFAULT 0,
    url         TEXT,
    published   TEXT
);
"""

# Databases created before url/published were stored get the columns added.
MIGRATIONS = [
    "ALTER TABLE seen_headlines ADD COLUMN url TEXT",
    "ALTER TABLE seen_headlines ADD COLUMN published TEXT",
]

# Google News appends " - Publisher" to every title.
_PUBLISHER = re.compile(r"\s+-\s+[^-]{2,40}$")
_TAG = re.compile(r"<[^>]+>")

# Names headlines use for a company that its graph name does not cover, by
# node id, matched as whole words. They replace the default first-word match
# for that node: "meta" as a substring would let "metals" and "Metaplanet"
# through, and "SK" is too short to match at all. Each alias widens what
# reaches the LLM, so only names headlines actually use belong here.
HEADLINE_ALIASES: dict[str, tuple[str, ...]] = {
    "SK_HYNIX": ("hynix",),
    "GOOGL": ("alphabet", "google"),
    "META": ("meta",),
    "AMZN": ("amazon", "aws"),
}

# Google News queries beyond the node's own name, for a company whose news
# mostly runs under another one. Each costs a request per poll.
EXTRA_QUERIES: dict[str, tuple[str, ...]] = {
    "GOOGL": ("Google",),
}


@dataclass
class Headline:
    title: str
    source: str
    url: str
    published: datetime | None

    @property
    def fingerprint(self) -> str:
        # Title, not URL: the same story is syndicated under many links.
        return hashlib.sha256(self.title.lower().encode()).hexdigest()[:32]


def _clean(title: str) -> tuple[str, str]:
    """-> (headline, publisher)."""
    title = _TAG.sub("", title).strip()
    m = _PUBLISHER.search(title)
    if not m:
        return title, "RSS"
    return title[: m.start()].strip(), m.group(0).lstrip(" -").strip()


class FeedReader:
    def __init__(
        self,
        # Must be opened with check_same_thread=False: reads and writes run
        # through app.db.run, so they land on worker threads, one at a time.
        conn: sqlite3.Connection,
        user_agent: str,
        *,
        max_age_hours: float = 6.0,
        client: httpx.AsyncClient | None = None,
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
        self._max_age = max_age_hours
        # A failed fetch used to look exactly like a quiet news cycle. These
        # make "the feed is down" distinguishable from "nothing happened".
        self.stats = {
            "queries": 0, "errors": 0, "last_error": None,
            "last_ok": None, "last_poll_errors": 0, "last_poll_queries": 0,
        }
        self._client = client or httpx.AsyncClient(
            timeout=30.0, follow_redirects=True, headers={"User-Agent": user_agent}
        )
        self._lock = asyncio.Lock()

    async def aclose(self) -> None:
        await self._client.aclose()

    # -- dedupe ------------------------------------------------------------

    def _is_seen(self, fp: str) -> bool:
        return (
            self._conn.execute(
                "SELECT 1 FROM seen_headlines WHERE fingerprint=?", (fp,)
            ).fetchone()
            is not None
        )

    def _mark(self, h: Headline, acted: bool) -> None:
        self._conn.execute(
            """INSERT OR IGNORE INTO seen_headlines
               (fingerprint, first_seen, title, source, acted, url, published)
               VALUES (?,?,?,?,?,?,?)""",
            (
                h.fingerprint, datetime.now(UTC).isoformat(), h.title, h.source,
                int(acted), h.url or None,
                h.published.astimezone(UTC).isoformat() if h.published else None,
            ),
        )
        self._conn.commit()

    async def mark_seen(self, h: Headline, acted: bool = False) -> None:
        async with self._lock:
            await db.run(self._mark, h, acted)

    async def seen_count(self) -> int:
        return await db.run(
            lambda: self._conn.execute(
                "SELECT COUNT(*) FROM seen_headlines"
            ).fetchone()[0]
        )

    async def recent(self, limit: int = 40) -> list[dict]:
        rows = await db.run(
            lambda: self._conn.execute(
                "SELECT * FROM seen_headlines ORDER BY first_seen DESC LIMIT ?",
                (limit,),
            ).fetchall()
        )
        return [dict(r) for r in rows]

    # -- fetching ----------------------------------------------------------

    async def _fetch(self, query: str) -> list[Headline]:
        url = GOOGLE_NEWS.format(q=httpx.QueryParams({"q": query})["q"].replace(" ", "+"))
        self.stats["queries"] += 1
        try:
            r = await self._client.get(url)
            r.raise_for_status()
            root = ElementTree.fromstring(r.text)
        except Exception as exc:
            self.stats["errors"] += 1
            self.stats["last_poll_errors"] += 1
            self.stats["last_error"] = {
                "at": datetime.now(UTC).isoformat(),
                "query": query,
                "error": f"{type(exc).__name__}: {str(exc)[:160]}",
            }
            return []
        self.stats["last_ok"] = datetime.now(UTC).isoformat()

        out: list[Headline] = []
        for item in root.iter("item"):
            raw = (item.findtext("title") or "").strip()
            if not raw:
                continue
            title, publisher = _clean(raw)
            published = None
            if (pd := item.findtext("pubDate")):
                try:
                    published = parsedate_to_datetime(pd)
                except Exception:
                    published = None
            out.append(
                Headline(title, publisher, item.findtext("link") or "", published)
            )
        return out

    def _fresh(self, h: Headline) -> bool:
        if h.published is None:
            return True  # no timestamp: let the oracle judge it
        age = (datetime.now(UTC) - h.published.astimezone(UTC)).total_seconds() / 3600
        return age <= self._max_age

    async def poll(self, nodes: list[GraphNode], per_entity: int = 6) -> list[Headline]:
        """New, fresh, on-topic headlines. Everything else is marked seen.

        Queries per entity so results arrive pre-targeted - cheaper and far
        more precise than filtering a general business feed.
        """
        # Query by name, not id: "SK_HYNIX" is not a phrase anyone writes.
        queries = {n.name.split(" (")[0]: n for n in nodes}
        for n in nodes:
            for q in EXTRA_QUERIES.get(n.id, ()):
                queries.setdefault(q, n)
        fresh: list[Headline] = []
        seen_this_round: set[str] = set()
        self.stats["last_poll_errors"] = 0
        self.stats["last_poll_queries"] = len(queries)

        for query in queries:
            for h in (await self._fetch(query))[:per_entity]:
                fp = h.fingerprint
                if fp in seen_this_round:
                    continue
                seen_this_round.add(fp)

                if await db.run(self._is_seen, fp):
                    continue
                if not self._fresh(h):
                    # Record it so it never resurfaces as "new" later.
                    await self.mark_seen(h, acted=False)
                    continue
                fresh.append(h)
            # Be polite to the feed.
            await asyncio.sleep(0.4)
        return fresh


def mentions_graph_entity(title: str, nodes: list[GraphNode]) -> bool:
    """Free pre-filter. Only matches reach the LLM, so irrelevant market
    chatter never costs a token."""
    text = title.lower()
    for n in nodes:
        aliases = HEADLINE_ALIASES.get(n.id)
        if aliases:
            if any(re.search(rf"\b{re.escape(a)}\b", text) for a in aliases):
                return True
        else:
            first = n.name.split()[0].lower()
            if len(first) >= 4 and first in text:
                return True
        if n.ticker and re.search(rf"\b{n.ticker.lower()}\b", text):
            return True
    return False
