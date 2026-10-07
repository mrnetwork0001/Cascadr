"""The trading decision - where the LLM decides what to trade, and when to stop.

The oracle (app/ingest/oracle.py) judges whether a headline is a disruption
and how severe. The sourced graph turns that judgement into candidate shorts:
the directly hit company and its downstream customers, each with the evidence
path behind it. This module puts those candidates, with live prices and the
current book, in front of the LLM, which decides per candidate whether to
short it now, with what conviction, what profit target and how long to hold.
Later the same model reviews each open position and decides whether its
thesis still holds.

Fixed rules are guardrails around that decision, not the decision itself:
the LLM can only choose among candidates the sourced graph supports, its
numbers are clamped to bounds, size is set by its conviction and then capped
by the risk engine, and every position keeps a hard stop-loss and time stop.
If the model cannot be reached, nothing is traded: there is no rule-based
fallback that would trade on its behalf.
"""

from __future__ import annotations

from datetime import UTC, datetime

from pydantic import BaseModel, Field

from app.llm.client import LLMClient

# Bounds on what the LLM may choose. 168 h is the drift window the event study
# validated (research/README.md); holding longer is untested.
MIN_HOLD_HOURS = 24.0
MAX_HOLD_HOURS = 168.0
MIN_TAKE_PROFIT_PCT = 1.0
MAX_TAKE_PROFIT_PCT = 10.0
STOP_LOSS_PCT = 6.0  # hard stop on every position; not the LLM's to change
# Account share at conviction 0 and 1, before the risk engine's caps.
MIN_SIZE_SHARE = 0.10
MAX_SIZE_SHARE = 0.50
# Open positions are reviewed at most this often, and not before this age.
REVIEW_EVERY_HOURS = 4.0

DECIDE_SYSTEM = """You are the portfolio manager of Cascadr, an autonomous \
event-driven agent that shorts US stock perpetuals on Bitget when a disruption \
hits a company or the suppliers it depends on. You make the trading decision.

You receive a news headline, your own earlier reading of it (which company it \
directly hits, how severe), the candidate shorts the sourced supply-chain graph \
derives from it (the directly hit company and/or its downstream customers, each \
with its evidence path, contagion score and the move the graph model implies), \
live prices with their 24h moves, and the current book.

For EACH candidate decide:
- short: true to open a short now, false to pass.
- conviction: 0..1, how confident you are the price falls over the hold. It \
sets position size (10% to 50% of the account, before risk limits).
- take_profit_pct: favourable move, as a positive percent between 1 and 10, at \
which to cover.
- hold_hours: 24 to 168. How long the thesis needs to play out; the position is \
closed at this age if neither the target nor the stop is hit.
- reason: one or two sentences a reviewer can check against the inputs.

Trade like a disciplined event-driven desk:
- Pass when the news is routine, positive, speculative or not specific to the \
company; when the price has already moved hard in the trade's direction; or \
when the evidence path is weak relative to the shock.
- Short when the headline is a confirmed negative for the company's output or \
earnings that the market has plausibly not fully priced, or when a downstream \
company depends heavily on a disrupted supplier.
- Shorter holds suit one-off news markets digest in a day or two; longer holds \
suit operational disruptions that take weeks to resolve.
- Passing on every candidate is a valid, often correct, decision.

Every position also has a hard 6% stop-loss and portfolio risk limits that you \
cannot override.

Return ONLY a JSON object, with exactly one call per candidate symbol:
{"summary": "one sentence on the overall call",
 "calls": [{"symbol": "AAPLUSDT", "short": true, "conviction": 0.6,
            "take_profit_pct": 3.0, "hold_hours": 72, "reason": "..."}]}"""

REVIEW_SYSTEM = """You are the portfolio manager of Cascadr, an autonomous \
event-driven agent that shorts US stock perpetuals on Bitget. You opened the \
short position below on a news thesis. Decide whether to keep it.

- HOLD if the thesis still holds and its move has not played out.
- CLOSE if the thesis is invalidated (the disruption was resolved, denied or \
outweighed by newer news), if most of the expected move has already happened, \
or if the remaining reward no longer justifies the risk.

The position already has a hard stop-loss, a take-profit and a time stop; you \
do not need to close it just because it is slightly negative or young.

Return ONLY a JSON object: {"action": "HOLD" or "CLOSE", "reason": "one or two \
sentences a reviewer can check against the inputs"}"""


