# Cascadr backend

Python service that owns everything the browser must not: graph access,
contagion scoring, and order submission.

## Run

```bash
cd backend
python3 -m venv .venv && ./.venv/bin/pip install -r requirements.txt
cp .env.example .env          # optional — it runs with an empty environment
./.venv/bin/uvicorn app.main:app --reload --port 8010
```

Then `curl localhost:8010/health`. Interactive docs at `/docs`.

## Endpoints

Reads are public. Anything that writes, trades or spends LLM credits needs the
`X-Admin-Token` header matching `CASCADR_ADMIN_TOKEN`; with no token
configured those endpoints answer 503, with a wrong one 401. CORS allows
`GET` only.

| Method | Path | What it does |
| --- | --- | --- |
| `GET` | `/health` | Agent, LLM, news-feed, sweep and trading-gate state |
| `GET` | `/overview` | Live counts the landing page shows |
| `GET` | `/graph` | Nodes and edges with every edge's evidence, plus filing facts |
| `GET` | `/market/quotes` | Live Bitget quotes for every tradable graph company |
| `GET` | `/market/tradable` | Reconciles graph tickers against Bitget's live contract list |
| `GET` | `/agent/decisions` | Every decision, refusals included, with implied exposures |
| `GET` | `/agent/latest` | Latest decision, and latest one that implied any exposure |
| `GET` | `/agent/feed` | Decisions and position events as one stream |
| `GET` | `/agent/headlines` | Headlines the agent has seen |
| `GET` | `/positions` | The paper book, marked to Bitget's mark price |
| `GET` | `/positions/events` | Lifecycle audit trail |
| `GET` | `/paper/report`, `/paper/equity` | Paper performance and the equity series |
| `GET` | `/risk`, `/policy` | Risk utilisation; the exit policy and where its numbers come from |
| `POST` | `/oracle`, `/oracle/act` | Admin: score one headline; score and act on it |
| `POST` | `/contagion`, `/execute` | Admin: what-if scoring; open positions for a hypothetical shock (`source="manual"`) |
| `POST` | `/agent/cycle` | Admin: run one agent pass now |
| `POST` | `/positions/sweep`, `/positions/{id}/close` | Admin: force an exit pass; flatten one position |
| `GET` | `/positions/reconcile` | Admin: our book vs the exchange's |
| `POST` | `/ingest/edgar/refresh`, `GET /ingest/edgar/{ticker}` | Admin: EDGAR extraction |

## The agent

With `CASCADR_AUTONOMOUS=true` a background loop runs every
`CASCADR_POLL_SECONDS`:

1. **Sense** — Google News RSS, one query per graph company. Seen and stale
   (older than `CASCADR_NEWS_MAX_AGE_HOURS`) headlines are skipped, and a free
   keyword filter drops any that name no graph company. Feed errors are counted
   and shown in `/health`, not swallowed.
2. **Reason** — the LLM names the directly disrupted companies (checked against
   the graph), scores the shock 0–1, and states its reasoning and what would
   change its mind. Below `CASCADR_SHOCK_FLOOR` the headline is declined.
   LLM calls are capped at `CASCADR_MAX_LLM_PER_HOUR`.
3. **Propagate** — each disrupted company's downstream cone is scored; where
   several paths reach one company, the strongest wins.
4. **Act** — exposures at or above the trade threshold go through the risk
   engine to the paper book.

Every headline that reaches the LLM becomes a decision row, with the
exposures it implies (each with the edges and constants its score was
multiplied from), the article link and the 0G provider. The outcome names what
happened: `DECLINED`, `TRADED`, `BLOCKED_BY_RISK`, `REJECTED_BY_VENUE`,
`NO_MARKET_PRICE`, `ALREADY_HOLDING`, `NO_TRADABLE_EXPOSURE`, `ANALYSED` or
`EXECUTION_FAILED`.

Execution acts on exactly the exposures the decision recorded. Each position's
risk cluster is its real root cause; separately, one headline opens at most
one cluster's allowance of positions and notional, so a headline naming
several suppliers is still one bet.

## Position lifecycle

Opening is the easy half. The rest:

**Exits**, evaluated every 60s by a background sweep and ordered worst-first:

| Rule | Default | Source |
| --- | --- | --- |
| `STOP_LOSS` | 6% adverse on the underlying | risk tolerance; 12–18% of margin at 2–3x |
| `TAKE_PROFIT` | per position | the model's own `implied_drawdown_pct` |
| `TIME_STOP` | 168h | the 5-trading-day window `research/` measured, in calendar hours (a 24/7 perp crosses a weekend) |

