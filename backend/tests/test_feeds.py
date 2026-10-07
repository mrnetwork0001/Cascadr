"""The news feed asks about every graph company, by the names headlines use."""

import asyncio
import sqlite3

import httpx

from app.graph.seed import NODES
from app.ingest import feeds
from app.ingest.feeds import EXTRA_QUERIES, HEADLINE_ALIASES, FeedReader, mentions_graph_entity

BY_ID = {n.id: n for n in NODES}


def test_aliases_and_extra_queries_name_graph_nodes():
    assert set(HEADLINE_ALIASES) <= set(BY_ID)
    assert set(EXTRA_QUERIES) <= set(BY_ID)


def test_filter_recognises_the_names_headlines_use():
    for title in [
        "Google unveils its next TPU",
        "Alphabet shares slide after antitrust ruling",
        "Meta to cut capital spending",
        "Meta Platforms beats estimates",
        "Amazon warns on holiday margins",
        "AWS outage takes down thousands of sites",
        "SK hynix fab fire halts HBM output",
        "Samsung union extends strike",
    ]:
        assert mentions_graph_entity(title, NODES), title


def test_filter_ignores_lookalike_words():
    for title in [
        "Precious metals rally as the dollar slides",
        "Metaplanet buys more bitcoin",
        "Metadata standards body meets in Geneva",
    ]:
        assert not mentions_graph_entity(title, NODES), title


def test_poll_queries_the_extra_names(tmp_path, monkeypatch):
    asked: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        asked.append(request.url.params["q"])
        return httpx.Response(200, text="<rss><channel></channel></rss>")

    async def no_sleep(_):
        return None

    monkeypatch.setattr(feeds.asyncio, "sleep", no_sleep)
    conn = sqlite3.connect(tmp_path / "feeds.db", check_same_thread=False)
    reader = FeedReader(
        conn, "test", client=httpx.AsyncClient(transport=httpx.MockTransport(handler))
    )

    async def run():
        try:
            return await reader.poll([BY_ID["GOOGL"], BY_ID["SK_HYNIX"]])
        finally:
            await reader.aclose()

    assert asyncio.run(run()) == []
    assert sorted(asked) == ["Alphabet", "Google", "SK Hynix"]
