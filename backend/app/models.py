"""Domain model shared by the API, the graph store and the execution layer.

Mirrors lib/types.ts on the frontend. When you change a field here, change it
there - the SSE payloads are consumed directly by the terminal.
"""

from datetime import UTC, datetime
from enum import StrEnum

from pydantic import BaseModel, Field


class Tier(StrEnum):
    MATERIAL = "MATERIAL"
    SUPPLIER = "SUPPLIER"
    MANUFACTURER = "MANUFACTURER"
    LOGISTICS = "LOGISTICS"
    BRAND = "BRAND"


class Contagion(StrEnum):
    NOMINAL = "NOMINAL"
    WATCH = "WATCH"
    STRESSED = "STRESSED"
    CRITICAL = "CRITICAL"


class Provenance(StrEnum):
    """Where an edge weight came from. This is not decoration.

    A dependency the filer actually disclosed is worth far more than one a
    model guessed, and the UI must be able to tell them apart - otherwise the
    graph launders estimates into facts.
    """

    DISCLOSED = "DISCLOSED"  # stated in a company filing or official statement
    REPORTED = "REPORTED"  # a specific share reported by a reputable outlet/analyst
    INFERRED = "INFERRED"  # derived from customs / shipment records
    # Relationship is sourced but only described in words ("sole supplier",
    # "primary supplier"); the number comes from one fixed, published mapping.
    QUALITATIVE = "QUALITATIVE"
    # Legacy: hand-curated, no source. The shipped graph contains none.
    ESTIMATED = "ESTIMATED"


class Source(BaseModel):
    """One citation behind a number. The quote must appear on the page."""

    url: str
    publisher: str = ""
    date: str = ""
    quote: str = ""


class GraphNode(BaseModel):
    id: str
    name: str
    tier: Tier
    country: str
    revenue_b: float = Field(description="Annual revenue, USD billions.")
    # Where revenue_b came from, so node size is traceable like everything else.
    revenue_period: str | None = None  # e.g. "FY ending 2025-12-31"
    revenue_source: str | None = None  # e.g. "Yahoo Finance income statement (2330.TW)"
    revenue_note: str | None = None  # currency conversion used, if any
    # Underlying equity ticker. The Bitget stock-perp symbol is f"{ticker}USDT".
    # Tokenized xStocks (AAPLx, NVDAx) are SPOT ONLY and cannot be shorted, so
    # they are deliberately not used here.
    ticker: str | None = None


class GraphEdge(BaseModel):
    source: str
    target: str
    relation: str
    component: str
    dependency: float = Field(ge=0.0, le=1.0)
    provenance: Provenance = Provenance.ESTIMATED
    citation: str | None = None
    # How the figure follows from the sources, the period it describes, and
    # the evidence itself. Every shipped edge carries at least one source.
    basis: str = ""
    as_of: str = ""
    confidence: str = ""
    sources: list[Source] = Field(default_factory=list)
    # What the number is, in a few words, for a share taken from a source
    # (a forecast, a range midpoint, a disclosed share). Empty for rule weights.
    weight_note: str = ""
    # Caveats on the figure, and any sources that point the other way.
    notes: str = ""
    counter_evidence: list[Source] = Field(default_factory=list)


class PathLink(BaseModel):
    """One edge a score was multiplied through, as it stood at the time."""

    source: str
    target: str
    component: str
    dependency: float
    provenance: Provenance
    weight_note: str = ""


class ExposurePath(BaseModel):
    target: str
    hops: list[str]
    score: float
    rationale: str
    weakest_provenance: Provenance = Provenance.ESTIMATED
    links: list[PathLink] = Field(default_factory=list)


class OrderIntent(BaseModel):
    """What the agent wants to do, before anything is sent anywhere."""

    symbol: str
    side: str
    notional_usdt: float
    leverage: int
    reference_price: float
    size: str
    client_oid: str
    thesis: str


class OrderResult(BaseModel):
    intent: OrderIntent
    accepted: bool
    paper: bool
    detail: str
    order_id: str | None = None
    request_body: dict | None = None


# ---------------------------------------------------------------------------
# Position lifecycle
# ---------------------------------------------------------------------------


