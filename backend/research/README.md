# Does the premise hold?

Cascadr assumes supply-chain contagion reaches downstream equities with a
**tradeable lag**. If the market prices a TSMC outage into NVDA within the same
session, there is no edge and no amount of engineering creates one.

This is the test. Run it:

```bash
./.venv/bin/python -m research.backtest   # per-event detail
./.venv/bin/python -m research.compare    # pooled, with sector control
```

## Method

Standard event study. For each (disruption, downstream name):

1. Fit alpha/beta by OLS on 120 trading days ending 11 sessions before the
   event, against a benchmark.
2. Abnormal return `AR_t = r_t − (alpha + beta · r_benchmark_t)`.
3. Report AR on the event day and cumulative AR over the following windows.

Two benchmarks, because the distinction decides whether the strategy is real:

- **SPY** — broad market. Drift here might still be "semis sold off that week".
- **SMH** — semiconductor ETF. Drift that *survives* this is idiosyncratic to
  the name, which is what the strategy actually claims.

6 events, 16 event-name pairs.

## Result

```
--- vs SPY  (n=16) ---            --- vs SMH  (n=16) ---
          mean %  neg %     t              mean %  neg %     t
AR_d0       0.25  43.75   0.88   AR_d0       0.21  43.75   0.71
CAR_d1     -0.78  62.50  -1.58   CAR_d1     -0.36  62.50  -0.87
CAR_d1_3   -1.14  75.00  -1.62   CAR_d1_3   -0.90  62.50  -1.40
CAR_d1_5   -1.71  68.75  -1.43   CAR_d1_5   -2.01  81.25  -2.09
```

**Day 0 is a coin flip.** Downstream names fell in only 44% of cases, mean
+0.25%, t = 0.88. The market does not price the contagion on the day the news
breaks — which is the necessary condition for the whole thesis.

**The drift lands afterwards.** Days +1..+5 average −1.71% vs SPY, negative in
69% of cases, growing with the window.

**It survives the sector control.** Against SMH the 5-day drift is −2.01%,
negative in 81% of cases, t = −2.09. So this is not merely "short semis after
bad semi news" — the drift is larger, not smaller, once sector beta is removed.

## What this does not establish

- **n = 16.** Far too small. Only one window crosses |t| > 2, and testing four
  windows makes one crossing roughly what chance alone would produce.
- **Selection bias.** The events are ones memorable enough to recall, which
  biases toward large, real impacts.
- **Confounders.** TSLA −12% over five days after the Renesas fire is almost
  certainly March-2021 growth/rates selloff, not automotive MCUs. Beta
  adjustment does not remove name-specific news.
- **Dates are day-accurate at best**, taken from public reporting.
- **Daily bars cannot see intraday lag.** If the market absorbs news in 90
  minutes, that is invisible here and lands entirely on day 0. This can falsify
  the multi-day claim, not the intraday one.

## The 24/7 argument, which daily bars *can* settle

`backtest.py` splits day 0 into the overnight gap (prev close → open) and the
regular session (open → close). **A mean 37% of the day-0 move happened in the
gap** — unreachable for a cash-equity trader, fully tradeable on a 24/7
perpetual. That is a structural reason to run this on Bitget stock perps
specifically, and it does not depend on the drift result at all.

## Verdict

Not falsified, and the shape is the one the thesis predicts: nothing on day 0,
drift over the following week, surviving sector control. That is a **keep
going** result, not a **go live** result.

To make it a real finding: 50+ events, pre-registered windows, intraday bars,
and out-of-sample validation. See the parent README for what that needs.
