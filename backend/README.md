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

| Method | Path | What it does |
| --- | --- | --- |
| `GET` | `/health` | Graph backend in use, paper-trading state, order cap |
| `GET` | `/graph` | Nodes + edges, with disclosed/estimated edge counts |
| `GET` | `/market/tradable` | Reconciles graph tickers against Bitget's **live** contract list and marks |
| `POST` | `/contagion` | Scores a shock across the downstream cone |
| `POST` | `/contagion/stream` | Same, as SSE, one event per exposure |
| `POST` | `/execute` | Scores, then submits orders through the safety gates |
| `GET` | `/ingest/edgar/{ticker}` | Disclosed revenue-concentration facts from the latest 10-K, with citation |
| `GET` | `/positions` | The persisted book, marked live, with age and pending exit |
| `POST` | `/positions/sweep` | Force an immediate mark-and-exit pass |
| `POST` | `/positions/{id}/close` | Manual flatten |
| `GET` | `/positions/reconcile` | Our book vs the exchange's |
| `GET` | `/positions/events` | Lifecycle audit trail |
| `GET` | `/policy` | The exit policy new positions inherit, and where it came from |

## Position lifecycle

Opening is the easy half. The rest:

**Exits**, evaluated every 60s by a background sweep and ordered worst-first:

| Rule | Default | Source |
| --- | --- | --- |
| `STOP_LOSS` | 6% adverse on the underlying | risk tolerance; 12–18% of margin at 2–3x |
| `TAKE_PROFIT` | per position | the model's own `implied_drawdown_pct` |
| `TIME_STOP` | 120h | the 5-day window `research/` actually measured |

Precedence matters: an old, losing position stops out rather than lingering to
its time stop. `evaluate_exit` is a pure function with no I/O, so the boundaries
are tested directly.

**Persistence** — SQLite (`cascadr.db`, stdlib, WAL). Kill the process and the
book is still there. Every transition also appends to `position_events`.

**Idempotency** — one open position per `client_oid` (`cascadr-{origin}-{ticker}`),
enforced by a partial unique index. A replayed signal cannot double the risk.

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

Running `POST /ingest/edgar/refresh` over all ten tradable names found **15
disclosed concentration facts and produced 0 edges**. That is not a bug — it is
the finding:

> 10-K customer-concentration disclosures almost never name the customer.
> "Sales to one direct customer represented 22% of total revenue."

So EDGAR gives **fragility magnitude, not graph topology**. The facts are kept
as node-level `disclosed_concentration_pct` (Broadcom 40%, NVIDIA 31%, AMD 18%,
Dell 12%, Qualcomm 10% — all cited) rather than guessed into edges.

**Consequence for the project:** filings alone cannot build the supply graph.
Customs / bill-of-lading data is the only route to real edges.

## Instruments — read this before touching symbols

Shorting a US equity on Bitget means the **stock perpetual future**:
symbol `{TICKER}USDT`, `productType: "USDT-FUTURES"`.

It does **not** mean tokenized xStocks (`AAPLx`, `NVDAx`). Those are **spot only**
and cannot be shorted, which makes them unusable for this strategy. All ten graph
tickers were reconciled against `GET /api/v2/mix/market/contracts`; hit
`/market/tradable` to re-check at any time.

## Graph provenance

Every edge carries a `provenance`:

- `DISCLOSED` — stated in a filing, carries an EDGAR citation
- `INFERRED` — derived from customs / shipment records
- `ESTIMATED` — hand-curated or analyst consensus

The seed graph is entirely `ESTIMATED`; no filing states "92% of NVIDIA's dies
come from TSMC". What filings *do* provide is **revenue** concentration (>10%
customers must be disclosed), which `app/ingest/edgar.py` extracts. Note these
propagate in opposite directions:

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

These pin parity with the TypeScript engine in `lib/traversal.ts`. If the two
diverge, the terminal renders scores the backend never computed.
