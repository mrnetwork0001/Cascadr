"""Position lifecycle.

Opening a position is the easy half. This module owns the rest: marking to the
live tape, deciding when a thesis is over, flattening it, and checking our book
against the exchange's.

Exit precedence is deliberate and ordered worst-first:

    1. STOP_LOSS    — the trade is wrong; capital preservation outranks patience
    2. TAKE_PROFIT  — the modelled move arrived; stop pressing
    3. TIME_STOP    — the validated window elapsed without payoff

A thesis with no exit is not a thesis. The default 168h hold is the window the
event study in research/ actually measured (5 US trading days = 7 calendar days).
"""

import asyncio
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
        # One close at a time per position: the sweeper and an operator close
        # must not both flatten the same units.
        self._close_locks: dict[str, asyncio.Lock] = {}
        # One open at a time: the risk check, the order and the insert are one
        # step, so two opens cannot both pass the caps on the same snapshot or
        # both send an order for one thesis.
        self._open_lock = asyncio.Lock()

    @property
    def risk(self) -> RiskManager:
        return self._risk

    async def realized_pnl(self) -> float:
        """Realized P&L alone - needs no market data."""
        rows = await self._store.all_positions(limit=5000)
        return sum(p.realized_pnl_usdt or 0.0 for p in rows)

    async def book_pnl(self) -> tuple[float, float | None]:
        """(realized, unrealized) across the whole book.

        Realized includes slices booked by partial closes on positions that are
        still open, not just fully closed ones. Unrealized is None when any
        open position has no live mark: a partial sum would understate the
        book while looking complete. Raises if Bitget cannot be reached."""
        rows = await self._store.all_positions(limit=5000)
        realized = sum(p.realized_pnl_usdt or 0.0 for p in rows)
        open_rows = [p for p in rows if p.status == "OPEN"]
        unrealized = 0.0
        if open_rows:
            marks = await self._bitget.marks(
                [p.symbol.removesuffix("USDT") for p in open_rows]
            )
            for p in open_rows:
                m = marks.get(p.symbol.removesuffix("USDT"))
                if not m:
                    return realized, None
                unrealized += p.pnl_usdt(m)
        return realized, unrealized

    async def book_pnl_for_risk(self) -> tuple[float, float, list[str]]:
        """(realized, unrealized, unpriced symbols) for risk decisions only.

        A position with no live mark is valued at its stop-loss - the worst
        loss its own exit rules allow - so one suspended contract cannot
        freeze the book, and the drawdown check errs towards halting. Never
        used for reported equity, which stays unknown instead. Raises if
        Bitget cannot be reached."""
        rows = await self._store.all_positions(limit=5000)
        realized = sum(p.realized_pnl_usdt or 0.0 for p in rows)
        open_rows = [p for p in rows if p.status == "OPEN"]
        unrealized, unpriced = 0.0, []
        if open_rows:
            marks = await self._bitget.marks(
                [p.symbol.removesuffix("USDT") for p in open_rows]
            )
            for p in open_rows:
                m = marks.get(p.symbol.removesuffix("USDT"))
                if m:
                    unrealized += p.pnl_usdt(m)
                else:
                    unpriced.append(p.symbol)
                    unrealized -= p.notional_usdt * p.policy.stop_loss_pct / 100.0
        return realized, unrealized, unpriced

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
        source: str = "agent",
    ) -> tuple[Position | None, str, str]:
        """Open, persist, and return (position, detail, skip_kind).

        When nothing opens, position is None and skip_kind says why:
        "risk" (the risk engine refused), "venue" (the exchange or the paper
        simulator rejected the order) or "duplicate" (this thesis is already
        open - a replayed signal must never double the risk), or "no_mark"
        (the book cannot be priced, so the drawdown check cannot run).

        `origin` is the root cause the contagion runs from; it is the risk
        cluster and part of the thesis key.
        """
        async with self._open_lock:
            return await self._open_short(
                ticker=ticker, notional_usdt=notional_usdt, leverage=leverage, mark=mark,
                thesis=thesis, origin=origin, target_pct=target_pct,
                policy=policy, source=source,
            )

    async def _open_short(
        self,
        *,
        ticker: str,
        notional_usdt: float,
        leverage: int,
        mark: float,
        thesis: str,
        origin: str,
        target_pct: float | None,
        policy: ExitPolicy | None,
        source: str,
    ) -> tuple[Position | None, str, str]:
        symbol = perp_symbol(ticker)
        # The thesis key: at most one OPEN position per origin -> ticker.
        client_oid = f"cascadr-{origin}-{ticker}".lower()
        position_id = str(uuid.uuid4())
        # Each order needs its own id at the venue (Bitget rejects a reused
        # clientOid, and a thesis can be re-entered after it closes).
        order_oid = f"{client_oid}-{position_id[:8]}"

        # --- the same thesis already open: nothing to do -----------------
        if any(p.client_oid == client_oid for p in await self._store.open_positions()):
            return (
                None,
                f"DUPLICATE: already holding risk for {client_oid}; no incremental order",
                "duplicate",
            )

        # --- portfolio risk, before anything reaches the venue -----------
        try:
            realized, unrealized, unpriced = await self.book_pnl_for_risk()
        except Exception as exc:
            return None, f"NO MARK: cannot price the open book ({type(exc).__name__})", "no_mark"
        decision: RiskDecision = self._risk.vet(
            cluster=origin,
            symbol=symbol,
            requested_notional=notional_usdt,
            open_positions=await self._store.open_positions(),
            realized_pnl=realized,
            unrealized_pnl=unrealized,
        )
        if not decision.allowed:
            return None, f"RISK: {decision.reason}", "risk"
        notional_usdt = decision.approved_notional_usdt
        risk_note = f"RISK: {decision.reason}. " if decision.scaled else ""
        if unpriced:
            risk_note += f"Unpriced {', '.join(unpriced)} valued at stop-loss for the drawdown check. "

        pol = policy or ExitPolicy()
        if target_pct is not None:
            # The model's implied drawdown becomes the profit target.
            pol = pol.model_copy(update={"take_profit_pct": abs(target_pct)})

        position = Position(
            id=position_id,
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
            source=source,
        )

        from app.models import OrderIntent

        try:
            result = await self._bitget.place_order(
                OrderIntent(
                    symbol=symbol,
                    side="SHORT",
                    notional_usdt=notional_usdt,
                    leverage=leverage,
                    reference_price=mark,
                    size=f"{position.size:.2f}",
                    client_oid=order_oid,
                    thesis=thesis,
                )
            )
        except Exception as exc:
            return None, f"VENUE: order failed ({type(exc).__name__}: {exc})"[:300], "venue"
        if not result.accepted:
            return None, f"VENUE: {result.detail}", "venue"

        # In paper mode the venue response is unconditionally positive, so the
        # simulator supplies the friction: slippage, partials and rejects.
        # Seeded per order: seeding by thesis alone made some theses draw a
        # reject on every attempt, forever.
        if result.paper:
            fill = self._paper.fill(
                client_oid=f"{order_oid}:open", side="sell", size=position.size, mark=mark
            )
            if not fill.accepted:
                return None, f"VENUE: {risk_note}{fill.detail}", "venue"
            position.entry_price = fill.avg_price
            position.size = fill.filled_size
            position.notional_usdt = round(fill.filled_size * fill.avg_price, 2)
            result.detail = f"{result.detail} {fill.detail}"

        position.paper = result.paper
        if not await self._store.add(position):
            return (
                None,
                f"DUPLICATE: already holding risk for {client_oid}; no incremental order",
                "duplicate",
            )
        return position, f"{risk_note}{result.detail}", ""

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
        lock = self._close_locks.setdefault(p.id, asyncio.Lock())
        async with lock:
            # Re-read: the snapshot the caller priced may be stale by now.
            current = await self._store.get(p.id)
            if current is None or current.status != "OPEN":
                return "already closed"
            return await self._close(current, mark, reason)

    async def _close(
        self, p: Position, mark: float, reason: CloseReason
    ) -> str:
        accepted, paper, detail, _ = await self._bitget.close_position(
            p.symbol, f"{p.size:.2f}", p.side
        )
        if not accepted:
            # A failed close must never be recorded as closed, or the book and
            # the exchange silently diverge.
            await self._store.close_rejected(p.id, detail)
            return f"close REJECTED, position left OPEN — {detail}"

        exit_price = mark
        if paper:
            # Each retry is a new draw. Seeding every attempt identically meant
            # a position that drew a reject was rejected on every sweep forever.
            fill = self._paper.fill(
                client_oid=f"{p.client_oid}:{p.id}:close",
                side="buy" if p.side.upper() == "SHORT" else "sell",
                size=p.size,
                mark=mark,
                attempt=p.close_attempts + 1,
            )
            if not fill.accepted:
                await self._store.close_rejected(p.id, fill.detail)
                return f"close REJECTED, position left OPEN — {fill.detail}"

            exit_price = fill.avg_price

            if not fill.complete:
                # Partially flattened: book the closed slice's P&L, shrink what
                # remains, and keep it open for the next sweep.
                remaining = round(p.size - fill.filled_size, 4)
                slice_pnl = self._slice_pnl(p, fill.filled_size, exit_price)
                if not await self._store.partial_close(
                    p.id, p.size, remaining, round(remaining * p.entry_price, 2),
                    slice_pnl, fill.detail,
                ):
                    return "position changed while closing; nothing booked"
                return (
                    f"PARTIAL close {fill.filled_size:.4f}/{p.size:.4f}; "
                    f"{remaining:.4f} still open, slice pnl {slice_pnl:+.2f} — {fill.detail}"
                )
            detail = f"{detail} {fill.detail}"

        final_pnl = self._slice_pnl(p, p.size, exit_price)
        if not await self._store.mark_closed(
            p.id, self._average_exit(p, final_pnl, exit_price), reason, final_pnl, p.size,
            last_fill=exit_price,
        ):
            return "position changed while closing; nothing booked"
        return detail

    @staticmethod
    def _average_exit(p: Position, final_pnl: float, last_fill: float) -> float:
        """Size-weighted exit across every slice, so realized P&L equals
        direction x (entry - exit) x original size on the closed row. Without
        a recorded original size it cannot be computed; the last fill is used."""
        if not p.original_size:
            return last_fill
        total = (p.realized_pnl_usdt or 0.0) + final_pnl
        direction = 1.0 if p.side.upper() == "SHORT" else -1.0
        return p.entry_price - total / (direction * p.original_size)

    @staticmethod
    def _slice_pnl(p: Position, size: float, exit_price: float) -> float:
        """P&L of closing `size` units at `exit_price`: units x price move."""
        direction = 1.0 if p.side.upper() == "SHORT" else -1.0
        return direction * (p.entry_price - exit_price) * size

    async def close_by_id(
        self, pid: str, reason: CloseReason = CloseReason.MANUAL, price: float | None = None
    ):
        """Flatten one position at the live mark. `price` is the operator's
        way out when there is no mark (a suspended or delisted contract): the
        close is booked at that price and the event says it was supplied."""
        p = await self._store.get(pid)
        if p is None:
            return None, "unknown position"
        if p.status != "OPEN":
            return p, "already closed"
        marks = await self._bitget.marks([p.symbol.removesuffix("USDT")])
        mark = marks.get(p.symbol.removesuffix("USDT"))
        if mark is None and price is None:
            return p, "no mark available; refusing to close blind (supply ?price= to override)"
        if mark is None:
            await self._store.note(p.id, "PRICE_OVERRIDE", f"no Bitget mark; operator price {price}")
            return p, await self.close(p, price, reason)
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