Precedence matters: an old, losing position stops out rather than lingering to
its time stop. `evaluate_exit` is a pure function with no I/O, so the boundaries
are tested directly.

**Persistence** — SQLite (`cascadr.db`, stdlib, WAL). Kill the process and the
book is still there. Every transition also appends to `position_events`. The
store, journal, feed reader and agent share one connection, and every call to
it is serialised (`app/db.py`); concurrent reads of one query otherwise reset
each other's cursor.

**Idempotency** — one *open* position per `client_oid` (`cascadr-{origin}-{ticker}`),
enforced by a partial unique index over open rows. A replayed signal cannot
double the risk, and a closed position does not block a later re-entry.

**P&L** — `pnl_usdt = notional × move`, where notional already includes
leverage; `roe_pct` is the return on margin. Partial closes book their slice's
realised P&L and keep the rest open; the closed row shows the size as opened
and the size-weighted average exit, so realized = (entry − exit) × size holds.
An open position with no live mark makes unrealized P&L and equity unknown,
and they are reported as unknown — never as a partial sum. For risk decisions
only, it is valued at its stop-loss, so one suspended contract cannot freeze
the book; an operator can close it at a stated price
(`POST /positions/{id}/close?price=`), which is recorded as an override.

**Reconciliation** — `/positions/reconcile` compares our open positions against
Bitget's. Without credentials it reports `exchange_available: false` rather than
an empty exchange: "cannot check" and "nothing open" look identical in the data
and mean opposite things.

A failed close leaves the position **open**. Recording a close that did not
happen is how a book silently diverges from reality.

## Safety

`place_order` simulates unless **all** of the following hold:

1. `CASCADR_PAPER_TRADING` is exactly the string `false`
2. all three Bitget credentials are present
3. the order notional is under `CASCADR_MAX_ORDER_USDT`

Failing any gate is not an error — the order comes back with `paper: true` and a
`detail` saying which gate stopped it. The flag is parsed as a string on purpose:
as a bool, pydantic would read `0`, `no` or an empty value as False and silently
arm live trading.

## The LLM — 0G Private Computer

The News Oracle is where the model makes the decision. It reads a raw headline,
resolves it to graph entities, and sets the **shock magnitude** the graph
multiplies into position size. It is not annotating a decision made elsewhere.

Measured difference on the same headline
("TSMC halts 3nm at Fab 18, guidance withdrawn"):

| Engine | shock | Outcome |
| --- | --- | --- |
| keyword fallback | 0.45 | everything stays `WATCH` — **nothing trades** |
| `claude-opus-5` | 0.60-0.87 | `STRESSED` — **orders fire** |

The LLM is the difference between trading and not trading.

### Wire formats

0G routes every vendor through one API, but not every model takes the same
shape. Measured against the live router:

```
claude-* , glm-* , deepseek-*   ->  POST /v1/messages          (anthropic)
gpt-*                           ->  POST /v1/chat/completions  (openai)
```

Sending a model to the wrong one is rejected outright
(`model "gpt-5.4" is not available on anthropic format`). `LLM_API_FORMAT=auto`
picks by model name. 119 models were available at time of writing.

### Verifiable provenance

0G returns `x_0g_trace` and an `x-provider` header, so every decision records
**which provider executed the inference and what it cost on-chain**:

```
PROOF  provider=0xd3f02c1a04160389d98D2192AE2034159f731011
       served=claude-opus-5  cost_0g=61881600000000000
```

A trading decision you cannot attribute is a trading decision you cannot audit.

`LLM_TRUST_MODE=verified` restricts execution to attestable providers. It is
opt-in because it also restricts availability — measured, `claude-opus-5`
returns 503 "no provider available" under verified while `deepseek-v4-pro`
succeeds.

### Known limitation: decision consistency

The same headline scored **0.87, 0.65 and 0.60** across three calls. That
variance is real and it propagates directly into position size. Anything
running this with capital needs either a consistency benchmark, multi-sample
averaging, or a tighter rubric in the system prompt. It is flagged rather than
hidden because sizing off a number that moves 30% between identical calls is a
genuine risk, not a rounding detail.

## Portfolio risk

Per-position stops answer "is this trade wrong?". They do not answer "is the
book too big?" — and for a contagion strategy that gap is specific and
dangerous:

> Five shorts opened from one TSMC outage are not five positions.
> They are one bet, wearing five tickers.

