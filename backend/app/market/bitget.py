"""Bitget client.

Two halves with very different risk profiles:

* Market data is public, unauthenticated and read-only.
* Trading is authenticated and gated. `place_order` simulates unless paper
  trading is explicitly disarmed AND credentials are present AND the notional
  is under the configured cap. Failing any of those is not an error — it
  returns a simulated fill and says why.

Instrument note: shorting requires the stock PERPETUAL FUTURES product
(symbol f"{ticker}USDT", productType "USDT-FUTURES"). Tokenized xStocks
(AAPLx, NVDAx) are spot-only and cannot be shorted.
"""

import asyncio
import base64
import hashlib
import hmac
import json
import time
from typing import Any

import httpx

from app.config import Settings
from app.models import OrderIntent, OrderResult

BASE_URL = "https://api.bitget.com"
PRODUCT_TYPE = "USDT-FUTURES"


def perp_symbol(ticker: str) -> str:
    """Underlying equity ticker -> Bitget stock-perp symbol."""
    return f"{ticker.upper()}USDT"


# Every viewer polls the tape; without a cache each poll would be its own
# request to Bitget. A few seconds is far below any price's meaningful change
# and keeps us well inside Bitget's public rate limits.
TICKER_TTL_SECONDS = 3.0
CONTRACTS_TTL_SECONDS = 600.0
# After a failed refresh, callers get the same error for this long instead of
# each retrying Bitget - a burst of page views during an outage must not turn
# into a burst of outbound requests.
FAILURE_TTL_SECONDS = 5.0


class _Cached:
    """One cached upstream call: concurrent misses share a single request,
    and a failure is remembered briefly rather than retried per caller."""

    def __init__(self, ttl: float):
        self._ttl = ttl
        self._value: tuple[float, Any] | None = None
        self._error: tuple[float, Exception] | None = None
        self._lock = asyncio.Lock()

    async def get(self, fetch) -> Any:
        if (hit := self._fresh()) is not None:
            return hit
        async with self._lock:
            # Another caller may have refreshed while this one waited.
            if (hit := self._fresh()) is not None:
                return hit
            if self._error and time.monotonic() - self._error[0] < FAILURE_TTL_SECONDS:
                raise self._error[1]
            # Stamped when the call finishes, not when it starts: a request
            # that times out after 15s must still be remembered as failed by
            # every caller that queued behind it.
            try:
                value = await fetch()
            except Exception as exc:
                self._error = (time.monotonic(), exc)
                raise
            self._value, self._error = (time.monotonic(), value), None
            return value

    def _fresh(self) -> Any | None:
        if self._value and time.monotonic() - self._value[0] < self._ttl:
            return self._value[1]
        return None


