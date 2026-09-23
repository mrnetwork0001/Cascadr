"""Event study: does supply-chain contagion arrive with a tradeable lag?

Method
------
Standard market model. For each (event, downstream name):

  1. Estimate alpha/beta by OLS on 120 trading days of daily returns ending
     11 sessions before the event, against SPY.
  2. Abnormal return AR_t = r_t - (alpha + beta * r_spy_t).
  3. Report AR on the event day and cumulative AR over following windows.

The question is *where* the abnormal return lands:

  concentrated on day 0        -> priced immediately, no edge
  accumulating over +1..+5     -> drift, and a tradeable lag

Hard limitation
---------------
Daily bars cannot see intraday lag. If the market absorbs the news in 90
minutes, that is invisible here and shows up entirely on day 0. So this can
only falsify the *multi-day* version of the thesis, not the intraday one.

What daily bars CAN settle is the 24/7 argument: day 0 is decomposed into the
overnight gap (previous close -> open) and the intraday move (open -> close).
Return that lands in the gap is unreachable for a cash-equity trader but fully
tradeable on a 24/7 perpetual — which is the structural case for doing this on
Bitget at all.
"""

import warnings

import numpy as np
import pandas as pd
import yfinance as yf

from research.events import EVENTS, Event

warnings.filterwarnings("ignore")

MARKET = "SPY"
SECTOR = "SMH"  # semiconductor ETF — the control that matters for chip names
EST_WINDOW = 120  # trading days used to fit alpha/beta
EST_GAP = 11  # sessions left between estimation window and the event


def _fetch(tickers: list[str], start: str, end: str) -> pd.DataFrame:
    return yf.download(
        tickers, start=start, end=end, progress=False, auto_adjust=True,
        group_by="column", threads=False,
    )


def _market_model(stock: pd.Series, market: pd.Series) -> tuple[float, float]:
    """OLS of stock returns on market returns -> (alpha, beta)."""
    df = pd.concat([stock, market], axis=1).dropna()
    if len(df) < 30:
        return 0.0, 1.0
    beta, alpha = np.polyfit(df.iloc[:, 1].to_numpy(), df.iloc[:, 0].to_numpy(), 1)
    return float(alpha), float(beta)


def study_event(ev: Event, benchmark: str = MARKET) -> pd.DataFrame | None:
    tickers = [*ev.downstream, benchmark]
    start = (pd.Timestamp(ev.date) - pd.Timedelta(days=330)).strftime("%Y-%m-%d")
    end = (pd.Timestamp(ev.date) + pd.Timedelta(days=30)).strftime("%Y-%m-%d")

    data = _fetch(tickers, start, end)
    if data.empty:
        return None

    close = data["Close"]
    open_ = data["Open"]
    if isinstance(close, pd.Series):  # single ticker
        close = close.to_frame(ev.downstream[0])
        open_ = open_.to_frame(ev.downstream[0])

    rets = close.pct_change()
    idx = close.index

    # The event session is the first trading day on or after the event date.
    after = idx[idx >= pd.Timestamp(ev.date)]
    if len(after) < 8:
        return None
    t0 = idx.get_loc(after[0])
    if t0 - EST_GAP - EST_WINDOW < 0:
        return None

    est = slice(t0 - EST_GAP - EST_WINDOW, t0 - EST_GAP)
    rows = []

    for tk in ev.downstream:
        if tk == benchmark or tk not in close.columns or close[tk].isna().all():
            continue
        alpha, beta = _market_model(rets[tk].iloc[est], rets[benchmark].iloc[est])
        ar = rets[tk] - (alpha + beta * rets[benchmark])

        # Day 0 split: overnight gap vs the regular session.
        prev_close = close[tk].iloc[t0 - 1]
        gap = (open_[tk].iloc[t0] / prev_close - 1) * 100
        intraday = (close[tk].iloc[t0] / open_[tk].iloc[t0] - 1) * 100

        rows.append(
            {
                "ticker": tk,
                "AR_d0": ar.iloc[t0] * 100,
                "gap_d0": gap,
                "intraday_d0": intraday,
                "CAR_d1": ar.iloc[t0 + 1] * 100,
                "CAR_d1_3": ar.iloc[t0 + 1 : t0 + 4].sum() * 100,
                "CAR_d1_5": ar.iloc[t0 + 1 : t0 + 6].sum() * 100,
            }
        )

    return pd.DataFrame(rows).set_index("ticker") if rows else None


def run(benchmark: str = MARKET, verbose: bool = True) -> pd.DataFrame:
    all_rows = []
    for ev in EVENTS:
        if verbose:
            print(f"\n{'=' * 78}\n{ev.name}  ({ev.date})   origin={ev.origin}")
            print(f"  {ev.note}")
        df = study_event(ev, benchmark)
        if df is None:
            if verbose:
                print("  -- insufficient data --")
            continue
        if verbose:
            print(df.round(2).to_string())
        for tk, r in df.iterrows():
            all_rows.append({"event": ev.name, "ticker": tk, **r.to_dict()})
    return pd.DataFrame(all_rows)


if __name__ == "__main__":
    res = run()
    if res.empty:
        raise SystemExit("no results")

    print(f"\n{'=' * 78}\nPOOLED  (n={len(res)} event-name pairs)\n{'=' * 78}")
    cols = ["AR_d0", "gap_d0", "intraday_d0", "CAR_d1", "CAR_d1_3", "CAR_d1_5"]
    summary = res[cols].agg(["mean", "median", "std"]).round(2)
    print(summary.to_string())

    print("\nShare of day-0 move that happened in the overnight gap:")
    d0 = res["AR_d0"]
    gap_share = (res["gap_d0"].abs() / (res["gap_d0"].abs() + res["intraday_d0"].abs()))
    print(f"  mean {gap_share.mean() * 100:.0f}%   median {gap_share.median() * 100:.0f}%")

    print("\nDirectional hit rate (downstream fell after an upstream shock):")
    for c in ["AR_d0", "CAR_d1", "CAR_d1_3", "CAR_d1_5"]:
        print(f"  {c:<10} negative in {(res[c] < 0).mean() * 100:>5.0f}% of cases"
              f"   mean {res[c].mean():+.2f}%")
