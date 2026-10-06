"""The News Oracle - where the LLM actually makes a decision.

Given a raw headline, the model must do three things a lookup table cannot:

  1. resolve messy real-world language to graph entities ("Hon Hai", "鴻海",
     "the Zhengzhou plant" all mean FOXCONN);
  2. judge *severity* - "evacuated as a precaution" and "fab offline for
     weeks" name the same company and mean very different things;
  3. say what it is uncertain about, so the risk layer can size accordingly.

Output 3 is what makes this an agent rather than a classifier: the shock
magnitude it returns is multiplied through the graph and becomes position
size. The model is not decorating a decision someone else made.

If no LLM is configured the oracle degrades to keyword matching and labels
itself `heuristic`, so a reader of the trace can always tell which one ran.
"""

import re

from pydantic import BaseModel, Field

from app.llm.client import LLMClient
from app.models import GraphNode

SYSTEM = """You are the news oracle for a supply-chain contagion trading system.

You are given a headline and a list of companies in a supply-chain knowledge \
graph. Decide which graph entities the headline directly disrupts, and how \
severe the disruption is.

Return ONLY a JSON object:
{
  "entities": ["GRAPH_ID", ...],     // ids from the provided list; [] if none
  "shock": 0.0,                       // 0..1 severity of the DIRECT disruption
  "severity": "LOW|MEDIUM|HIGH|SEVERE",
  "confidence": 0.0,                  // 0..1 in your entity resolution
  "reasoning": "one sentence",
  "uncertainty": "what would change your estimate"
}

Calibrating shock - this drives real position size, so be conservative:
  0.0-0.2  rumour, routine news, already-priced, or precautionary action
  0.2-0.5  confirmed disruption, limited or short duration
  0.5-0.8  confirmed material disruption, days to weeks of lost output
  0.8-1.0  severe: extended outage, guidance withdrawn, structural damage

Rules:
- Only list ids that appear in the provided graph list. Never invent ids.
- Only the DIRECTLY disrupted company. Downstream effects are computed by the
  graph, not by you - do not list customers or suppliers.
- If the headline names no company in the graph, return "entities": [].
- A headline that is positive or neutral for the company gets a low shock."""


class OracleVerdict(BaseModel):
    entities: list[str] = Field(default_factory=list)
    shock: float = 0.0
    severity: str = "LOW"
    confidence: float = 0.0
    reasoning: str = ""
    uncertainty: str = ""
    # "llm" or "heuristic" - always visible in the decision trace.
    engine: str = "heuristic"
    model: str | None = None
    detail: str = ""
    # Which 0G provider executed this inference, its trace id and cost.
    # A trading decision you cannot attribute is a trading decision you
    # cannot audit.
    provenance: dict = Field(default_factory=dict)


def _clamp(v, lo=0.0, hi=1.0) -> float:
    try:
        return max(lo, min(hi, float(v)))
    except (TypeError, ValueError):
        return lo


class NewsOracle:
    def __init__(self, llm: LLMClient):
        self._llm = llm

    @property
    def llm_configured(self) -> bool:
        return bool(self._llm.describe().get("configured"))

    async def analyse(self, headline: str, nodes: list[GraphNode]) -> OracleVerdict:
        catalogue = "\n".join(
            f"- {n.id}: {n.name} ({n.tier}, {n.country})" for n in nodes
        )
        user = f"Graph entities:\n{catalogue}\n\nHeadline:\n{headline}"

        result = await self._llm.complete_json(SYSTEM, user)
        parsed, detail = result.parsed, result.detail
        if parsed is None:
            v = self._heuristic(headline, nodes)
            v.detail = f"LLM unavailable, used keyword fallback - {detail}"
            v.provenance = result.meta
            return v

        known = {n.id for n in nodes}
        # The model is instructed not to invent ids; verify rather than trust.
        entities = [e for e in parsed.get("entities", []) if e in known]
        dropped = [e for e in parsed.get("entities", []) if e not in known]

        v = OracleVerdict(
            entities=entities,
            shock=_clamp(parsed.get("shock", 0.0)),
            severity=str(parsed.get("severity", "LOW")).upper(),
            confidence=_clamp(parsed.get("confidence", 0.0)),
            reasoning=str(parsed.get("reasoning", ""))[:400],
            uncertainty=str(parsed.get("uncertainty", ""))[:400],
            engine="llm",
            model=self._llm.describe()["model"],
            detail="ok" if not dropped else f"dropped unknown ids: {dropped}",
            provenance=result.meta,
        )
        # No resolvable entity means no trade, whatever the model scored.
        if not v.entities:
            v.shock = 0.0
        return v

    @staticmethod
    def _heuristic(headline: str, nodes: list[GraphNode]) -> OracleVerdict:
        """Deterministic fallback. Deliberately timid: it cannot read severity,
        so it never returns a shock large enough to open a big position."""
        text = headline.lower()
        hits = [
            n.id
            for n in nodes
            if re.search(rf"\b{re.escape(n.name.split()[0].lower())}\b", text)
            or n.id.replace("_", " ").lower() in text
        ]
        severe = any(
            w in text
            for w in ("fire", "earthquake", "quake", "halt", "offline", "shutdown", "strike")
        )
        return OracleVerdict(
            entities=hits[:2],
            shock=0.45 if (hits and severe) else (0.2 if hits else 0.0),
            severity="MEDIUM" if severe else "LOW",
            confidence=0.4 if hits else 0.0,
            reasoning="Keyword match only - no severity judgement available.",
            uncertainty="No LLM configured; magnitude is a fixed guess, not a reading.",
            engine="heuristic",
        )
