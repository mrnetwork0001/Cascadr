"""Bitget's Demo Trading exchange, used as the paper-trading venue.

Orders go to Bitget's own demo environment (the one Agent Hub's
--paper-trading mode routes to): same host, the user's Demo API key, and the
`paptrading: 1` header on every request. Bitget fills them against its demo
market and keeps the order, position and P&L record in the demo account, so
the paper-trading log is Bitget's, not ours.

Uses the v3 (unified account) API, as Agent Hub does. When Agent Hub is
configured (app/market/agent_hub.py), orders are placed through it - Bitget's
own MCP server for agents, in --paper-trading mode - and this client reads the
fills back. Market orders are split into chunks of at most the instrument's
maxMarketOrderQty, and every fill is read back from Bitget (average price,
filled quantity, fees) rather than assumed.

Only instruments Bitget lists in demo can be traded here; at the time of
writing that is 8 of the graph's 15 stocks: NVDA, AAPL, TSLA, SAMSUNG, SKHY,
GOOGL, META and AMZN.
"""

import asyncio
import base64
import hashlib
import hmac
import json
import math
import time
from dataclasses import dataclass, field
from typing import Any

import httpx

from app.config import Settings
from app.market.agent_hub import AgentHub, AgentHubRejected, AgentHubUnavailable
from app.market.bitget import BASE_URL, TICKER_TTL_SECONDS, _Cached

CATEGORY = "USDT-FUTURES"
INSTRUMENTS_TTL_SECONDS = 600.0
FILL_POLLS = 8
FILL_POLL_SECONDS = 0.4


class DemoError(Exception):
    """Bitget answered with a non-success code."""

    def __init__(self, code: str, msg: str):
        super().__init__(f"bitget demo {code}: {msg}")
        self.code = code


@dataclass
class Execution:
    """What Bitget actually filled for one logical order (possibly several
    exchange orders)."""

    qty: float = 0.0
    value: float = 0.0
    fees: float = 0.0
    order_ids: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
    # How each order reached Bitget: "agent-hub" or "v3" (the native client).
    routes: list[str] = field(default_factory=list)

    @property
    def avg_price(self) -> float:
        return self.value / self.qty if self.qty else 0.0

    def detail(self, verb: str, symbol: str) -> str:
        ids = ",".join(self.order_ids) or "-"
        via = ""
        if self.routes:
            names = {"agent-hub": "Agent Hub", "v3": "v3 API"}
            via = " via " + "+".join(sorted({names.get(r, r) for r in self.routes}))
        s = (
            f"BITGET DEMO{via}: {verb} {self.qty:g} {symbol} @ avg {self.avg_price:.4f}, "
            f"fees {self.fees:.4f} USDT, orders {ids}"
        )
        if self.errors:
            s += f"; errors: {'; '.join(self.errors)[:200]}"
        return s


