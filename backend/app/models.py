"""Domain model shared by the API, the graph store and the execution layer.

Mirrors lib/types.ts on the frontend. When you change a field here, change it
there — the SSE payloads are consumed directly by the terminal.
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
    model guessed, and the UI must be able to tell them apart — otherwise the
    graph launders estimates into facts.
    """

    DISCLOSED = "DISCLOSED"  # stated in a filing; carries a citation
    INFERRED = "INFERRED"  # derived from customs / shipment records
    ESTIMATED = "ESTIMATED"  # analyst consensus or hand-curated


class GraphNode(BaseModel):
    id: str
    name: str
    tier: Tier
    country: str
    revenue_b: float = Field(description="Annual revenue, USD billions.")
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


class ExposurePath(BaseModel):
    target: str
    hops: list[str]
    score: float
    rationale: str
    weakest_provenance: Provenance = Provenance.ESTIMATED


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

    `max_hold_hours` defaults to 120h. That is the 5-day window the event study
    in research/ actually measured — holding longer than the horizon you
    validated is not a strategy, it is hope. Note the unit mismatch: the study
    counted *trading* days while perps trade 24/7, so 120h is slightly shorter
    than the tested window in wall-clock terms. Deliberately conservative.
    """

    max_hold_hours: float = Field(default=120.0, gt=0)
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
        return self.notional_usdt * (self.pnl_pct(mark) / 100.0) * self.leverage

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
