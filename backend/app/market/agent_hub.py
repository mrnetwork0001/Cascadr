"""Bitget Agent Hub as the order path to Bitget's demo exchange.

Agent Hub's MCP server (`@bitget-ai/bitget-agent-mcp`) is the tool Bitget
built for AI agents to trade through. Cascadr runs it in `--paper-trading`
mode, which signs for Bitget's Demo Trading environment with the same Demo
API key and account the native v3 client uses, and places its demo orders
through it. The server runs as a local subprocess speaking MCP over stdio:
JSON-RPC 2.0, one message per line.

Two failure kinds are kept apart, because they call for opposite handling:
`AgentHubRejected` means Bitget answered and refused the order (never retry
it elsewhere); `AgentHubUnavailable` means the process or transport failed,
so the order may or may not have reached Bitget (the caller must check by
its clientOid before placing it any other way).
"""

from __future__ import annotations

import asyncio
import json
import os
from typing import Any

from app.config import Settings

PROTOCOL_VERSION = "2025-06-18"
CALL_TIMEOUT_SECONDS = 20.0


class AgentHubRejected(Exception):
    """Bitget, through Agent Hub, refused the request."""


class AgentHubUnavailable(Exception):
    """The Agent Hub process or its transport failed; outcome unknown."""


class AgentHub:
    def __init__(self, settings: Settings, command: list[str] | None = None):
        self._s = settings
        entry = settings.cascadr_agent_hub_entry
        self._cmd = command or (
            [settings.cascadr_agent_hub_node, entry, "--paper-trading", "--modules", "account,trade,market"]
            if entry else []
        )
        self._proc: asyncio.subprocess.Process | None = None
        self._lock = asyncio.Lock()
        self._id = 0
        self.calls = 0
        self.failures = 0
        self.last_error: str | None = None

    @property
    def configured(self) -> bool:
        return bool(self._cmd) and self._s.demo_configured

    def describe(self) -> dict:
        return {
            "configured": self.configured,
            "package": "@bitget-ai/bitget-agent-mcp --paper-trading",
            "calls": self.calls,
            "failures": self.failures,
            "last_error": self.last_error,
        }

    # ----------------------------------------------------------- process

    async def _start(self) -> None:
        env = {
            "PATH": os.environ.get("PATH", "/usr/local/bin:/usr/bin:/bin"),
            "HOME": self._s.cascadr_agent_hub_home or os.environ.get("HOME", "/tmp"),
            # Demo credentials only: --paper-trading routes every signed call
            # to Bitget's Demo Trading environment.
            "BITGET_API_KEY": self._s.bitget_demo_api_key or "",
            "BITGET_SECRET_KEY": self._s.bitget_demo_api_secret or "",
            "BITGET_PASSPHRASE": self._s.bitget_demo_passphrase or "",
        }
        self._proc = await asyncio.create_subprocess_exec(
            *self._cmd,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
            env=env,
            limit=8 * 1024 * 1024,
        )
        await self._request("initialize", {
            "protocolVersion": PROTOCOL_VERSION,
            "capabilities": {},
            "clientInfo": {"name": "cascadr", "version": "1"},
        })
        await self._send({"jsonrpc": "2.0", "method": "notifications/initialized"})

    async def _stop(self) -> None:
        proc, self._proc = self._proc, None
        if proc is not None and proc.returncode is None:
            proc.kill()
            try:
                await asyncio.wait_for(proc.wait(), 5)
            except (TimeoutError, asyncio.TimeoutError):
                pass

    async def aclose(self) -> None:
        async with self._lock:
            await self._stop()

    async def _send(self, msg: dict) -> None:
        assert self._proc is not None and self._proc.stdin is not None
        self._proc.stdin.write((json.dumps(msg) + "\n").encode())
        await self._proc.stdin.drain()

    async def _request(self, method: str, params: dict) -> dict:
        assert self._proc is not None and self._proc.stdout is not None
        self._id += 1
        rid = self._id
        await self._send({"jsonrpc": "2.0", "id": rid, "method": method, "params": params})
        while True:
            line = await asyncio.wait_for(self._proc.stdout.readline(), CALL_TIMEOUT_SECONDS)
            if not line:
                raise AgentHubUnavailable("Agent Hub process exited")
            try:
                msg = json.loads(line)
            except ValueError:
                continue  # not a protocol message
            if msg.get("id") != rid:
                continue  # a notification, or a stale reply
            if "error" in msg:
                raise AgentHubUnavailable(f"MCP error: {str(msg['error'].get('message'))[:160]}")
            return msg.get("result") or {}

    # ------------------------------------------------------------- tools

    async def call(self, tool: str, arguments: dict) -> Any:
        """Call one Agent Hub tool; returns its `data`. Raises AgentHubRejected
        when Bitget refused, AgentHubUnavailable when the outcome is unknown."""
        if not self.configured:
            raise AgentHubUnavailable("Agent Hub is not configured")
        async with self._lock:
            try:
                if self._proc is None or self._proc.returncode is not None:
                    await self._start()
                result = await self._request("tools/call", {"name": tool, "arguments": arguments})
            except (OSError, TimeoutError, asyncio.TimeoutError, AgentHubUnavailable, AssertionError) as exc:
                await self._stop()
                self.failures += 1
                self.last_error = f"{type(exc).__name__}: {exc}"[:200]
                raise AgentHubUnavailable(self.last_error) from exc
        self.calls += 1
        payload = result.get("structuredContent")
        if not isinstance(payload, dict):
            text = "".join(
                c.get("text", "") for c in result.get("content", []) if isinstance(c, dict)
            )
            try:
                payload = json.loads(text)
            except ValueError:
                payload = {"ok": False, "error": {"message": text[:200] or "empty response"}}
        if result.get("isError") or not payload.get("ok", False):
            err = payload.get("error") or {}
            msg = err.get("message") if isinstance(err, dict) else str(err)
            raise AgentHubRejected(str(msg or payload)[:200])
        return payload.get("data")

    async def place_order(self, body: dict) -> str:
        """Place one Bitget v3 order through Agent Hub; returns its orderId."""
        data = await self.call("order", {"action": "place", **body})
        row = data[0] if isinstance(data, list) and data else (data or {})
        order_id = row.get("orderId") if isinstance(row, dict) else None
        if not order_id:
            raise AgentHubUnavailable(f"no orderId in Agent Hub response: {str(data)[:160]}")
        return str(order_id)
