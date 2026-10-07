"""Orders through Bitget Agent Hub: the stdio MCP client, and the order path's
handling of a refused order versus an unknown outcome."""

import json
import sys
import textwrap

import pytest

from app.config import Settings
from app.market.agent_hub import AgentHub, AgentHubRejected, AgentHubUnavailable
from app.market.bitget_demo import BitgetDemo
from app.models import CloseReason
from tests.test_bitget_demo import KEYS, FakeDemo, demo_client, manager

# A stand-in MCP server: answers initialize and tools/call over stdio the way
# @bitget-ai/bitget-agent-mcp does, with a log line on stdout to be skipped.
FAKE_SERVER = textwrap.dedent('''
    import json, sys
    print("starting...", flush=True)
    for line in sys.stdin:
        msg = json.loads(line)
        if "id" not in msg:
            continue
        if msg["method"] == "initialize":
            result = {"protocolVersion": "2025-06-18", "capabilities": {}}
        else:
            args = msg["params"]["arguments"]
            if args.get("symbol") == "BADUSDT":
                payload = {"ok": False, "error": {"message": "symbol not found"}}
            else:
                payload = {"ok": True, "endpoint": "POST /api/v3/trade/place-order",
                           "data": {"orderId": "hub-1", "clientOid": args.get("clientOid")}}
            result = {"content": [{"type": "text", "text": json.dumps(payload)}]}
        print(json.dumps({"jsonrpc": "2.0", "id": msg["id"], "result": result}), flush=True)
''')


def hub_with_fake_server(tmp_path) -> AgentHub:
    script = tmp_path / "server.py"
    script.write_text(FAKE_SERVER)
    return AgentHub(Settings(**KEYS), command=[sys.executable, str(script)])


@pytest.mark.asyncio
async def test_the_stdio_client_places_and_reports_refusals(tmp_path):
    hub = hub_with_fake_server(tmp_path)
    assert await hub.place_order({"symbol": "NVDAUSDT", "clientOid": "c1"}) == "hub-1"
    with pytest.raises(AgentHubRejected):
        await hub.place_order({"symbol": "BADUSDT", "clientOid": "c2"})
    assert hub.calls == 2 and hub.failures == 0
    await hub.aclose()


@pytest.mark.asyncio
async def test_a_dead_process_is_unavailable_not_refused(tmp_path):
    hub = AgentHub(Settings(**KEYS), command=[sys.executable, "-c", "pass"])
    with pytest.raises(AgentHubUnavailable):
        await hub.place_order({"symbol": "NVDAUSDT", "clientOid": "c1"})
    assert hub.failures == 1


class FakeHub:
    """Agent Hub stand-in that forwards to the FakeDemo exchange, or fails."""

    configured = True

    def __init__(self, fake: FakeDemo, mode: str):
        self.fake, self.mode, self.placed = fake, mode, []

    async def place_order(self, body):
        self.placed.append(body["clientOid"])
        if self.mode == "rejected":
            raise AgentHubRejected("insufficient balance")
        if self.mode == "lost-after-send":
            # The order reached Bitget, then the transport died.
            self._send(body)
            raise AgentHubUnavailable("process exited")
        if self.mode == "down":
            raise AgentHubUnavailable("process exited")
        return self._send(body)

    def _send(self, body):
        import httpx
        resp = self.fake.handler(httpx.Request(
            "POST", "https://api.bitget.com/api/v3/trade/place-order", content=json.dumps(body)))
        return resp.json()["data"]["orderId"]


def demo_with_hub(fake: FakeDemo, hub: FakeHub) -> BitgetDemo:
    d = demo_client(fake)
    d._hub = hub
    return d


def places(fake: FakeDemo) -> int:
    return len(fake.orders)


@pytest.mark.asyncio
async def test_orders_go_through_agent_hub_and_say_so(tmp_path):
    fake = FakeDemo("hedge_mode")
    pm, store = manager(tmp_path, fake)
    hub = FakeHub(fake, "ok")
    pm._demo = demo_with_hub(fake, hub)
    p, detail, kind = await pm.open_short(ticker="NVDA", notional_usdt=6_000, leverage=2, mark=200.0,
                                          thesis="t", origin="TSMC", source="agent")
    assert kind == "" and "via Agent Hub" in detail and "v3 API" not in detail
    assert len(hub.placed) == places(fake) == 1  # every order went through Agent Hub
    await pm.close(p, 190.0, CloseReason.MANUAL)
    assert len(hub.placed) == 2
    store.close()


@pytest.mark.asyncio
async def test_a_refused_order_is_not_retried_elsewhere(tmp_path):
    fake = FakeDemo("hedge_mode")
    pm, store = manager(tmp_path, fake)
    pm._demo = demo_with_hub(fake, FakeHub(fake, "rejected"))
    p, detail, kind = await pm.open_short(ticker="NVDA", notional_usdt=6_000, leverage=2, mark=200.0,
                                          thesis="t", origin="TSMC", source="agent")
    assert p is None and "insufficient balance" in detail and places(fake) == 0
    store.close()


@pytest.mark.asyncio
async def test_an_order_lost_after_sending_is_found_not_doubled(tmp_path):
    fake = FakeDemo("hedge_mode")
    pm, store = manager(tmp_path, fake)
    pm._demo = demo_with_hub(fake, FakeHub(fake, "lost-after-send"))
    p, detail, kind = await pm.open_short(ticker="NVDA", notional_usdt=6_000, leverage=2, mark=200.0,
                                          thesis="t", origin="TSMC", source="agent")
    assert p is not None and places(fake) == 1  # found by clientOid, not re-placed
    store.close()


@pytest.mark.asyncio
async def test_with_agent_hub_down_the_native_client_places_it_once(tmp_path):
    fake = FakeDemo("hedge_mode")
    pm, store = manager(tmp_path, fake)
    pm._demo = demo_with_hub(fake, FakeHub(fake, "down"))
    p, detail, kind = await pm.open_short(ticker="NVDA", notional_usdt=6_000, leverage=2, mark=200.0,
                                          thesis="t", origin="TSMC", source="agent")
    assert p is not None and places(fake) == 1 and "via v3 API" in detail
    store.close()
