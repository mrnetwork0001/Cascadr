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


class BitgetClient:
    def __init__(self, settings: Settings, client: httpx.AsyncClient | None = None):
        self._s = settings
        self._client = client or httpx.AsyncClient(base_url=BASE_URL, timeout=15.0)

    async def aclose(self) -> None:
        await self._client.aclose()

    # ---------------------------------------------------------------- public

    async def contracts(self) -> list[dict[str, Any]]:
        r = await self._client.get(
            "/api/v2/mix/market/contracts", params={"productType": PRODUCT_TYPE}
        )
        r.raise_for_status()
        return r.json().get("data") or []

    async def tickers(self) -> dict[str, dict[str, Any]]:
        r = await self._client.get(
            "/api/v2/mix/market/tickers", params={"productType": PRODUCT_TYPE}
        )
        r.raise_for_status()
        return {t["symbol"]: t for t in (r.json().get("data") or [])}

    async def listed_symbols(self) -> set[str]:
        return {c["symbol"] for c in await self.contracts()}

    async def marks(self, tickers: list[str]) -> dict[str, float]:
        """Last traded price per underlying ticker. Unlisted names are omitted
        rather than defaulted — a missing price must not silently become 0."""
        snap = await self.tickers()
        out: dict[str, float] = {}
        for t in tickers:
            row = snap.get(perp_symbol(t))
            if row and row.get("lastPr"):
                out[t] = float(row["lastPr"])
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
