"""Paper fill simulator.

A paper mode that always fills at the mark teaches you nothing: every close
succeeds, every size is exact, and the first time real slippage or a reject
appears is with real money. This models the three things that actually break
execution logic:

  * slippage  - you never get the mark; larger orders get worse prices
  * partial fills - you asked for 100, you got 62, and you still owe 38
  * rejects   - the venue says no, and the position must stay open

Deterministic given (client_oid, attempt): the same order always produces the
same outcome, so tests are stable and a demo is reproducible. Set
`reject_rate=0` / `partial_rate=0` for a frictionless run.
"""

import hashlib
from dataclasses import dataclass

# Basis points of slippage per 10k USDT of notional, on top of a fixed spread.
SPREAD_BPS = 1.5
IMPACT_BPS_PER_10K = 1.2


@dataclass
class PaperFill:
    accepted: bool
    filled_size: float
    avg_price: float
    slippage_bps: float
    detail: str

    @property
    def partial(self) -> bool:
        return self.accepted and self.filled_size > 0 and not self.complete

    complete: bool = True


def _unit(seed: str) -> float:
    """Stable pseudo-random in [0,1) from a string - no global RNG state."""
    h = hashlib.sha256(seed.encode()).digest()
    return int.from_bytes(h[:8], "big") / 2**64


class PaperBroker:
    def __init__(
        self,
        *,
        reject_rate: float = 0.04,
        partial_rate: float = 0.12,
        enabled: bool = True,
    ):
        self.reject_rate = reject_rate
        self.partial_rate = partial_rate
        self.enabled = enabled

    def fill(
        self, *, client_oid: str, side: str, size: float, mark: float, attempt: int = 0
    ) -> PaperFill:
        if not self.enabled:
            return PaperFill(True, size, mark, 0.0, "frictionless paper fill")

        seed = f"{client_oid}:{attempt}"
        r_reject = _unit(seed + ":reject")
        r_partial = _unit(seed + ":partial")

        if r_reject < self.reject_rate:
            return PaperFill(
                False, 0.0, 0.0, 0.0,
                "venue rejected (simulated): insufficient margin or price band",
                complete=False,
            )

        notional = size * mark
        slip_bps = SPREAD_BPS + IMPACT_BPS_PER_10K * (notional / 10_000)
        # Slippage always hurts: selling fills lower, buying fills higher.
        direction = -1.0 if side.lower() in ("sell", "short") else 1.0
        avg_price = mark * (1 + direction * slip_bps / 10_000)

        if r_partial < self.partial_rate:
            filled = round(size * (0.35 + 0.5 * _unit(seed + ":frac")), 4)
            return PaperFill(
                True, filled, avg_price, slip_bps,
                f"partial fill {filled:.4f}/{size:.4f} (simulated)",
                complete=False,
            )

        return PaperFill(
            True, size, avg_price, slip_bps,
            f"filled {size:.4f} @ {avg_price:.4f} ({slip_bps:.1f} bps slippage)",
        )