class BitgetDemo:
    def __init__(
        self, settings: Settings, client: httpx.AsyncClient | None = None,
        hub: AgentHub | None = None,
    ):
        self._s = settings
        self._hub = hub if hub is not None and hub.configured else None
        self._client = client or httpx.AsyncClient(base_url=BASE_URL, timeout=15.0)
        self._instruments = _Cached(INSTRUMENTS_TTL_SECONDS)
        self._tickers = _Cached(TICKER_TTL_SECONDS)
        self._leverage: dict[str, int] = {}
        self._hold_mode: str | None = None

    @property
    def configured(self) -> bool:
        return self._s.demo_configured

    async def aclose(self) -> None:
        await self._client.aclose()

    # ------------------------------------------------------------ transport

    def _headers(self, method: str, path: str, body: str) -> dict[str, str]:
        ts = str(int(time.time() * 1000))
        sign = base64.b64encode(
            hmac.new(
                (self._s.bitget_demo_api_secret or "").encode(),
                f"{ts}{method.upper()}{path}{body}".encode(),
                hashlib.sha256,
            ).digest()
        ).decode()
        return {
            "ACCESS-KEY": self._s.bitget_demo_api_key or "",
            "ACCESS-SIGN": sign,
            "ACCESS-TIMESTAMP": ts,
            "ACCESS-PASSPHRASE": self._s.bitget_demo_passphrase or "",
            "Content-Type": "application/json",
            "locale": "en-US",
            "paptrading": "1",
        }

    @staticmethod
    def _unwrap(r: httpx.Response) -> Any:
        try:
            data = r.json()
        except ValueError as exc:
            raise DemoError(str(r.status_code), r.text[:200]) from exc
        if data.get("code") != "00000":
            raise DemoError(str(data.get("code")), str(data.get("msg")))
        return data.get("data")

    async def _public(self, path: str, params: dict[str, str]) -> Any:
        r = await self._client.get(path, params=params, headers={"paptrading": "1"})
        return self._unwrap(r)

    async def _get(self, path: str, params: dict[str, str]) -> Any:
        query = "&".join(f"{k}={v}" for k, v in params.items() if v is not None)
        full = f"{path}?{query}" if query else path
        r = await self._client.get(full, headers=self._headers("GET", full, ""))
        return self._unwrap(r)

    async def _post(self, path: str, body: dict[str, str]) -> Any:
        payload = json.dumps(body, separators=(",", ":"))
        r = await self._client.post(path, content=payload, headers=self._headers("POST", path, payload))
        return self._unwrap(r)

    # --------------------------------------------------------- market data

    async def instruments(self) -> dict[str, dict]:
        async def fetch():
            rows = await self._public("/api/v3/market/instruments", {"category": CATEGORY})
            return {r["symbol"]: r for r in rows or [] if r.get("status") == "online"}

        return await self._instruments.get(fetch)

    async def listed(self, symbol: str) -> bool:
        return symbol in await self.instruments()

    async def marks(self, symbols: list[str]) -> dict[str, float]:
        """Bitget demo mark price per symbol. Unlisted symbols are omitted."""

        async def fetch():
            rows = await self._public("/api/v3/market/tickers", {"category": CATEGORY})
            return {r["symbol"]: r for r in rows or []}

        snap = await self._tickers.get(fetch)
        out: dict[str, float] = {}
        for s in symbols:
            row = snap.get(s)
            px = row and (row.get("markPrice") or row.get("lastPrice"))
            if px:
                out[s] = float(px)
        return out

    async def tickers(self, symbols: list[str]) -> dict[str, dict]:
        """Mark and 24h change per symbol, for the trading decision's context."""

        async def fetch():
            rows = await self._public("/api/v3/market/tickers", {"category": CATEGORY})
            return {r["symbol"]: r for r in rows or []}

        snap = await self._tickers.get(fetch)
        out: dict[str, dict] = {}
        for s in symbols:
            row = snap.get(s) or {}
            px = row.get("markPrice") or row.get("lastPrice")
            if not px:
                continue
            pct = row.get("price24hPcnt")
            out[s] = {
                "mark": float(px),
                "change_24h_pct": float(pct) * 100 if pct not in (None, "") else None,
            }
        return out

    # ------------------------------------------------------------- account

    async def hold_mode(self) -> str:
        if self._hold_mode is None:
            data = await self._get("/api/v3/account/settings", {})
            row = data[0] if isinstance(data, list) and data else (data or {})
            self._hold_mode = str(row.get("holdMode") or "one_way_mode")
        return self._hold_mode

    async def assets(self) -> Any:
        return await self._get("/api/v3/account/assets", {})

    async def positions(self) -> list[dict]:
        data = await self._get("/api/v3/position/current-position", {"category": CATEGORY})
        if isinstance(data, dict):
            data = data.get("list") or data.get("positions") or []
        return list(data or [])

    async def _ensure_leverage(self, symbol: str, leverage: int) -> str | None:
        if self._leverage.get(symbol) == leverage:
            return None
        try:
            await self._post(
                "/api/v3/account/set-leverage",
                {"category": CATEGORY, "symbol": symbol, "leverage": str(leverage)},
            )
            self._leverage[symbol] = leverage
            return None
        except DemoError as exc:
            # Leverage only changes margin used, not P&L; carry on, but say so.
            return f"leverage not set ({exc})"

    # -------------------------------------------------------------- orders

    @staticmethod
    def round_qty(qty: float, inst: dict) -> float:
        step = float(inst.get("quantityMultiplier") or 0.01)
        return math.floor(qty / step + 1e-9) * step

    @staticmethod
    def _fmt(qty: float, inst: dict) -> str:
        places = int(inst.get("quantityPrecision") or 2)
        return f"{qty:.{places}f}"

    def _chunks(self, qty: float, inst: dict) -> list[float]:
        cap = float(inst.get("maxMarketOrderQty") or qty) or qty
        out, left = [], qty
        while left > 1e-9:
            take = self.round_qty(min(cap, left), inst)
            if take <= 0:
                break
            out.append(take)
            left -= take
        return out

    async def _order_fill(self, order_id: str) -> dict:
        row: dict = {}
        for _ in range(FILL_POLLS):
            data = await self._get("/api/v3/trade/order-info", {"orderId": order_id})
            row = data[0] if isinstance(data, list) and data else (data or {})
            if row.get("orderStatus") in ("filled", "cancelled"):
                break
            await asyncio.sleep(FILL_POLL_SECONDS)
        return row

    async def _execute(self, symbol: str, qty: float, side: str, client_oid: str, *, close: bool) -> Execution:
        inst = (await self.instruments()).get(symbol)
        ex = Execution()
        if inst is None:
            ex.errors.append(f"{symbol} is not listed on Bitget demo")
            return ex
        hedge = (await self.hold_mode()) == "hedge_mode"
        for i, chunk in enumerate(self._chunks(qty, inst)):
            body = {
                "category": CATEGORY,
                "symbol": symbol,
                "qty": self._fmt(chunk, inst),
                "side": side,
                "orderType": "market",
                # 32 characters at most: ^[\.A-Z\:/a-z0-9_-]{1,32}$
                "clientOid": f"{client_oid[:29]}-{i}",
            }
            if hedge:
                body["posSide"] = "short"
            elif close:
                body["reduceOnly"] = "yes"
            try:
                order_id, route = await self._place(body)
                ex.routes.append(route)
                fill = await self._order_fill(order_id)
            except (DemoError, httpx.HTTPError) as exc:
                ex.errors.append(str(exc)[:160])
                break
            filled = float(fill.get("cumExecQty") or 0)
            ex.order_ids.append(order_id)
            ex.qty += filled
            ex.value += float(fill.get("cumExecValue") or filled * float(fill.get("avgPrice") or 0))
            for f in fill.get("feeDetail") or []:
                ex.fees += abs(float(f.get("fee") or 0))
        return ex

    async def _place(self, body: dict) -> tuple[str, str]:
        """Place one order: through Agent Hub when configured, else the native
        v3 client. Returns (orderId, route)."""
        if self._hub is not None:
            try:
                return await self._hub.place_order(body), "agent-hub"
            except AgentHubRejected as exc:
                # Bitget refused it: the same order would be refused again.
                raise DemoError("agent-hub", str(exc)) from exc
            except AgentHubUnavailable:
                # Outcome unknown. If the order reached Bitget, it is findable
                # by its clientOid; only an order that is not there is placed
                # again, natively, under the same clientOid (which Bitget would
                # reject as a duplicate anyway), so it can never fill twice.
                try:
                    row = await self._get("/api/v3/trade/order-info", {"clientOid": body["clientOid"]})
                    row = row[0] if isinstance(row, list) and row else (row or {})
                    if row.get("orderId"):
                        return str(row["orderId"]), "agent-hub"
                except DemoError:
                    pass  # no such order: it never reached Bitget
        placed = await self._post("/api/v3/trade/place-order", body)
        return str((placed or {}).get("orderId")), "v3"

    async def open_short(self, symbol: str, qty: float, leverage: int, client_oid: str) -> tuple[Execution, str | None]:
        note = await self._ensure_leverage(symbol, leverage)
        return await self._execute(symbol, qty, "sell", client_oid, close=False), note

    async def close_short(self, symbol: str, qty: float, client_oid: str) -> Execution:
        # Hedge mode closes a short with side=buy & posSide=short; one-way
        # mode with side=buy & reduceOnly=yes (Bitget v3 place-order).
        return await self._execute(symbol, qty, "buy", client_oid, close=True)