class BitgetClient:
    def __init__(self, settings: Settings, client: httpx.AsyncClient | None = None):
        self._s = settings
        self._client = client or httpx.AsyncClient(base_url=BASE_URL, timeout=15.0)
        self._tickers = _Cached(TICKER_TTL_SECONDS)
        self._contracts = _Cached(CONTRACTS_TTL_SECONDS)

    async def aclose(self) -> None:
        await self._client.aclose()

    # ---------------------------------------------------------------- public

    async def contracts(self) -> list[dict[str, Any]]:
        async def fetch():
            r = await self._client.get(
                "/api/v2/mix/market/contracts", params={"productType": PRODUCT_TYPE}
            )
            r.raise_for_status()
            return r.json().get("data") or []

        return await self._contracts.get(fetch)

    async def tickers(self) -> dict[str, dict[str, Any]]:
        async def fetch():
            r = await self._client.get(
                "/api/v2/mix/market/tickers", params={"productType": PRODUCT_TYPE}
            )
            r.raise_for_status()
            return {t["symbol"]: t for t in (r.json().get("data") or [])}

        return await self._tickers.get(fetch)

    async def listed_symbols(self) -> set[str]:
        return {c["symbol"] for c in await self.contracts()}

    async def marks(self, tickers: list[str]) -> dict[str, float]:
        """Bitget's MARK price per underlying ticker - the price the exchange
        itself uses to value perp positions (falls back to last trade if a row
        lacks it). Unlisted names are omitted, never defaulted: a missing price
        must not silently become 0."""
        snap = await self.tickers()
        out: dict[str, float] = {}
        for t in tickers:
            row = snap.get(perp_symbol(t))
            if not row:
                continue
            px = row.get("markPrice") or row.get("lastPr")
            if px:
                out[t] = float(px)
        return out

    async def quotes(self, tickers: list[str]) -> list[dict[str, Any]]:
        """Full live quote per ticker for the price tape: last, mark, and
        Bitget's own 24h open/high/low/change. Nothing here is derived locally."""
        snap = await self.tickers()
        out: list[dict[str, Any]] = []
        for t in tickers:
            row = snap.get(perp_symbol(t))
            if not row:
                continue
            f = lambda k: float(row[k]) if row.get(k) not in (None, "") else None
            out.append(
                {
                    "ticker": t,
                    "symbol": perp_symbol(t),
                    "last": f("lastPr"),
                    "mark": f("markPrice"),
                    "open24h": f("open24h"),
                    "high24h": f("high24h"),
                    "low24h": f("low24h"),
                    # Bitget reports change24h as a fraction; expose percent.
                    "change24h_pct": (f("change24h") or 0.0) * 100.0
                    if row.get("change24h") not in (None, "")
                    else None,
                    "volume_usdt": f("usdtVolume"),
                    "ts": int(row["ts"]) if row.get("ts") else None,
                }
            )
        return out

    # --------------------------------------------------------------- private

    def _headers(self, method: str, path: str, body: str) -> dict[str, str]:
        ts = str(int(time.time() * 1000))
        prehash = f"{ts}{method.upper()}{path}{body}"
        sign = base64.b64encode(
            hmac.new(
                self._s.bitget_api_secret.encode(),
                prehash.encode(),
                hashlib.sha256,
            ).digest()
        ).decode()
        return {
            "ACCESS-KEY": self._s.bitget_api_key or "",
            "ACCESS-SIGN": sign,
            "ACCESS-TIMESTAMP": ts,
            "ACCESS-PASSPHRASE": self._s.bitget_passphrase or "",
            "Content-Type": "application/json",
            "locale": "en-US",
        }

    def build_order_body(self, intent: OrderIntent) -> dict[str, str]:
        return {
            "symbol": intent.symbol,
            "productType": PRODUCT_TYPE,
            "marginMode": "isolated",
            "marginCoin": "USDT",
            "side": "sell" if intent.side.upper() == "SHORT" else "buy",
            "tradeSide": "open",
            "orderType": "market",
            "size": intent.size,
            "clientOid": intent.client_oid,
        }

    async def _signed_get(self, path: str, params: dict[str, str]) -> dict:
        query = "&".join(f"{k}={v}" for k, v in params.items())
        full = f"{path}?{query}" if query else path
        r = await self._client.get(full, headers=self._headers("GET", full, ""))
        return r.json()

    async def exchange_positions(self) -> tuple[list[dict], str]:
        """Open positions as the exchange sees them.

        Returns ([], reason) rather than raising when credentials are absent —
        reconciliation must degrade to "cannot check" instead of "nothing open",
        because those two look identical and mean opposite things.
        """
        if not self._s.has_trading_credentials:
            return [], "no trading credentials — cannot query exchange positions"
        try:
            data = await self._signed_get(
                "/api/v2/mix/position/all-position",
                {"productType": PRODUCT_TYPE, "marginCoin": "USDT"},
            )
        except Exception as exc:
            return [], f"{type(exc).__name__}: {exc}"
        if data.get("code") != "00000":
            return [], f"bitget: {data.get('msg')}"
        return data.get("data") or [], "ok"

    def build_close_body(self, position_symbol: str, size: str, side: str) -> dict[str, str]:
        """Flatten an open position.

        Bitget closes with the OPPOSITE side and tradeSide 'close': a short is
        covered by a buy. Getting this backwards doubles the position instead
        of closing it, which is why it lives in one place.
        """
        return {
            "symbol": position_symbol,
            "productType": PRODUCT_TYPE,
            "marginMode": "isolated",
            "marginCoin": "USDT",
            "side": "buy" if side.upper() == "SHORT" else "sell",
            "tradeSide": "close",
            "orderType": "market",
            "size": size,
        }

    async def close_position(
        self, symbol: str, size: str, side: str
    ) -> tuple[bool, bool, str, dict]:
        """(accepted, paper, detail, request_body) — same gates as opening."""
        body = self.build_close_body(symbol, size, side)

        if self._s.paper_trading:
            return True, True, "PAPER: close simulated, nothing sent.", body
        if not self._s.has_trading_credentials:
            return True, True, "PAPER: no credentials; close simulated.", body

        path = "/api/v2/mix/order/place-order"
        payload = json.dumps(body, separators=(",", ":"))
        r = await self._client.post(
            path, content=payload, headers=self._headers("POST", path, payload)
        )
        data = r.json()
        ok = data.get("code") == "00000"
        return ok, False, f"LIVE: {data.get('msg', r.text)}", body

    async def place_order(self, intent: OrderIntent) -> OrderResult:
        """Submit, or explain precisely why it was simulated instead."""
        body = self.build_order_body(intent)

        # --- safety gates, most important first --------------------------
        if self._s.paper_trading:
            return OrderResult(
                intent=intent, accepted=True, paper=True, request_body=body,
                detail="PAPER: CASCADR_PAPER_TRADING is not 'false'. Nothing sent.",
            )
        if not self._s.has_trading_credentials:
            return OrderResult(
                intent=intent, accepted=True, paper=True, request_body=body,
                detail="PAPER: live mode requested but Bitget credentials are absent.",
            )
        if intent.notional_usdt > self._s.cascadr_max_order_usdt:
            return OrderResult(
                intent=intent, accepted=False, paper=True, request_body=body,
                detail=(
                    f"REJECTED: notional {intent.notional_usdt:.0f} USDT exceeds cap "
                    f"{self._s.cascadr_max_order_usdt:.0f}."
                ),
            )

        path = "/api/v2/mix/order/place-order"
        payload = json.dumps(body, separators=(",", ":"))
        r = await self._client.post(
            path, content=payload, headers=self._headers("POST", path, payload)
        )
        data = r.json()
        ok = data.get("code") == "00000"
        return OrderResult(
            intent=intent,
            accepted=ok,
            paper=False,
            request_body=body,
            order_id=(data.get("data") or {}).get("orderId") if ok else None,
            detail=f"LIVE: {data.get('msg', r.text)}",
        )
