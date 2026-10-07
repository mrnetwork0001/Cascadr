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

- **SPY** - broad market. Drift here might still be "semis sold off that week".
- **SMH** - semiconductor ETF. Drift that *survives* this is idiosyncratic to
  the name, which is what the strategy actually claims.

3 events, 7 event-name pairs.

### The sample, and what changed

Every event was re-checked on 2026-09-24 against primary pages (see
`events.py` for the sources): when the news first became public, the first
regular US session after it, that the origin really was disrupted, and that
each downstream name's dependence on it was documented *before* the event.

- **Kept:** Hualien M7.4 earthquake (TSMC → NVDA, AAPL, AMD, QCOM, AVGO),
  Foxconn Zhengzhou lockdown (FOXCONN → AAPL, re-dated 2022-11-02 → 10-31),
  Texas storm Uri (SAMSUNG → QCOM, re-dated 2021-02-16 → 02-17; NVDA removed).
- **Dropped:** the 2022 Taitung earthquake (no TSMC disruption was ever
  reported), the Ever Given (not a Maersk ship, and no source ties Apple or
  Dell to it), and the Renesas fire (Renesas is not in the graph, and no source
  ties Tesla to it).

An earlier version of this study used all six events and 16 pairs. Three of
those events did not survive checking, so its numbers are withdrawn.

## Result

```
--- vs SPY  (n=7) ---             --- vs SMH  (n=7) ---
          mean %  neg %     t               mean %  neg %     t
AR_d0       0.05  42.86  0.10    AR_d0       0.36  28.57  1.05
CAR_d1     -1.33  85.71 -1.72    CAR_d1     -1.03  71.43 -1.47
CAR_d1_3   -2.68 100.00 -3.16    CAR_d1_3   -2.00  71.43 -1.82
CAR_d1_5   -3.00  85.71 -2.59    CAR_d1_5   -3.29 100.00 -2.03
```

**Day 0 is a coin flip.** Downstream names fell in 43% of cases, mean +0.05%
against SPY. The market does not price the contagion on the day the news
breaks - the necessary condition for the thesis.

**The drift lands afterwards.** Days +1..+5 average −3.00% against SPY and
−3.29% against the semiconductor ETF, negative in every case against SMH.

**It survives the sector control.** Removing semiconductor beta leaves the
five-day drift intact, so this is not merely "semis sold off that week".

## What this does not establish

- **n = 7, and they are not independent.** Five of the seven pairs come from
  one earthquake, so they share one market backdrop. The t-statistics treat
  them as independent and therefore overstate confidence. Treat this as three
  observations, not seven.
- **Selection bias.** The events are ones memorable enough to recall, which
  biases toward large, real impacts.
- **Confounders.** Beta adjustment does not remove name-specific news in the
  same week - AMD's −6% after the Hualien quake is the largest single number
  and may have other causes.
- **Daily bars cannot see intraday lag.** If the market absorbs news in 90
  minutes, that is invisible here and lands on day 0. This can falsify the
  multi-day claim, not the intraday one.

## The 24/7 argument, which daily bars *can* settle

`backtest.py` splits day 0 into the overnight gap (prev close → open) and the
regular session (open → close). **A mean 42% of the day-0 move happened in the
gap** (median 26%) - unreachable for a cash-equity trader, fully tradeable on a 24/7
perpetual. That is a structural reason to run this on Bitget stock perps
specifically, and it does not depend on the drift result at all.

## Calibrating the agent

The study above says the drift follows real disruptions. The agent's
thresholds decide whether it would actually trade one. `calibrate.py` scores
real headlines from each verified event with the live agent's LLM
(`claude-opus-5`, two headlines per event, repeated) and replays them through
the sourced graph. Two runs on 2026-10-04, 8 calls per event:

| Event | LLM shock | Downstream exposure at the lowest shock |
| --- | --- | --- |
| Hualien earthquake | 0.45-0.55 | AMD 0.279; NVDA, AAPL, QCOM, AVGO 0.265 |
| Foxconn Zhengzhou lockdown | 0.55-0.60 | AAPL 0.196 |
| Texas storm Uri | 0.48-0.65 | QCOM below the 0.08 floor |

Against that, the 1,466 live headlines the LLM scored from 2026-09-24 to
2026-10-04 peaked at a shock of 0.33 (Apple's iPhone cellular defect), and
none implied a downstream exposure above 0.13. Not one reached a trade.

- **Shock floor 0.45 → 0.40.** One real-disruption call scored exactly 0.45,
  leaving no margin. 0.40 sits between every real-disruption call (≥ 0.45)
  and every live headline (≤ 0.33), so the floor alone keeps noise out.
- **Trade threshold 0.32 → 0.18.** 0.32 dated from the guessed weights the
  graph had before it was sourced. On the sourced graph it would have traded
  none of the events this study is built on. 0.18 trades the Hualien and
  Foxconn names on every call. Texas storm's Qualcomm link stays untraded: Samsung is
  one of three primary foundries for Qualcomm, so its weight is the lowest
  bucket.
- **Shock floor 0.40 → 0.25, and the LLM makes the trade call (2026-10-07).**
  While fixed rules turned exposures into orders, the floor alone had to keep
  noise out, and from 2026-09-24 to 10-07 only one of 1,905 live headlines
  cleared 0.40 (Apple's iPhone 18 Pro Max recall, 0.42). On 2026-10-07 the
  trade decision moved to the LLM (`app/trader.py`): the graph proposes
  candidates, the model decides short or pass, conviction, target and hold.
  The floor's job changed with it - it now decides which headlines are worth
  a trade decision, not which are traded. At 0.25 that admits company-specific
  bad news (over those 13 days, nine headlines naming Apple, Tesla or Nvidia
  scored 0.25-0.42), and the model can pass on any of it, with its reason
  recorded. The calibration above still measures what the oracle scores real
  disruptions at; it no longer sets the trading cutoff by itself.
- **Keyword fallback is never traded.** If the LLM fails, the headline is
  left for the next cycle instead of being decided on keywords.

This is calibrated on the same three events it is checked on, so it is a
consistency check, not an out-of-sample result. `tests/test_calibration.py`
pins it: if the graph or the thresholds change, the test says whether the
agent would still trade the events its own research supports.

## Verdict

Not falsified, and the shape is the one the thesis predicts: nothing on day 0,
drift over the following week, surviving sector control. On three events that
is a **keep going** result, not a **go live** result.

To make it a real finding: 50+ events, pre-registered windows, intraday bars,
and out-of-sample validation. See the parent README for what that needs.
