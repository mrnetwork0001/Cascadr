"""Trade alerts: pushed on a real open or close, and never in the way of one."""

import httpx
import pytest

from app.alerts import Alerts
from app.config import Settings
from app.market.paper import PaperBroker
from app.models import CloseReason
from app.portfolio.store import PositionStore
from tests.test_bitget_demo import FakeDemo, manager
from tests.test_portfolio import make


def alerts(handler, **kw) -> Alerts:
    s = Settings(cascadr_alert_ntfy_topic="cascadr-test-topic", **kw)
    return Alerts(s, httpx.AsyncClient(transport=httpx.MockTransport(handler)))


class Recorder:
    """Stands in for Alerts in the manager."""

    def __init__(self, fail: bool = False):
        self.fail = fail
        self.sent: list[tuple[str, str]] = []

    async def send(self, title, message, tags="", priority="default"):
        if self.fail:
            raise RuntimeError("push service down")
        self.sent.append((title, message))
        return True


@pytest.mark.asyncio
async def test_an_alert_is_posted_to_the_topic():
    seen: list[httpx.Request] = []

    def handler(req):
        seen.append(req)
        return httpx.Response(200, json={"id": "x"})

    a = alerts(handler, cascadr_public_url="https://cascadr.example")
    assert await a.send("Cascadr opened a short: NVDAUSDT", "SHORT NVDAUSDT", tags="x", priority="high")
    (req,) = seen
    assert str(req.url) == "https://ntfy.sh/cascadr-test-topic"
    assert req.headers["Title"] == "Cascadr opened a short: NVDAUSDT"
    assert req.headers["Priority"] == "high" and req.headers["Tags"] == "x"
    assert req.headers["Click"] == "https://cascadr.example/terminal"
    assert req.content == b"SHORT NVDAUSDT"
    assert a.sent == 1 and a.failed == 0


@pytest.mark.asyncio
async def test_without_a_topic_nothing_is_sent():
    seen = []
    a = Alerts(Settings(), httpx.AsyncClient(transport=httpx.MockTransport(seen.append)))
    assert not a.configured
    assert await a.send("t", "m") is False and seen == []


@pytest.mark.asyncio
async def test_a_failed_push_is_counted_not_raised():
    a = alerts(lambda req: httpx.Response(503))
    assert await a.send("t", "m") is False
    assert a.failed == 1 and a.sent == 0


@pytest.mark.asyncio
async def test_a_round_trip_alerts_on_open_and_on_close(tmp_path):
    pm, store = manager(tmp_path, FakeDemo())
    pm._alerts = rec = Recorder()
    p, _, _ = await pm.open_short(
        ticker="NVDA", notional_usdt=30_000, leverage=2, mark=200.0,
        thesis="TSMC fab fire hits NVDA supply", origin="TSMC", source="agent")
    await pm.close(p, 190.0, CloseReason.TAKE_PROFIT)
    (o_title, o_msg), (c_title, c_msg) = rec.sent
    assert o_title == "Cascadr opened a short: NVDAUSDT"
    assert "Bitget demo" in o_msg and "TSMC fab fire" in o_msg
    assert c_title.startswith("Cascadr closed NVDAUSDT: +") and "TAKE_PROFIT" in c_msg
    # A second close of the same position is a no-op and sends nothing.
    assert await pm.close(p, 190.0, CloseReason.MANUAL) == "already closed"
    assert len(rec.sent) == 2
    store.close()


@pytest.mark.asyncio
async def test_a_broken_alert_never_breaks_the_trade(tmp_path):
    pm, store = manager(tmp_path, FakeDemo())
    pm._alerts = Recorder(fail=True)
    p, _, kind = await pm.open_short(
        ticker="NVDA", notional_usdt=30_000, leverage=2, mark=200.0,
        thesis="t", origin="TSMC", source="agent")
    assert p is not None and kind == ""
    await pm.close(p, 190.0, CloseReason.TAKE_PROFIT)
    assert (await store.get(p.id)).status == "CLOSED"
    store.close()


@pytest.mark.asyncio
async def test_a_rejected_close_sends_no_alert(tmp_path):
    from app.portfolio.manager import PortfolioManager

    class Venue:
        async def close_position(self, *a):
            return True, True, "paper", None

    store = PositionStore(tmp_path / "t.db")
    p = make()
    await store.add(p)
    rec = Recorder()
    pm = PortfolioManager(store, Venue(), paper=PaperBroker(reject_rate=1.0, partial_rate=0.0), alerts=rec)
    await pm.close(p, 190.0, CloseReason.MANUAL)
    assert (await store.get(p.id)).status == "OPEN" and rec.sent == []
    store.close()
