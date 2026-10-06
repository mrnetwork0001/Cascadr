"""LLM client for the 0G Private Computer router.

Wire formats
------------
0G routes every vendor through one API, but not every model accepts the same
shape. Measured against the live router:

    claude-* , glm-* , deepseek-*   ->  POST /v1/messages          (anthropic)
    gpt-*                           ->  POST /v1/chat/completions  (openai)

Sending a GPT model to /v1/messages returns "model not available on anthropic
format", and the reverse for Claude. `LLM_API_FORMAT=auto` picks by model name;
set it explicitly to override.

Raw HTTP rather than the Anthropic SDK: this is a third-party router whose
responses carry fields the typed SDK would discard - `x_0g_trace` (provider
address, on-chain billing) and the `x-provider` header. Those are the
verifiable provenance of a trading decision, so they are worth more here than
the SDK's typed models.

Trust mode
----------
`X-0G-Provider-Trust-Mode: verified` restricts execution to attestable
providers. It is opt-in because it also restricts availability - measured:
claude-opus-5 returns 503 "no provider available" under verified, while
deepseek-v4-pro succeeds.
"""

import json
import re
from dataclasses import dataclass, field
from typing import Any

import httpx

from app.config import Settings

_FENCE = re.compile(r"```(?:json)?\s*(.*?)```", re.S)


def _extract_json(text: str) -> dict[str, Any] | None:
    if not text:
        return None
    candidates = [text]
    m = _FENCE.search(text)
    if m:
        candidates.insert(0, m.group(1))
    start, end = text.find("{"), text.rfind("}")
    if start != -1 and end > start:
        candidates.append(text[start : end + 1])
    for c in candidates:
        try:
            parsed = json.loads(c.strip())
            if isinstance(parsed, dict):
                return parsed
        except json.JSONDecodeError:
            continue
    return None


def resolve_format(model: str | None, configured: str) -> str:
    if configured in ("anthropic", "openai"):
        return configured
    name = (model or "").lower()
    # GPT is the exception on 0G; Claude, GLM and DeepSeek all take the
    # anthropic shape.
    return "openai" if name.startswith(("gpt", "o1", "o3")) else "anthropic"


@dataclass
class LLMResult:
    parsed: dict[str, Any] | None
    detail: str
    # Verifiable provenance of this inference, surfaced in the decision trace.
    meta: dict[str, Any] = field(default_factory=dict)


class LLMClient:
    def __init__(self, settings: Settings, client: httpx.AsyncClient | None = None):
        self._s = settings
        self._http = client or httpx.AsyncClient(timeout=120.0)

    async def aclose(self) -> None:
        await self._http.aclose()

    @property
    def configured(self) -> bool:
        return bool(self._s.llm_base_url and self._s.llm_model)

    @property
    def api_format(self) -> str:
        return resolve_format(self._s.llm_model, self._s.llm_api_format)

    def describe(self) -> dict:
        return {
            "configured": self.configured,
            "base_url": self._s.llm_base_url or None,
            "model": self._s.llm_model or None,
            "provider": self._s.llm_provider,
            "api_format": self.api_format if self.configured else None,
            "trust_mode": self._s.llm_trust_mode or "standard",
        }

    def _headers(self, fmt: str) -> dict[str, str]:
        h = {"Content-Type": "application/json"}
        key = self._s.llm_api_key
        if fmt == "anthropic":
            h["x-api-key"] = key or ""
            h["anthropic-version"] = "2023-06-01"
        elif key:
            h["Authorization"] = f"Bearer {key}"
        if self._s.llm_trust_mode:
            h["X-0G-Provider-Trust-Mode"] = self._s.llm_trust_mode
        return h

    def _provenance(self, r: httpx.Response, body: dict) -> dict[str, Any]:
        """Who actually ran this inference, and what it cost."""
        trace = body.get("x_0g_trace") or {}
        billing = trace.get("billing") or {}
        return {
            "provider": r.headers.get("x-provider"),
            "request_id": r.headers.get("x-request-id"),
            "trace_id": r.headers.get("x-trace-id"),
            "model_served": body.get("model"),
            "cost_0g": billing.get("total_cost"),
            # Whether 0G returned a trace block - NOT whether the provider was
            # attested. Attestation only happens in LLM_TRUST_MODE=verified,
            # which is reported separately so the two are never conflated.
            "has_trace": bool(trace),
            "trust_mode": self._s.llm_trust_mode or "standard",
        }

    async def complete_json(
        self, system: str, user: str, *, max_tokens: int = 2000
    ) -> LLMResult:
        if not self.configured:
            return LLMResult(None, "LLM not configured (set LLM_BASE_URL and LLM_MODEL)")

        fmt = self.api_format
        base = self._s.llm_base_url.rstrip("/")
        try:
            if fmt == "anthropic":
                r = await self._http.post(
                    f"{base}/messages",
                    headers=self._headers(fmt),
                    json={
                        # No temperature: current Claude models reject it.
                        "model": self._s.llm_model,
                        "max_tokens": max_tokens,
                        "system": system,
                        "messages": [{"role": "user", "content": user}],
                    },
                )
            else:
                r = await self._http.post(
                    f"{base}/chat/completions",
                    headers=self._headers(fmt),
                    json={
                        "model": self._s.llm_model,
                        "max_tokens": max_tokens,
                        "temperature": 0.0,
                        "messages": [
                            {"role": "system", "content": system},
                            {"role": "user", "content": user},
                        ],
                    },
                )
        except Exception as exc:
            return LLMResult(None, f"{type(exc).__name__}: {str(exc)[:200]}")

        if r.status_code >= 400:
            return LLMResult(None, f"HTTP {r.status_code}: {r.text[:220]}")

        try:
            body = r.json()
            if fmt == "anthropic":
                # Reasoning models return thinking blocks too; keep only text.
                text = "\n".join(
                    b.get("text", "")
                    for b in body.get("content", [])
                    if b.get("type") == "text"
                )
            else:
                text = body["choices"][0]["message"]["content"]
        except Exception as exc:
            return LLMResult(None, f"unexpected response shape: {type(exc).__name__}")

        meta = self._provenance(r, body if isinstance(body, dict) else {})
        parsed = _extract_json(text)
        if parsed is None:
            return LLMResult(None, f"model did not return JSON: {text[:160]}", meta)
        return LLMResult(parsed, "ok", meta)