class PositionStatus(StrEnum):
    OPEN = "OPEN"
    CLOSED = "CLOSED"


class CloseReason(StrEnum):
    TIME_STOP = "TIME_STOP"  # thesis had its window and did not pay
    STOP_LOSS = "STOP_LOSS"  # moved against us past the tolerance
    TAKE_PROFIT = "TAKE_PROFIT"  # reached the modelled drawdown
    MANUAL = "MANUAL"
    RECONCILED = "RECONCILED"  # exchange says it is gone; our book was stale


class ExitPolicy(BaseModel):
    """When to give up on a thesis.

    `max_hold_hours` defaults to 168h. The event study in research/ measured
    drift over 5 US *trading* days after an event; a trading week spans 7
    calendar days, and perps trade around the clock, so the validated window is
    168 wall-clock hours. (It was 120h, which quietly cut the tested window by
    ~29%.) Holding longer than the horizon you validated is not a strategy.
    """

    max_hold_hours: float = Field(default=168.0, gt=0)
    # Adverse move in the underlying, percent. At 2-3x this is 12-18% of margin.
    stop_loss_pct: float = Field(default=6.0, gt=0)
    # Favourable move at which to cover. Usually the model's implied drawdown.
    take_profit_pct: float | None = None


class Position(BaseModel):
    id: str
    symbol: str
    side: str
    size: float
    notional_usdt: float
    leverage: int
    entry_price: float
    opened_at: datetime
    thesis: str = ""
    origin: str = ""
    client_oid: str = ""
    paper: bool = True
    # Who opened it: "agent" (the autonomous loop acting on a real headline)
    # or "manual" (an operator calling /execute or /oracle/act).
    source: str = "unknown"  # "agent", "manual", or unknown for legacy rows
    # Paper closes that were rejected or partially filled so far. Feeds the
    # simulator's seed so a retry is a new draw, not a replay of the failure.
    close_attempts: int = 0
    # Size and notional as opened. Partial closes shrink size/notional; these
    # keep the whole trade checkable once it is closed.
    original_size: float | None = None
    original_notional_usdt: float | None = None
    # Where the paper fill happened: Bitget's demo exchange, or Cascadr's own
    # simulator. Fees are Bitget's, as reported on the fills.
    venue: str = "cascadr-sim"
    fees_usdt: float = 0.0

    status: PositionStatus = PositionStatus.OPEN
    policy: ExitPolicy = Field(default_factory=ExitPolicy)

    closed_at: datetime | None = None
    exit_price: float | None = None
    close_reason: CloseReason | None = None
    realized_pnl_usdt: float | None = None

    # ---- derived -------------------------------------------------------

    def pnl_pct(self, mark: float) -> float:
        """Move in our favour, percent of the underlying. Short: down is good."""
        if self.entry_price <= 0:
            return 0.0
        direction = 1.0 if self.side.upper() == "SHORT" else -1.0
        return direction * (self.entry_price - mark) / self.entry_price * 100.0

    def pnl_usdt(self, mark: float) -> float:
        """Dollar P&L. `notional_usdt` is already the full position value
        (size x entry), so leverage must NOT be applied again - leverage changes
        the margin posted, not the P&L on the position. Multiplying by it
        overstated every P&L, the equity curve, drawdown and Sharpe by 2-3x."""
        return self.notional_usdt * (self.pnl_pct(mark) / 100.0)

    def roe_pct(self, mark: float) -> float:
        """Return on the margin posted (notional / leverage), percent. This is
        where leverage belongs."""
        return self.pnl_pct(mark) * self.leverage

    def age_hours(self, now: datetime | None = None) -> float:
        now = now or datetime.now(UTC)
        opened = self.opened_at
        if opened.tzinfo is None:
            opened = opened.replace(tzinfo=UTC)
        return (now - opened).total_seconds() / 3600.0


class ReconcileReport(BaseModel):
    """Difference between our book and the exchange's."""

    checked: int
    in_sync: list[str] = []
    missing_on_exchange: list[str] = []  # we think open, exchange does not
    untracked_on_exchange: list[str] = []  # exchange holds, we never recorded
    size_mismatch: list[dict] = []
    exchange_available: bool = True
    detail: str = ""
