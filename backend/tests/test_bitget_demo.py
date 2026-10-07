"""Paper trading on Bitget's demo exchange, against a mock of its v3 API."""

import json
import re

import httpx
import pytest

from app.config import Settings
from app.market.bitget import BitgetClient
from app.market.bitget_demo import BitgetDemo
from app.models import CloseReason, PositionStatus
from app.portfolio.manager import PortfolioManager
from app.portfolio.store import PositionStore

KEYS = dict(bitget_demo_api_key="k", bitget_demo_api_secret="s", bitget_demo_passphrase="p")
NVDA = {
    "symbol": "NVDAUSDT", "status": "online", "minOrderQty": "0.01", "minOrderAmount": "5",
    "quantityMultiplier": "0.01", "quantityPrecision": "2", "maxMarketOrderQty": "60",
}


class FakeDemo:
    """Just enough of Bitget's v3 demo API: fills market orders at a fixed
    price with a 0.06% taker fee, and records every request."""

    def __init__(self, hold_mode="one_way_mode", price=200.0, close_price=190.0):
        self.hold_mode, self.price, self.close_price = hold_mode, price, close_price
        self.requests: list[httpx.Request] = []
        self.orders: dict[str, dict] = {}

    def handler(self, req: httpx.Request) -> httpx.Response:
        self.requests.append(req)
        path = req.url.path
        ok = lambda data: httpx.Response(200, json={"code": "00000", "msg": "success", "data": data})
        if path == "/api/v3/market/instruments":
            return ok([NVDA])
        if path == "/api/v3/market/tickers":
            return ok([{"symbol": "NVDAUSDT", "markPrice": str(self.price), "lastPrice": str(self.price)}])
        if path == "/api/v3/account/settings":
            return ok({"holdMode": self.hold_mode})
        if path == "/api/v3/account/set-leverage":
            return ok(None)
        if path == "/api/v3/trade/place-order":
            body = json.loads(req.content)
            oid = f"o{len(self.orders) + 1}"
            px = self.price if body["side"] == "sell" else self.close_price
            qty = float(body["qty"])
            self.orders[oid] = {
                "orderId": oid, "orderStatus": "filled", "cumExecQty": body["qty"],
                "cumExecValue": str(qty * px), "avgPrice": str(px),
                "feeDetail": [{"feeCoin": "USDT", "fee": str(-qty * px * 0.0006)}], "body": body,
            }
            return ok({"orderId": oid, "clientOid": body["clientOid"]})
        if path == "/api/v3/trade/order-info":
            if "clientOid" in req.url.params:
                cid = req.url.params["clientOid"]
                row = next((o for o in self.orders.values() if o["body"]["clientOid"] == cid), None)
                if row is None:
                    return httpx.Response(200, json={"code": "40109", "msg": "order not found"})
                return ok(row)
            return ok(self.orders[req.url.params["orderId"]])
        return httpx.Response(404, json={"code": "40404", "msg": "not mocked"})


def demo_client(fake: FakeDemo) -> BitgetDemo:
    return BitgetDemo(Settings(**KEYS), httpx.AsyncClient(
        base_url="https://api.bitget.com", transport=httpx.MockTransport(fake.handler)))


def manager(tmp_path, fake: FakeDemo) -> tuple[PortfolioManager, PositionStore]:
    store = PositionStore(tmp_path / "t.db")
    pm = PortfolioManager(store, BitgetClient(Settings()), demo=demo_client(fake))
    return pm, store


@pytest.mark.asyncio
@pytest.mark.parametrize("hold_mode", ["one_way_mode", "hedge_mode"])
async def test_a_short_round_trip_on_bitget_demo(tmp_path, hold_mode):
    fake = FakeDemo(hold_mode)
    pm, store = manager(tmp_path, fake)
    assert pm.venue == "bitget-demo"

    # 30,000 USDT at 200 is 150 shares: three market orders of at most 60.
    p, detail, kind = await pm.open_short(
        ticker="NVDA", notional_usdt=30_000, leverage=2, mark=200.0,
        thesis="t", origin="TSMC", target_pct=-3.0, source="agent")
    assert kind == "" and p.venue == "bitget-demo" and "BITGET DEMO" in detail
    sells = [json.loads(r.content) for r in fake.requests if r.url.path.endswith("place-order")]
    assert [s["qty"] for s in sells] == ["60.00", "60.00", "30.00"]
    assert all(s["side"] == "sell" for s in sells)
    assert all(re.fullmatch(r"[.A-Z:/a-z0-9_-]{1,32}", s["clientOid"]) for s in sells)
    assert p.size == pytest.approx(150) and p.entry_price == pytest.approx(200.0)
    assert p.fees_usdt == pytest.approx(150 * 200 * 0.0006)

    # Every private request carries the demo header and a signature.
    private = [r for r in fake.requests if "/trade/" in r.url.path or "/account/" in r.url.path]
    assert all(r.headers.get("paptrading") == "1" and r.headers.get("ACCESS-SIGN") for r in private)

    # Marked at Bitget's demo price; closed on Bitget, net of both fees.
    assert (await pm.position_marks([p]))[p.id] == pytest.approx(200.0)
    await pm.close(p, 190.0, CloseReason.TAKE_PROFIT)
    buys = [json.loads(r.content) for r in fake.requests if r.url.path.endswith("place-order")][3:]
    assert all(b["side"] == "buy" for b in buys)
    if hold_mode == "hedge_mode":
        assert all(b["posSide"] == "short" and "reduceOnly" not in b for b in buys)
    else:
        assert all(b["reduceOnly"] == "yes" and "posSide" not in b for b in buys)
    done = await store.get(p.id)
    gross = 150 * (200.0 - 190.0)
    fees = 150 * 200 * 0.0006 + 150 * 190 * 0.0006
    assert done.status is PositionStatus.CLOSED
    assert done.realized_pnl_usdt == pytest.approx(gross - fees)
    assert any(e["kind"] == "BITGET_FILL" for e in await store.events())
    store.close()


@pytest.mark.asyncio
async def test_symbols_not_listed_on_demo_are_not_traded(tmp_path):
    fake = FakeDemo()
    pm, store = manager(tmp_path, fake)
    p, detail, kind = await pm.open_short(
        ticker="AMD", notional_usdt=30_000, leverage=2, mark=150.0,
        thesis="t", origin="TSMC", source="agent")
    assert p is None and kind == "unlisted" and "not listed" in detail
    assert not [r for r in fake.requests if r.url.path.endswith("place-order")]
    store.close()


def test_without_a_demo_key_the_simulator_is_used(tmp_path):
    store = PositionStore(tmp_path / "t.db")
    pm = PortfolioManager(store, BitgetClient(Settings()), demo=BitgetDemo(Settings()))
    assert pm.venue == "cascadr-sim"
    store.close()


def test_the_test_suite_cannot_reach_a_real_account():
    """Whatever keys backend/.env holds, tests run without them."""
    s = Settings()
    assert not s.demo_configured and not s.has_trading_credentials