def _clamp(v, lo: float, hi: float, default: float) -> float:
    try:
        return max(lo, min(hi, float(v)))
    except (TypeError, ValueError):
        return default


class TradeCall(BaseModel):
    symbol: str
    short: bool = False
    conviction: float = 0.0
    take_profit_pct: float = 3.0
    hold_hours: float = MAX_HOLD_HOURS
    reason: str = ""


class TradePlan(BaseModel):
    # "llm": the model decided; "none": nothing to decide, no call was made;
    # "unavailable": the model could not be reached, so nothing may trade.
    engine: str
    model: str | None = None
    summary: str = ""
    calls: list[TradeCall] = Field(default_factory=list)
    # Candidates the graph proposed that never reached the model, and why:
    # symbol -> [kind, reason], e.g. not listed on the venue.
    excluded: dict[str, list[str]] = Field(default_factory=dict)
    detail: str = ""
    provenance: dict = Field(default_factory=dict)

    @property
    def offered(self) -> set[str]:
        return {c.symbol for c in self.calls}

    def call_for(self, symbol: str) -> TradeCall | None:
        return next((c for c in self.calls if c.symbol == symbol), None)


class Review(BaseModel):
    action: str  # HOLD | CLOSE | UNAVAILABLE
    reason: str = ""
    model: str | None = None
    provenance: dict = Field(default_factory=dict)


def notional_for(conviction: float, equity: float) -> float:
    """Position size from the LLM's conviction, rounded to 50 USDT."""
    share = MIN_SIZE_SHARE + (MAX_SIZE_SHARE - MIN_SIZE_SHARE) * conviction
    return round(equity * share / 50) * 50


def leverage_for(conviction: float) -> int:
    return 3 if conviction >= 0.75 else 2


def _pct(v: float | None) -> str:
    return "unknown" if v is None else f"{v:+.2f}%"


def _hours_since(ts: str | datetime | None) -> float | None:
    if not ts:
        return None
    t = datetime.fromisoformat(ts) if isinstance(ts, str) else ts
    if t.tzinfo is None:
        t = t.replace(tzinfo=UTC)
    return (datetime.now(UTC) - t).total_seconds() / 3600


def describe_candidate(i: int, c: dict) -> str:
    """One candidate as the model sees it. `c` holds the recorded exposure
    plus symbol, mark and change_24h_pct."""
    e = c["exposure"]
    if e.get("is_origin"):
        role = "directly hit by the headline"
    else:
        links = "; ".join(
            f"{l['source']}->{l['target']} ({l.get('component', '?')}, {l.get('provenance', '?')}, "
            f"dependency {l.get('dependency', 0):.2f})"
            for l in e.get("links", [])
        )
        role = f"downstream via {' -> '.join(e.get('hops', []))} ({links})"
    return (
        f"{i}. {c['symbol']} - {e.get('name', e['target'])}, {role}. "
        f"Contagion score {e['score']:.2f} ({e.get('contagion', '?')}); "
        f"graph-implied move {e.get('implied_drawdown_pct', 0):+.2f}%. "
        f"Price {c['mark']:,.2f}, 24h change {_pct(c.get('change_24h_pct'))}."
    )


def describe_book(book: dict) -> str:
    rows = book.get("open", [])
    held = "; ".join(
        f"{p['symbol']} short (origin {p['origin']}, P&L {_pct(p.get('pnl_pct'))})" for p in rows
    ) or "none"
    return (
        f"Equity about {book.get('equity', 0):,.0f} USDT. Open positions: {held}. "
        f"At most {book.get('max_per_cluster', '?')} positions per root cause."
    )