Every name in a cascade shares a root cause, so returns are near-perfectly
correlated when the thesis is wrong. `app/risk.py` vets every proposed open
*before* it reaches the venue:

| Limit | Default | Why |
| --- | --- | --- |
| `max_positions_per_cluster` | 3 | one shock is one bet |
| `max_cluster_notional_usdt` | 100k | caps the correlated exposure |
| `max_positions_per_symbol` | 1 | two clusters naming NVDA is one exposure |
| `max_gross_notional_usdt` | 250k | whole-book ceiling |
| `max_drawdown_pct` | 15% | kill switch — halts all new risk |

Clusters are keyed by originating shock. Where a request exceeds headroom it is
**scaled down** rather than rejected, until headroom falls below
`min_notional_usdt`. `GET /risk` shows live utilisation per cluster.

## Paper fills are not frictionless

A paper mode that always fills at the mark teaches you nothing: every close
succeeds and the first real slippage arrives with real money. `app/market/paper.py`
models slippage (worse for larger orders, always against you), partial fills,
and rejects — deterministic per `client_oid`, so runs reproduce.

A partial close **shrinks the position and leaves it open**; a rejected close
leaves it open too. Recording a close that did not happen is how a book
silently diverges from the exchange.

## The sweep

Exits run every 60s in a supervised loop that:

- runs **immediately on boot**, not after one interval — while the process was
  down, positions kept ageing and prices kept moving, so a stop may already be
  overdue;
- backs off exponentially on failure instead of hot-looping, and never dies;
- reports `runs`, `last_ok` and `consecutive_failures` in `/health`, which
  degrades to `"degraded"` after 3 failures. A dead sweeper is silent, and
  silence looks exactly like "nothing to do".

## What SEC filings actually yield

`app/ingest/edgar.py` pulls customer-concentration sentences from each
tradable name's latest 10-K. Pattern matching misreads them: an earlier run
reported NVIDIA 31% (the non-US share of revenue), Qualcomm 10% (a table
heading) and Broadcom 40% (the top five customers combined). So the extractor
only produces **candidates** (`POST /ingest/edgar/refresh`, admin), and nothing
it finds is served.

The concentration figures shown in the node inspector come from
[app/graph/data/filing_facts.json](app/graph/data/filing_facts.json): each one
read by hand from the filing, with the sentence it came from, the form, the
accession number and the fiscal year. They describe how concentrated a
company's revenue is; they are not supply links.

Filings do give supply links when the filer states them: the graph's two
`DISCLOSED` edges come straight from AMD's and Broadcom's 10-Ks.

## Instruments — read this before touching symbols

Shorting a US equity on Bitget means the **stock perpetual future**:
symbol `{TICKER}USDT`, `productType: "USDT-FUTURES"`.

It does **not** mean tokenized xStocks (`AAPLx`, `NVDAx`). Those are **spot only**
and cannot be shorted, which makes them unusable for this strategy. All ten graph
tickers were reconciled against `GET /api/v2/mix/market/contracts`; hit
`/market/tradable` to re-check at any time.

## Graph provenance

Every edge in [app/graph/data/edges.json](app/graph/data/edges.json) carries a
`provenance`, its `sources` (URL, publisher, date, and a quote that appears on
the page), a `basis` explaining how the number follows from them, an `as_of`,
a `confidence`, caveats in `notes`, and any `counter_evidence`:

- `DISCLOSED` — the share is stated in a filing or official statement
- `REPORTED` — a specific share published by a named analyst or outlet
- `QUALITATIVE` — sourced relationship, described only in words; the number
  comes from one fixed mapping: sole 0.95, primary 0.70, one of two 0.50,
  one of several 0.25
- `INFERRED` — derived from customs / shipment records (none yet)

Links that could not be sourced were removed rather than kept with a guessed
weight; the file lists them under `removed`, with the reason.

Filings give **revenue** concentration as well as supply relationships, and
the two propagate in opposite directions:

```
supply  : upstream breaks -> downstream cannot build   (TSMC -> NVDA)
revenue : customer cuts   -> supplier loses revenue    (NVDA -> its customer)
```

A path is only as trustworthy as its weakest edge, so `ExposurePath` reports
`weakest_provenance`.

## Tests

```bash
./.venv/bin/python -m pytest tests/ -q
```

`test_graph_data.py` fails if an unsourced edge, a guessed weight or an
unconnected company ever ships. `test_api.py` checks every write endpoint is
behind the admin token.
