# Cascadr

**An autonomous, event-driven trading agent that prices the second-order effects of supply-chain disruptions.**

Built by NetLayer Labs for the **Bitget AI Hackathon** - Agentic Trading track, *Event-Driven Agent* theme.

| | |
| --- | --- |
| **Live site** | https://cascadr.38.49.216.120.sslip.io |
| **Live terminal** | https://cascadr.38.49.216.120.sslip.io/terminal |
| **Public API** | https://cascadr.38.49.216.120.sslip.io/api/health |
| **Trading** | Paper only - orders are placed on **Bitget's demo exchange** (Demo Trading, no real funds) |

---

## Contents

1. [The idea](#the-idea)
2. [How the agent works](#how-the-agent-works)
3. [Verify it yourself](#verify-it-yourself)
4. [Paper trading on Bitget](#paper-trading-on-bitget)
5. [The knowledge graph](#the-knowledge-graph)
6. [Does the premise hold?](#does-the-premise-hold)
7. [Calibration](#calibration)
8. [Risk management](#risk-management)
9. [Explainability](#explainability)
10. [Role of the LLM](#role-of-the-llm)
11. [Architecture](#architecture)
12. [Running it locally](#running-it-locally)
13. [Security](#security)
14. [Limitations](#limitations)

---

## The idea

Markets react to the headline. When an earthquake shuts a TSMC fab, TSMC moves. The companies that depend on TSMC - the ones the headline never names - are slower to reprice, because working out who depends on whom, and by how much, takes a map of the supply chain.

Cascadr keeps that map. It reads live news about the companies in the graph, has an LLM judge whether a headline is a genuine disruption and how severe it is, propagates the shock through source-cited supply links to the exposed downstream companies, and shorts them - autonomously, around the clock, with every decision recorded.

Bitget's stock perpetuals make this tradeable: they can be shorted, and they trade 24/7, including the overnight hours when most supply-chain news from Asia breaks and US cash equities are closed.

## How the agent works

One loop runs on the server every 10 minutes, whether or not anyone is watching. A second loop checks exits every minute.

```
  SENSE            REASON              PROPAGATE                 ACT                     EXIT
  Google News  ->  LLM oracle      ->  supply-chain graph    ->  risk engine         ->  every 60 s:
  RSS, one         (0G Private         3-hop traversal:          sizing, caps,            stop-loss,
  query per        Computer):          score = shock x           drawdown halt,           take-profit,
  company;         disrupted           prod(dependency)          then a short order       7-day time stop
  dedupe,          company, shock      x 0.62^hops               on Bitget's demo
  freshness,       0-1, reasoning,                               exchange
  keyword filter   uncertainty

  shock < 0.40 ............ declined (recorded)
  exposure < 0.18 ......... not traded (recorded)
```

| Stage | What happens |
| --- | --- |
| **Sense** | Pulls headlines for each of the 16 companies. Already-seen and stale (> 6 h) stories are skipped, and a free keyword filter drops stories that name no graph company before any model is called. |
| **Reason** | The LLM names the directly disrupted company (checked against the graph, never trusted), scores the shock from 0 to 1, and states its reasoning and what would change its mind. Below a shock of **0.40** the headline is declined. |
| **Propagate** | A breadth-first walk of the graph, up to 3 hops. Each hop multiplies by that link's sourced dependency and decays by 0.62, so direct customers are hit hardest. The strongest path per company wins. |
| **Act** | Exposures of at least **0.18** on a company Bitget lists become short orders on Bitget's demo exchange, sized to the account and vetted by the risk engine first. |
| **Exit** | Every open position is marked at Bitget's mark price each minute and closed by stop-loss, take-profit (the model's own implied move) or a 7-day time stop. |

## Verify it yourself

Everything the site shows is read from the running system; nothing is replayed or mocked. The public API serves the same data:

| Endpoint | What it shows |
| --- | --- |
| [`/api/health`](https://cascadr.38.49.216.120.sslip.io/api/health) | Agent state, last cycle, LLM, news feed, exit loop, paper venue |
| [`/api/agent/decisions`](https://cascadr.38.49.216.120.sslip.io/api/agent/decisions) | Every decision - including every refusal - with the headline, article link, LLM reasoning, uncertainty, 0G provider and implied exposures |
| [`/api/positions`](https://cascadr.38.49.216.120.sslip.io/api/positions) | The paper book, each position with its venue, fills, fees and P&L |
| [`/api/venue`](https://cascadr.38.49.216.120.sslip.io/api/venue) | **Bitget's own view** of the demo account: balances and open positions |
| [`/api/paper/report`](https://cascadr.38.49.216.120.sslip.io/api/paper/report) | Paper performance: return, Sharpe, max drawdown, win rate, closed trades |
| [`/api/paper/equity`](https://cascadr.38.49.216.120.sslip.io/api/paper/equity) | The equity time series, one point per minute |
| [`/api/graph`](https://cascadr.38.49.216.120.sslip.io/api/graph) | The supply-chain graph with every link's sources and filing facts |
| [`/api/risk`](https://cascadr.38.49.216.120.sslip.io/api/risk) | Risk limits, cluster utilisation, drawdown |

## Paper trading on Bitget

Paper trades are placed on **Bitget's demo exchange** - the environment Bitget's own Agent Hub uses for `--paper-trading` - through the v3 (Unified Account) API with a Demo API key and the `paptrading: 1` header. Bitget fills each order and keeps the order, position and P&L record; Cascadr books exactly what Bitget reports (average fill price, quantity and fees) and `GET /api/venue` exposes Bitget's view of the account for cross-checking.

| | |
| --- | --- |
| **Instruments** | Bitget USDT-margined stock perpetuals. Bitget's demo exchange lists **NVDA, AAPL and TSLA** of the graph's ten stocks; exposures to the others are recorded in each decision as `NOT_ON_VENUE` and not traded. |
| **Paper account** | 49,756.27 USDT of demo funds. Position sizes and risk caps scale with this figure. |
| **Paper record** | Cascadr's equity journal runs from **2026-09-24** (fills simulated at Bitget's live prices); trades go to Bitget's demo exchange from **2026-10-06**. |
| **Setup orders** | On 2026-10-06, while the venue was being connected, the Bitget demo history recorded a 0.06 NVDA round trip (a deliberate end-to-end test) and an unintended 607.5 NVDA short opened by a local test run and closed minutes later. Neither was an agent decision; neither is in Cascadr's book. |

Real-money trading is implemented but disabled: it requires a separate live key and an explicit configuration change, and the team's submission is paper-only.

## The knowledge graph

**16 companies and 19 supply links**, every one with the evidence behind its number ([`backend/app/graph/data/edges.json`](backend/app/graph/data/edges.json)): sources (URL, publisher, date and a quote that appears on the page), the reasoning from source to figure, an as-of date, a confidence grade, caveats and any counter-evidence.

| Provenance | Meaning | Links |
| --- | --- | --- |
| `DISCLOSED` | The share is stated in a filing (e.g. AMD's 10-K: TSMC makes *all* its CPU and GPU wafers at 7 nm and below) | 2 |
| `REPORTED` | A specific share published by a named analyst or outlet | 4 |
| `QUALITATIVE` | The relationship is sourced but only described in words; the number comes from one fixed rule: sole 0.95, primary 0.70, one of two 0.50, one of several 0.25 | 13 |

- Each link was researched from primary pages and then re-checked by an independent verifier. Links nobody could source were **removed, not guessed** - Lynas→Sony and Maersk→Apple/Dell - which took Lynas and Maersk out of the graph.
- **Company size** is the latest fiscal year's revenue from the income statement, converted to USD at the fiscal-year-end rate.
- **Customer concentration** (shown per company in the terminal) is read by hand from each company's latest 10-K or 20-F, with the sentence, form and accession number. Where a filing discloses no qualifying customer, the record says so instead of showing a number.

## Does the premise hold?

[`backend/research/`](backend/research/) runs a standard event study (market model, 120-day estimation window) over historical disruptions, each re-verified against primary sources for its date, the origin's disruption and the documented dependence of every downstream name.

| | Result (3 events, 7 company pairs) |
| --- | --- |
| Day of the news | Downstream names fell in only **43%** of cases - the market does not price the contagion on day 0 |
| Days +1 to +5, vs the semiconductor ETF | **−3.29%** average, negative in **every** case |
| Overnight share of the day-0 move | **42%** on average - hours only a 24/7 venue can trade |

Three of the six originally listed events failed verification and were dropped (a quake with no disruption, a shipping event with no sourced link, a fire at a company outside the graph). **This is a keep-going result, not proof:** seven pairs is a small sample, and five of them share one earthquake. The research README lists every caveat.

## Calibration

[`backend/research/calibrate.py`](backend/research/calibrate.py) scores real headlines from each verified event with the live LLM and replays them through the graph. Over 8 calls per event, real disruptions scored **0.45–0.65**; the 1,466 live headlines the LLM scored from 2026-09-24 to 10-04 peaked at **0.33**.

- **Shock floor 0.40** sits between the two, so the floor alone separates disruption from noise.
- **Trade threshold 0.18** trades the Hualien-earthquake and Foxconn-lockdown names on every call. The previous 0.32 dated from guessed graph weights and would have traded none of them.

[`tests/test_calibration.py`](backend/tests/test_calibration.py) pins this: if the graph or thresholds change, it says whether the agent would still trade the events its own research supports.

## Risk management

Every proposed order is vetted before it reaches Bitget. Five shorts opened from one TSMC outage are not five positions; they are one bet wearing five tickers, so the caps are built around root causes.

| Control | Setting |
| --- | --- |
| Position size | 18%–60% of the paper account, scaling with exposure; 2x leverage, 3x above exposure 0.55 |
| Per root cause | At most 3 positions and 1× account equity of notional |
| Per headline | One headline opens at most one root cause's allowance, however many suppliers it names |
| Per symbol | One position |
| Whole book | 2.5× account equity of notional; 12 positions |
| Drawdown halt | No new risk at 15% drawdown |
| Exits | 6% stop-loss; take-profit at the model's implied move; 7-day time stop |
| Unpriced positions | Equity is reported as unknown, never as a partial sum; for risk only, the position is valued at its stop-loss |
| Bad inputs | A keyword-only verdict (if the LLM fails) is never traded; LLM calls are capped at 60 per hour |

## Explainability

Each decision is stored with: the headline and article link; the LLM's named entities, shock, severity, confidence, reasoning and stated uncertainty; the 0G provider that ran the inference; every implied exposure with the exact links and constants its score was multiplied from; and an outcome that names what happened - `TRADED`, `DECLINED`, `BLOCKED_BY_RISK`, `REJECTED_BY_VENUE`, `NOT_ON_VENUE`, `NO_MARKET_PRICE`, `ALREADY_HOLDING`, `NO_TRADABLE_EXPOSURE` or `EXECUTION_FAILED`.

The landing page's *A real decision* section rebuilds one decision's arithmetic from those stored factors. In the terminal, clicking a company shows every supply link's sources, quotes, caveats and counter-evidence.

## Role of the LLM

| | |
| --- | --- |
| **Model** | `claude-opus-5`, served through **0G Private Computer** (`router-api.0g.ai`) |
| **Function** | News oracle only: for each candidate headline, identify the directly disrupted graph company, score the shock (0–1), severity and confidence, and explain its reasoning and uncertainty |
| **Not used for** | Position sizing, risk, exits or order execution - those are deterministic code |
| **Audit** | Each call records the 0G provider that executed it |

## Architecture

```
Browser ──► Caddy (TLS) ──► /api/* ──► FastAPI agent  (127.0.0.1:8010)
                        └──► /*     ──► Next.js site   (127.0.0.1:4010)

FastAPI agent
├── news loop (10 min) ── Google News RSS ── LLM oracle (0G) ── graph traversal ── risk ── Bitget demo
├── exit loop (60 s) ──── Bitget marks ───── exit rules ─────── Bitget demo
└── SQLite (WAL, serialised) - decisions, headlines, positions, events, equity journal
```

| Layer | Technology |
| --- | --- |
| Frontend | Next.js 14 (App Router, standalone build), React 18, Tailwind CSS, react-force-graph-2d |
| Backend | Python 3.12, FastAPI, httpx, pydantic-settings, SQLite |
| Market data | Bitget public API v2 (live quotes and mark prices) |
| Execution | Bitget v3 Unified Account API, Demo Trading environment |
| LLM | `claude-opus-5` via 0G Private Computer |
| Hosting | Ubuntu VPS, systemd services, Caddy reverse proxy with automatic TLS |

```
app/                       landing page (server-rendered from the API) and terminal
components/                graph canvas, terminal panels, landing sections
hooks/useCascadr.ts        live polling of the API
lib/                       API client and response types
backend/app/agent.py       the autonomous loop: sense → reason → propagate → act
backend/app/traversal.py   contagion scoring and the calibrated thresholds
backend/app/risk.py        portfolio risk limits
backend/app/portfolio/     position store, lifecycle, exits, equity journal
backend/app/market/        Bitget market data, Bitget demo execution, local simulator
backend/app/graph/         the sourced graph (data/edges.json, data/filing_facts.json)
backend/app/ingest/        news feeds, LLM oracle, SEC EDGAR extraction
backend/research/          event study, calibration, verified events
backend/tests/             114 tests
```

## Running it locally

**Frontend** - proxies `/api` to the deployed backend by default (set `BACKEND_URL` to use another):

```bash
npm install
npm run dev -- -p 4010
```

**Backend:**

```bash
cd backend
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
cp .env.example .env          # optional: it runs with an empty environment
.venv/bin/uvicorn app.main:app --reload --port 8010
.venv/bin/python -m pytest -q
```

**Research:**

```bash
cd backend
.venv/bin/python -m research.compare     # event study, market and sector control
.venv/bin/python -m research.calibrate   # threshold calibration (spends LLM calls)
```

Deployment is described in [DEPLOY.md](DEPLOY.md); the backend in detail in [backend/README.md](backend/README.md).

## Security

- Every endpoint that writes, trades or spends LLM credits requires an admin token, checked before the request body is read. Public endpoints are read-only; CORS allows `GET` only.
- Exchange and LLM keys live only in the server's environment file (mode 600) and are never sent to the browser.
- The test suite runs with every exchange key blanked, so no test can reach a real or demo account.

## Limitations

- **Paper trading only.** No real funds are at risk.
- **Few tradable names on the demo venue.** Bitget's demo lists 3 of the graph's 10 stocks.
- **Trades are rare by design.** The agent acts only on genuine supply-chain disruptions; most news is not one, and it declines it.
- **Small research sample.** Three verified events support the premise directionally; they do not prove it.
- **Headlines, not articles.** The LLM judges each headline, not the full article.
- **A small graph.** 16 companies in the electronics supply chain.

Nothing here is investment advice or a trading signal.

---

NetLayer Labs · Bitget AI Hackathon