class LLMTrader:
    def __init__(self, llm: LLMClient):
        self._llm = llm

    def _model(self) -> str | None:
        return self._llm.describe().get("model")

    async def decide(
        self, *, headline: str, source: str, published: str | None, verdict,
        candidates: list[dict], book: dict,
    ) -> TradePlan:
        age = _hours_since(published)
        user = "\n".join([
            f"Headline: {headline}",
            f"Source: {source or 'unknown'}; published "
            + (f"{age:.1f} h ago" if age is not None else "at an unknown time"),
            "",
            f"Your reading: directly hits {', '.join(verdict.entities) or 'nothing'}; "
            f"shock {verdict.shock:.2f} ({verdict.severity}), confidence {verdict.confidence:.2f}. "
            f"{verdict.reasoning}",
            "",
            "Candidate shorts:",
            *(describe_candidate(i + 1, c) for i, c in enumerate(candidates)),
            "",
            "Book: " + describe_book(book),
        ])
        result = await self._llm.complete_json(DECIDE_SYSTEM, user)
        if result.parsed is None:
            return TradePlan(engine="unavailable", detail=result.detail, provenance=result.meta)

        offered = {c["symbol"] for c in candidates}
        raw = {
            str(r.get("symbol", "")).upper(): r
            for r in result.parsed.get("calls", []) or []
            if isinstance(r, dict)
        }
        calls = []
        for sym in [c["symbol"] for c in candidates]:
            r = raw.get(sym)
            if r is None:
                # The model skipped a candidate: that is a pass, never a trade.
                calls.append(TradeCall(symbol=sym, reason="no call returned for this candidate"))
                continue
            calls.append(TradeCall(
                symbol=sym,
                short=r.get("short") is True,
                conviction=_clamp(r.get("conviction"), 0.0, 1.0, 0.0),
                take_profit_pct=_clamp(
                    r.get("take_profit_pct"), MIN_TAKE_PROFIT_PCT, MAX_TAKE_PROFIT_PCT, 3.0),
                hold_hours=_clamp(r.get("hold_hours"), MIN_HOLD_HOURS, MAX_HOLD_HOURS, MAX_HOLD_HOURS),
                reason=str(r.get("reason", ""))[:400],
            ))
        unknown = sorted(set(raw) - offered)
        return TradePlan(
            engine="llm",
            model=self._model(),
            summary=str(result.parsed.get("summary", ""))[:400],
            calls=calls,
            detail="ok" if not unknown else f"ignored calls on symbols not offered: {unknown}",
            provenance=result.meta,
        )

    async def review(self, *, position, mark: float, news: list[dict]) -> Review:
        move = position.pnl_pct(mark)
        pol = position.policy
        tp = pol.take_profit_pct
        lines = [
            f"Position: SHORT {position.symbol}, opened {position.age_hours():.1f} h ago "
            f"at {position.entry_price:,.2f}; now {mark:,.2f} "
            f"({move:+.2f}% in the trade's favour).",
            f"Thesis: {position.thesis[:400]}",
            f"Exits: take-profit {'at ' + format(tp, '.2f') + '% favourable' if tp else 'none'}, "
            f"stop-loss at {pol.stop_loss_pct:.1f}% adverse, time stop at {pol.max_hold_hours:.0f} h.",
            "",
            "News about this company since the position opened (your earlier readings):",
        ]
        if news:
            lines += [
                f"- {n['at'][:16]} shock {n.get('shock', 0):.2f}: {n['headline'][:160]}"
                f" - {str(n.get('reasoning', ''))[:160]}"
                for n in news
            ]
        else:
            lines.append("- none")
        result = await self._llm.complete_json(REVIEW_SYSTEM, "\n".join(lines), max_tokens=800)
        if result.parsed is None:
            return Review(action="UNAVAILABLE", reason=result.detail, provenance=result.meta)
        action = str(result.parsed.get("action", "")).upper()
        return Review(
            # Anything but an explicit CLOSE keeps the position.
            action="CLOSE" if action == "CLOSE" else "HOLD",
            reason=str(result.parsed.get("reason", ""))[:400],
            model=self._model(),
            provenance=result.meta,
        )
