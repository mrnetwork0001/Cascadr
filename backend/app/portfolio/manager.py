"""Position lifecycle.

Opening a position is the easy half. This module owns the rest: marking to the
live tape, deciding when a thesis is over, flattening it, and checking our book
against the exchange's.

Exit precedence is deliberate and ordered worst-first:

    1. STOP_LOSS    — the trade is wrong; capital preservation outranks patience
    2. TAKE_PROFIT  — the modelled move arrived; stop pressing
    3. TIME_STOP    — the validated window elapsed without payoff

A thesis with no exit is not a thesis. The default 120h hold is the same window
the event study in research/ actually measured.
"""

import uuid
from datetime import UTC, datetime

from app.market.bitget import BitgetClient, perp_symbol
from app.market.paper import PaperBroker
from app.risk import RiskDecision, RiskManager
from app.models import (
    CloseReason,
    ExitPolicy,
    Position,
    ReconcileReport,
)
from app.portfolio.store import PositionStore


class PortfolioManager:
    def __init__(
        self,
        store: PositionStore,
        bitget: BitgetClient,
        risk: RiskManager | None = None,
        paper: PaperBroker | None = None,
    ):
        self._store = store
        self._bitget = bitget
        self._risk = risk or RiskManager()
        self._paper = paper or PaperBroker()

    @property
    def risk(self) -> RiskManager:
        return self._risk

    async def book_pnl(self) -> tuple[float, float]:
        """(realized, unrealized) across the whole book."""
        rows = await self._store.all_positions(limit=1000)
        realized = sum(p.realized_pnl_usdt or 0.0 for p in rows if p.status == "CLOSED")
        open_rows = [p for p in rows if p.status == "OPEN"]
        unrealized = 0.0
        if open_rows:
            marks = await self._bitget.marks(
                [p.symbol.removesuffix("USDT") for p in open_rows]
            )
            for p in open_rows:
                m = marks.get(p.symbol.removesuffix("USDT"))
                if m:
                    unrealized += p.pnl_usdt(m)
        return realized, unrealized

    # ---------------------------------------------------------------- open

    async def open_short(
        self,
        *,
        ticker: str,
        notional_usdt: float,
        leverage: int,
        mark: float,
        thesis: str,
        origin: str,
        target_pct: float | None = None,
        policy: ExitPolicy | None = None,
    ) -> tuple[Position | None, str]:
        """Open, persist, and return (position, detail).

        Returns (None, reason) when the idempotency guard rejects a duplicate —
        a replayed signal must never double the risk.
        """
        symbol = perp_symbol(ticker)
        client_oid = f"cascadr-{origin}-{ticker}".lower()

        # --- portfolio risk, before anything reaches the venue -----------
        realized, unrealized = await self.book_pnl()
        decision: RiskDecision = self._risk.vet(
            cluster=origin,
            symbol=symbol,
            requested_notional=notional_usdt,
            open_positions=await self._store.open_positions(),
            realized_pnl=realized,
            unrealized_pnl=unrealized,
        )
        if not decision.allowed:
            return None, f"RISK: {decision.reason}"
        notional_usdt = decision.approved_notional_usdt
        risk_note = f"RISK: {decision.reason}. " if decision.scaled else ""

        pol = policy or ExitPolicy()
        if target_pct is not None:
            # The model's implied drawdown becomes the profit target.
            pol = pol.model_copy(update={"take_profit_pct": abs(target_pct)})

        position = Position(
            id=str(uuid.uuid4()),
            symbol=symbol,
            side="SHORT",
            size=round(notional_usdt / mark, 2),
            notional_usdt=notional_usdt,
            leverage=leverage,
            entry_price=mark,
            opened_at=datetime.now(UTC),
            thesis=thesis,
            origin=origin,
            client_oid=client_oid,
            paper=True,  # overwritten by the gate result below
            policy=pol,
        )

        from app.models import OrderIntent

        result = await self._bitget.place_order(
            OrderIntent(
                symbol=symbol,
                side="SHORT",
                notional_usdt=notional_usdt,
                leverage=leverage,
                reference_price=mark,
                size=f"{position.size:.2f}",
                client_oid=client_oid,
                thesis=thesis,
            )
        )
        if not result.accepted:
            return None, result.detail

        # In paper mode the venue response is unconditionally positive, so the
        # simulator supplies the friction: slippage, partials and rejects.
        if result.paper:
            fill = self._paper.fill(
                client_oid=client_oid, side="sell", size=position.size, mark=mark
            )
            if not fill.accepted:
                return None, f"{risk_note}{fill.detail}"
            position.entry_price = fill.avg_price
            position.size = fill.filled_size
            position.notional_usdt = round(fill.filled_size * fill.avg_price, 2)
            result.detail = f"{result.detail} {fill.detail}"

        position.paper = result.paper
        if not await self._store.add(position):
            return None, f"already holding risk for {client_oid}; no incremental order"
        return position, f"{risk_note}{result.detail}"

    # ---------------------------------------------------------------- exits

    @staticmethod
    def evaluate_exit(
        p: Position, mark: float, now: datetime | None = None
    ) -> CloseReason | None:
        """Pure decision function — no I/O, so it is directly testable."""
        move = p.pnl_pct(mark)  # positive = in our favour

        if -move >= p.policy.stop_loss_pct:
            return CloseReason.STOP_LOSS
        if p.policy.take_profit_pct is not None and move >= p.policy.take_profit_pct:
            return CloseReason.TAKE_PROFIT
        if p.age_hours(now) >= p.policy.max_hold_hours:
            return CloseReason.TIME_STOP
        return None

    async def sweep(self) -> list[dict]:
        """Mark every open position and close the ones whose thesis is done."""
        open_positions = await self._store.open_positions()
        if not open_positions:
            return []

        tickers = [p.symbol.removesuffix("USDT") for p in open_positions]
        marks = await self._bitget.marks(tickers)
        actions: list[dict] = []

        for p in open_positions:
            mark = marks.get(p.symbol.removesuffix("USDT"))
            if mark is None:
                # No price means no decision. Never close on a missing mark.
                actions.append({"id": p.id, "symbol": p.symbol, "action": "NO_MARK"})
                continue

            reason = self.evaluate_exit(p, mark)
            if reason is None:
                actions.append(
                    {
                        "id": p.id, "symbol": p.symbol, "action": "HOLD",
                        "mark": mark, "pnl_pct": round(p.pnl_pct(mark), 2),
                        "age_hours": round(p.age_hours(), 2),
                    }
                )
                continue

            detail = await self.close(p, mark, reason)
            actions.append(
                {
                    "id": p.id, "symbol": p.symbol, "action": reason.value,
                    "mark": mark, "pnl_usdt": round(p.pnl_usdt(mark), 2),
                    "detail": detail,
                }
            )
        return actions

    async def close(
        self, p: Position, mark: float, reason: CloseReason
    ) -> str:
        accepted, paper, detail, _ = await self._bitget.close_position(
            p.symbol, f"{p.size:.2f}", p.side
        )
        if not accepted:
            # A failed close must never be recorded as closed, or the book and
            # the exchange silently diverge.
            await self._store.note(p.id, "CLOSE_REJECTED", detail)
            return f"close REJECTED, position left OPEN — {detail}"

        exit_price = mark
        if paper:
            fill = self._paper.fill(
                client_oid=f"{p.client_oid}:close",
                side="buy" if p.side.upper() == "SHORT" else "sell",
                size=p.size,
                mark=mark,
                attempt=1,
            )
            if not fill.accepted:
                await self._store.note(p.id, "CLOSE_REJECTED", fill.detail)
                return f"close REJECTED, position left OPEN — {fill.detail}"

            exit_price = fill.avg_price

            if not fill.complete:
                # Partially flattened: shrink what remains and keep it open, so
                # the next sweep tries again on the true residual size.
                remaining = round(p.size - fill.filled_size, 4)
                await self._store.resize(
                    p.id, remaining, round(remaining * p.entry_price, 2)
                )
                await self._store.note(p.id, "PARTIAL_CLOSE", fill.detail)
                return (
                    f"PARTIAL close {fill.filled_size:.4f}/{p.size:.4f}; "
                    f"{remaining:.4f} still open — {fill.detail}"
                )
            detail = f"{detail} {fill.detail}"

        await self._store.mark_closed(p.id, exit_price, reason, p.pnl_usdt(exit_price))
        return detail

    async def close_by_id(self, pid: str, reason: CloseReason = CloseReason.MANUAL):
        p = await self._store.get(pid)
        if p is None:
            return None, "unknown position"
        if p.status != "OPEN":
            return p, "already closed"
        marks = await self._bitget.marks([p.symbol.removesuffix("USDT")])
        mark = marks.get(p.symbol.removesuffix("USDT"))
        if mark is None:
            return p, "no mark available; refusing to close blind"
        return p, await self.close(p, mark, reason)

    # -------------------------------------------------------- reconciliation

    async def reconcile(self) -> ReconcileReport:
        """Compare our book against the exchange's.

        Without credentials this reports `exchange_available=False` rather than
        an empty exchange — "cannot check" and "nothing open" look identical in
        the data and mean opposite things.
        """
        ours = await self._store.open_positions()
        rows, detail = await self._bitget.exchange_positions()

        if detail != "ok":
            return ReconcileReport(
                checked=len(ours), exchange_available=False, detail=detail,
                missing_on_exchange=[], untracked_on_exchange=[],
            )

        theirs = {
            r["symbol"]: float(r.get("total") or 0)
            for r in rows
            if float(r.get("total") or 0) != 0
        }
        our_symbols = {p.symbol: p for p in ours}

        in_sync, mismatch = [], []
        for sym, p in our_symbols.items():
            if sym not in theirs:
                continue
            if abs(theirs[sym] - p.size) / max(p.size, 1e-9) > 0.02:
                mismatch.append(
                    {"symbol": sym, "ours": p.size, "exchange": theirs[sym]}
                )
            else:
                in_sync.append(sym)

        return ReconcileReport(
            checked=len(ours),
            in_sync=in_sync,
            missing_on_exchange=sorted(set(our_symbols) - set(theirs)),
            untracked_on_exchange=sorted(set(theirs) - set(our_symbols)),
            size_mismatch=mismatch,
            exchange_available=True,
            detail="ok",
        )
