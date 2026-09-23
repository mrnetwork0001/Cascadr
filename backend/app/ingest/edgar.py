"""SEC EDGAR ingestion — the source of DISCLOSED graph edges.

What filings actually give you
------------------------------
Item 1A / segment notes require a filer to disclose any customer above ~10% of
revenue. That is a *revenue* dependency (this company depends on that customer
for N% of sales), not a *supply* dependency, and the two propagate in opposite
directions:

    supply   : upstream breaks   -> downstream cannot build   (TSMC -> NVDA)
    revenue  : downstream cuts   -> upstream loses revenue    (NVDA -> its customer)

Supplier percentages are rarely disclosed at all, which is why the seed graph's
supply weights are ESTIMATED. Revenue concentration is legally required, so it
is the one dependency number that can be cited — and this module extracts it.

SEC requires a descriptive User-Agent with contact details on every request.
"""

import asyncio
import re

import httpx
from pydantic import BaseModel

from app.models import Provenance

SUBMISSIONS = "https://data.sec.gov/submissions/CIK{cik:010d}.json"
TICKER_MAP = "https://www.sec.gov/files/company_tickers.json"
ARCHIVE = "https://www.sec.gov/Archives/edgar/data/{cik}/{acc}/{doc}"

# A sentence naming a customer and a percentage of revenue, in either order.
_CONCENTRATION = re.compile(
    r"[^.]*?\b(?:customer|direct customer)s?\b[^.]{0,220}?"
    r"(\d{1,2})\s*%[^.]{0,160}?(?:revenue|sales)[^.]*\.",
    re.I,
)
_TAG = re.compile(r"<[^>]+>")
_ENTITY = re.compile(r"&#\d+;|&[a-z]+;")
_WS = re.compile(r"\s+")


class Concentration(BaseModel):
    """One disclosed revenue-concentration fact, with its citation."""

    ticker: str
    company: str
    pct: float
    sentence: str
    filing_date: str
    accession: str
    source_url: str
    provenance: Provenance = Provenance.DISCLOSED


class EdgarClient:
    def __init__(self, user_agent: str, client: httpx.AsyncClient | None = None):
        # SEC blocks default/empty agents; this must identify you.
        self._client = client or httpx.AsyncClient(
            headers={"User-Agent": user_agent}, timeout=45.0, follow_redirects=True
        )
        self._ticker_to_cik: dict[str, int] = {}

    async def aclose(self) -> None:
        await self._client.aclose()

    async def _load_ticker_map(self) -> None:
        if self._ticker_to_cik:
            return
        r = await self._client.get(TICKER_MAP)
        r.raise_for_status()
        self._ticker_to_cik = {
            row["ticker"].upper(): int(row["cik_str"]) for row in r.json().values()
        }

    async def cik_for(self, ticker: str) -> int | None:
        await self._load_ticker_map()
        return self._ticker_to_cik.get(ticker.upper())

    async def latest_10k(self, ticker: str) -> tuple[str, str, str, str] | None:
        """(company, filing_date, accession, document_url) for the newest 10-K."""
        cik = await self.cik_for(ticker)
        if cik is None:
            return None

        r = await self._client.get(SUBMISSIONS.format(cik=cik))
        r.raise_for_status()
        sub = r.json()
        rec = sub["filings"]["recent"]

        for i, form in enumerate(rec["form"]):
            if form != "10-K":
                continue
            acc = rec["accessionNumber"][i]
            url = ARCHIVE.format(
                cik=cik, acc=acc.replace("-", ""), doc=rec["primaryDocument"][i]
            )
            return sub["name"], rec["filingDate"][i], acc, url
        return None

    async def concentrations(self, ticker: str, limit: int = 6) -> list[Concentration]:
        """Disclosed revenue-concentration sentences from the latest 10-K."""
        found = await self.latest_10k(ticker)
        if found is None:
            return []
        company, filed, acc, url = found

        r = await self._client.get(url)
        r.raise_for_status()
        text = _WS.sub(" ", _ENTITY.sub(" ", _TAG.sub(" ", r.text)))

        out: list[Concentration] = []
        seen: set[str] = set()
        for m in _CONCENTRATION.finditer(text):
            sentence = m.group(0).strip()
            # The same disclosure is repeated in the MD&A and the notes.
            key = sentence[:90].lower()
            if key in seen:
                continue
            seen.add(key)
            out.append(
                Concentration(
                    ticker=ticker.upper(),
                    company=company,
                    pct=float(m.group(1)),
                    sentence=sentence[:400],
                    filing_date=filed,
                    accession=acc,
                    source_url=url,
                )
            )
            if len(out) >= limit:
                break
        return out

    async def concentrations_for(
        self, tickers: list[str], limit: int = 6
    ) -> dict[str, list[Concentration]]:
        """Sequential on purpose — SEC asks for <=10 req/s and throttles bursts."""
        out: dict[str, list[Concentration]] = {}
        for t in tickers:
            try:
                out[t] = await self.concentrations(t, limit=limit)
            except Exception as exc:  # one bad filing must not sink the batch
                out[t] = []
                print(f"[edgar] {t}: {type(exc).__name__}: {exc}")
            await asyncio.sleep(0.15)
        return out
