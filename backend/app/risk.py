"""Portfolio-level risk.

Per-position stops answer "is this trade wrong?". Nothing in them answers
"is the book too big?" — and for a contagion strategy that gap is dangerous in
a specific way:

    Five shorts opened from one TSMC outage are not five positions.
    They are one bet, wearing five tickers.

Every downstream name in a cascade shares the same root cause, so their returns
are near-perfectly correlated when the thesis is wrong. Sizing them as
independent is how a 2% loss becomes a 10% loss. The cluster limits below exist
for exactly that.

Every proposed open is vetted here BEFORE it reaches the exchange.
"""

from pydantic import BaseModel, Field

from app.models import Position


class RiskLimits(BaseModel):
    """Caps applied to every new position. Deliberately conservative."""

    starting_equity_usdt: float = Field(default=100_000.0, gt=0)

    # Total notional across the book, all clusters.
    max_gross_notional_usdt: float = Field(default=250_000.0, gt=0)

    # One shock is one bet, so the cluster cap is the one that actually binds.
    max_cluster_notional_usdt: float = Field(default=100_000.0, gt=0)
    max_positions_per_cluster: int = Field(default=3, gt=0)

    max_positions_total: int = Field(default=12, gt=0)

    # You cannot be "independently" short the same ticker twice. Two clusters
    # can both point at NVDA; that is one exposure, not two.
    max_positions_per_symbol: int = Field(default=1, gt=0)

    # Smallest position worth opening; below this we reject rather than scale.
    min_notional_usdt: float = Field(default=2_000.0, gt=0)

    # Drawdown (realized + unrealized) at which new risk stops entirely.
    max_drawdown_pct: float = Field(default=15.0, gt=0)


class RiskDecision(BaseModel):
    allowed: bool
    reason: str
    approved_notional_usdt: float = 0.0
    scaled: bool = False


class RiskManager:
    def __init__(self, limits: RiskLimits | None = None):
        self.limits = limits or RiskLimits()

    def drawdown_pct(self, realized: float, unrealized: float) -> float:
        """Current drawdown as a positive percent of starting equity."""
        pnl = realized + unrealized
        return max(0.0, -pnl / self.limits.starting_equity_usdt * 100.0)

    def vet(
        self,
        *,
        cluster: str,
        symbol: str = "",
        requested_notional: float,
        open_positions: list[Position],
        realized_pnl: float = 0.0,
        unrealized_pnl: float = 0.0,
    ) -> RiskDecision:
        L = self.limits

        # --- 1. drawdown kill switch, checked before anything else --------
        dd = self.drawdown_pct(realized_pnl, unrealized_pnl)
        if dd >= L.max_drawdown_pct:
            return RiskDecision(
                allowed=False,
                reason=(
                    f"HALTED: drawdown {dd:.1f}% >= {L.max_drawdown_pct:.1f}% "
                    "of starting equity — no new risk"
                ),
            )

        # --- 2. position counts -------------------------------------------
        if len(open_positions) >= L.max_positions_total:
            return RiskDecision(
                allowed=False,
                reason=f"book full: {len(open_positions)}/{L.max_positions_total} positions",
            )

        same_symbol = [p for p in open_positions if symbol and p.symbol == symbol]
        if len(same_symbol) >= L.max_positions_per_symbol:
            held = ", ".join(sorted({p.origin for p in same_symbol}))
            return RiskDecision(
                allowed=False,
                reason=(
                    f"already short {symbol} (cluster '{held}') — a second "
                    "cluster pointing at the same ticker is one exposure, not two"
                ),
            )

        in_cluster = [p for p in open_positions if p.origin == cluster]
        if len(in_cluster) >= L.max_positions_per_cluster:
            return RiskDecision(
                allowed=False,
                reason=(
                    f"cluster '{cluster}' full: {len(in_cluster)}/"
                    f"{L.max_positions_per_cluster} positions — these names share "
                    "one root cause and are not independent bets"
                ),
            )

        # --- 3. notional headroom, tightest constraint wins ---------------
        gross = sum(p.notional_usdt for p in open_positions)
        cluster_gross = sum(p.notional_usdt for p in in_cluster)

        gross_headroom = L.max_gross_notional_usdt - gross
        cluster_headroom = L.max_cluster_notional_usdt - cluster_gross
        headroom = min(gross_headroom, cluster_headroom)

        if headroom < L.min_notional_usdt:
            binding = "gross" if gross_headroom <= cluster_headroom else f"cluster '{cluster}'"
            return RiskDecision(
                allowed=False,
                reason=f"{binding} notional limit reached (headroom {headroom:,.0f} USDT)",
            )

        if requested_notional > headroom:
            return RiskDecision(
                allowed=True,
                approved_notional_usdt=round(headroom, 2),
                scaled=True,
                reason=(
                    f"scaled {requested_notional:,.0f} -> {headroom:,.0f} USDT to fit "
                    f"{'gross' if gross_headroom <= cluster_headroom else 'cluster'} limit"
                ),
            )

        return RiskDecision(
            allowed=True, approved_notional_usdt=requested_notional, reason="within limits"
        )

    def snapshot(
        self, open_positions: list[Position], realized: float, unrealized: float
    ) -> dict:
        L = self.limits
        gross = sum(p.notional_usdt for p in open_positions)
        clusters: dict[str, dict] = {}
        for p in open_positions:
            c = clusters.setdefault(p.origin, {"positions": 0, "notional": 0.0})
            c["positions"] += 1
            c["notional"] += p.notional_usdt

        dd = self.drawdown_pct(realized, unrealized)
        return {
            "limits": L.model_dump(),
            "gross_notional_usdt": round(gross, 2),
            "gross_utilisation_pct": round(gross / L.max_gross_notional_usdt * 100, 1),
            "positions": len(open_positions),
            "clusters": {
                k: {
                    **v,
                    "notional": round(v["notional"], 2),
                    "utilisation_pct": round(
                        v["notional"] / L.max_cluster_notional_usdt * 100, 1
                    ),
                }
                for k, v in clusters.items()
            },
            "realized_usdt": round(realized, 2),
            "unrealized_usdt": round(unrealized, 2),
            "drawdown_pct": round(dd, 2),
            "halted": dd >= L.max_drawdown_pct,
        }
