"""Is the post-event drift real contagion, or just sector beta?

Runs the same event study against two benchmarks:

  SPY  - broad market. Drift here could still be "semis sold off that week".
  SMH  - semiconductor ETF. Drift that SURVIVES this is idiosyncratic to the
         individual name, which is what the strategy actually claims.

If CAR collapses toward zero under SMH, the signal is sector rotation, and
"short the exposed name" is really just "short semis" - a far more crowded and
less interesting trade.
"""

import numpy as np
import pandas as pd

from research.backtest import MARKET, SECTOR, run

COLS = ["AR_d0", "CAR_d1", "CAR_d1_3", "CAR_d1_5"]


def tstat(x: pd.Series) -> float:
    x = x.dropna()
    return float(x.mean() / (x.std(ddof=1) / np.sqrt(len(x)))) if len(x) > 1 else float("nan")


def summarise(df: pd.DataFrame, label: str) -> pd.DataFrame:
    out = pd.DataFrame(
        {
            "mean %": [df[c].mean() for c in COLS],
            "median %": [df[c].median() for c in COLS],
            "neg %": [(df[c] < 0).mean() * 100 for c in COLS],
            "t": [tstat(df[c]) for c in COLS],
        },
        index=COLS,
    )
    print(f"\n--- vs {label}  (n={len(df)}) ---")
    print(out.round(2).to_string())
    return out


if __name__ == "__main__":
    spy = run(MARKET, verbose=False)
    smh = run(SECTOR, verbose=False)

    a = summarise(spy, MARKET)
    b = summarise(smh, SECTOR)

    print("\n=== how much of the drift survives the sector control? ===")
    for c in COLS:
        m1, m2 = a.loc[c, "mean %"], b.loc[c, "mean %"]
        share = (m2 / m1 * 100) if m1 != 0 else float("nan")
        print(f"  {c:<10} SPY {m1:+.2f}%  ->  SMH {m2:+.2f}%   ({share:.0f}% survives)")

    print("\nNOTE: |t| < 2 means the result is indistinguishable from noise at this")
    print("sample size. n is tiny; treat every number here as directional only.")
