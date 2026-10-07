# Cascadr

**An autonomous, event-driven trading agent that prices the second-order effects of supply-chain disruptions.**

Built by NetLayer Labs for the **Bitget AI Hackathon** - Agentic Trading track, *Event-Driven Agent* theme.

| | |
| --- | --- |
| **Live site** | https://trycascadr.vercel.app |
| **Live terminal** | https://trycascadr.vercel.app/terminal |
| **Demo film (2:50)** | https://www.youtube.com/watch?v=6W74-qPAj7c |
| **For judges** | https://trycascadr.vercel.app/judges - a traced event → decision → execution, the stats and every log |
| **Trading log** | https://trycascadr.vercel.app/api/paper/log?format=csv - one row per fill |
| **Public API** | https://trycascadr.vercel.app/api/health |
| **Trading** | Paper only - orders are placed on **Bitget's demo exchange** through **Bitget Agent Hub** (Demo Trading, no real funds) |

---

## Contents

1. [The idea](#the-idea)
2. [How the agent works](#how-the-agent-works)
3. [A live decision](#a-live-decision)
4. [Verify it yourself](#verify-it-yourself)
5. [Paper trading on Bitget](#paper-trading-on-bitget)
6. [The knowledge graph](#the-knowledge-graph)
7. [Does the premise hold?](#does-the-premise-hold)
8. [Calibration](#calibration)
9. [Operator replays](#operator-replays)
10. [Risk management](#risk-management)
11. [Explainability](#explainability)
12. [Role of the LLM](#role-of-the-llm)
13. [Architecture](#architecture)
14. [Running it locally](#running-it-locally)
15. [Demo film](#demo-film)
16. [Security](#security)
17. [Limitations](#limitations)

---

## The idea

Markets react to the headline. When an earthquake shuts a TSMC fab, TSMC moves. The companies that depend on TSMC - the ones the headline never names - are slower to reprice, because working out who depends on whom, and by how much, takes a map of the supply chain.

Cascadr keeps that map. It reads live news about the companies in the graph, has an LLM judge whether a headline is a genuine disruption and how severe it is, propagates the shock through source-cited supply links to the exposed downstream companies, and shorts them - autonomously, around the clock, with every decision recorded.

Bitget's stock perpetuals make this tradeable: they can be shorted, and they trade 24/7, including the overnight hours when most supply-chain news from Asia breaks and US cash equities are closed.

## How the agent works

One loop runs on the server every 10 minutes, whether or not anyone is watching. A second loop checks exits every minute, and a third has the LLM review every open position's thesis every 4 hours.

```
  SENSE          REASON            PROPAGATE             DECIDE                  ACT              EXIT
  Google News -> LLM oracle     -> supply-chain graph -> LLM trade call      -> risk engine -> every 60 s: hard
  RSS, one       (0G Private       3-hop traversal:      per candidate:          caps, drawdown   stop, target,
  query per      Computer):        score = shock x       short or pass,          halt, then a     time stop;
  company;       disrupted         prod(dependency)      conviction (= size),    short order on   every 4 h: the
  dedupe,        company, shock    x 0.62^hops           take-profit, hold       Bitget's demo    LLM reviews the
  freshness,     0-1, reasoning,   -> candidate shorts   hours, written reason   exchange         thesis, may close
  keyword filter uncertainty

  shock < 0.25 ............ not sent for a trade decision (recorded)
  exposure < 0.18 ......... not a candidate (recorded)
  LLM passes .............. not traded (recorded, with its reason)
```

| Stage | What happens |
| --- | --- |
| **Sense** | Pulls headlines for each of the 19 companies. Already-seen and stale (> 6 h) stories are skipped, and a free keyword filter drops stories that name no graph company before any model is called. |
| **Reason** | The LLM names the directly disrupted company (checked against the graph, never trusted), scores the shock from 0 to 1, and states its reasoning and what would change its mind. Below a shock of **0.25** the headline is declined. |
| **Propagate** | A breadth-first walk of the graph, up to 3 hops. Each hop multiplies by that link's sourced dependency and decays by 0.62, so direct customers are hit hardest. The strongest path per company wins. |
| **Decide** | Downstream exposures of at least **0.18**, and the directly hit company itself when its shock is at least **0.25**, become candidate shorts - if Bitget's demo exchange lists the company. The LLM receives them with the evidence path behind each, live prices and 24-hour moves, and the current book, and decides per candidate: short or pass, conviction (which sets the size, 10–50% of the account), take-profit (1–10%) and holding period (24–168 h), with a written reason. If the model cannot be reached, nothing trades. |
| **Act** | The risk engine vets each order (caps per root cause, per headline and per symbol, plus a drawdown halt) and it is placed on Bitget's demo exchange. |
| **Exit** | Every open position is marked at Bitget's mark price each minute and closed by its hard 6% stop-loss, the LLM's take-profit or its holding period. Every 4 hours the LLM also reviews each open thesis against the news since entry and closes positions whose thesis no longer holds. |

## A live decision

Decision #2107, made by the agent on its own on 2026-10-07 at 13:02 UTC, end to end:

1. **Sense.** The news loop picked up "SK hynix Reportedly Faces Difficulties in HBM Hybrid Bonding, Trailing Samsung" (TechPowerUp).
2. **Reason.** The LLM named SK hynix as the directly hit company and scored a shock of 0.35 (MEDIUM, confidence 0.82), above the 0.25 floor.
3. **Propagate.** The graph offered SKHYUSDT, which Bitget's demo exchange lists, with a graph-implied move of −3.33%.
4. **Decide.** The LLM passed, with conviction 0.15: *"Shock is only medium (0.35) and sourced as 'reportedly' about hybrid bonding yields for future HBM rather than confirmed current production loss, while the price is already -6.88% in 24h, exceeding the graph-implied -3.33% move, so the risk/reward of a fresh short is poor."*
5. **Record.** Outcome `PASSED`; nothing traded. The decision, its reasoning, its trade call and the 0G provider that ran it are in [`/api/agent/decisions`](https://trycascadr.vercel.app/api/agent/decisions).

When the LLM says short, the order goes to Bitget's demo exchange through Agent Hub, and every fill appears in the [trading log](https://trycascadr.vercel.app/api/paper/log?format=csv).

## Verify it yourself

Everything the site shows is read from the running system; nothing is mocked. The public API serves the same data:

| Endpoint | What it shows |
| --- | --- |
| [`/judges`](https://trycascadr.vercel.app/judges) | One page for reviewers: the demo links, a real trade traced from the log, the stats and every endpoint below |
| [`/api/paper/log?format=csv`](https://trycascadr.vercel.app/api/paper/log?format=csv) | The trading log, one row per fill: timestamp, instrument, direction, price, quantity, fee, balance change and balance after (JSON without `format=csv`) |
| [`/api/health`](https://trycascadr.vercel.app/api/health) | Agent state, last cycle, LLM, news feed, exit loop, paper venue |
| [`/api/agent/decisions`](https://trycascadr.vercel.app/api/agent/decisions) | Every decision - including every refusal - with the headline, article link, LLM reasoning, uncertainty, 0G provider and implied exposures |
| [`/api/positions`](https://trycascadr.vercel.app/api/positions) | The paper book, each position with its venue, fills, fees and P&L |
| [`/api/venue`](https://trycascadr.vercel.app/api/venue) | **Bitget's own view** of the demo account: balances and open positions |
| [`/api/paper/report`](https://trycascadr.vercel.app/api/paper/report) | Paper performance: return, Sharpe, max drawdown, win rate, closed trades |
| [`/api/paper/equity`](https://trycascadr.vercel.app/api/paper/equity) | The equity time series, one point per minute (large: several MB) |
| [`/api/graph`](https://trycascadr.vercel.app/api/graph) | The supply-chain graph with every link's sources and filing facts |
| [`/api/risk`](https://trycascadr.vercel.app/api/risk) | Risk limits, cluster utilisation, drawdown |

## Paper trading on Bitget

Paper trades are placed on **Bitget's demo exchange** **through Bitget Agent Hub**: Cascadr runs Bitget's official agent MCP server, [`@bitget-ai/bitget-agent-mcp`](https://github.com/Bitget-AI/agent-mcp), in `--paper-trading` mode on its server and places every order through its `order` tool, with a Demo API key. If the Agent Hub process fails mid-call, the order is looked up on Bitget by its client order id before anything is re-sent through the native v3 API, so it can never fill twice; each fill records which path it took. Bitget fills each order and keeps the order, position and P&L record; Cascadr books exactly what Bitget reports (average fill price, quantity and fees) and `GET /api/venue` exposes Bitget's view of the account for cross-checking.

| | |
| --- | --- |
| **Instruments** | Bitget USDT-margined stock perpetuals. Bitget's demo exchange lists **8 of the graph's 15 stocks**: NVDA, AAPL, TSLA, Samsung, SK Hynix, Alphabet, Meta and Amazon. Exposures to the others (TSMC, AMD, Qualcomm, Broadcom, Dell, ASML, Sony) are recorded in each decision as `NOT_ON_VENUE` and not traded. |
| **Paper account** | 49,756.27 USDT of demo funds. Position sizes and risk caps scale with this figure. |
| **Paper record** | Cascadr's equity journal runs from **2026-09-24** (fills simulated at Bitget's live prices); trades go to Bitget's demo exchange from **2026-10-06**. |
| **Setup orders** | On 2026-10-06, while the venue was being connected, the Bitget demo history recorded a 0.06 NVDA round trip (a deliberate end-to-end test) and an unintended 607.5 NVDA short opened by a local test run and closed minutes later. On 2026-10-07 a 0.03 NVDA round trip tested the Agent Hub order path live (about 0.01 USDT of fees). None was an agent decision; none is in Cascadr's book. |

Real-money trading is implemented but disabled: it requires a separate live key and an explicit configuration change, and the team's submission is paper-only.

## The knowledge graph

**19 companies and 24 supply links**, every one with the evidence behind its number ([`backend/app/graph/data/edges.json`](backend/app/graph/data/edges.json)): sources (URL, publisher, date and a quote that appears on the page), the reasoning from source to figure, an as-of date, a confidence grade, caveats and any counter-evidence.

| Provenance | Meaning | Links |
| --- | --- | --- |
| `DISCLOSED` | The share is stated in a filing (e.g. AMD's 10-K: TSMC makes *all* its CPU and GPU wafers at 7 nm and below) | 2 |
| `REPORTED` | A specific share published by a named analyst or outlet | 4 |
| `QUALITATIVE` | The relationship is sourced but only described in words; the number comes from one fixed rule: sole 0.95, primary 0.70, one of two 0.50, one of several 0.25 | 18 |

- The original 19 links were researched from primary pages and then re-checked by an independent verifier; the 5 links into Alphabet, Meta and Amazon (added 2026-10-07) were checked quote by quote against the raw pages, without a second verifier. Links nobody could source were **removed, not guessed** - Lynas→Sony and Maersk→Apple/Dell - which took Lynas and Maersk out of the graph.
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

- **Shock floor 0.25 - which headlines get a trade decision.** When fixed rules turned exposures into orders, the floor alone had to separate disruption from noise, so calibration put it at 0.40, between the two; in 13 days of live news only one headline cleared it. Since 2026-10-07 the LLM makes the trade call itself, so the floor no longer decides trades: it decides which headlines are worth a trade decision. At 0.25 that includes company-specific bad news (0.25–0.33, such as Apple's iPhone cellular defect or Tesla's falling quarterly sales), and the LLM can pass on any of it, with its reason recorded.
- **Trade threshold 0.18** trades the Hualien-earthquake and Foxconn-lockdown names on every call. The previous 0.32 dated from guessed graph weights and would have traded none of them.

[`tests/test_calibration.py`](backend/tests/test_calibration.py) pins this: if the graph or thresholds change, it says whether the agent would still trade the events its own research supports.

## Operator replays

On 2026-10-07, with no trade yet in the paper record, the operator replayed three real headlines from the previous week through the agent with `POST /agent/replay`. These replays ran a few hours before the LLM took over the trade call, so their size and exits came from the earlier score-based rules. A replay takes only a headline the agent itself collected (never free text), sends it to the LLM again, and runs the result through the graph, the risk engine and Bitget's demo exchange like any other decision. The LLM still decides:

| Original decision | Headline | LLM shock | Outcome |
| --- | --- | --- | --- |
| #1659 (Macworld, 5 Oct) | Apple's iPhone 18 Pro Max recall | 0.45 | Short AAPLUSDT on Bitget demo |
| #1438 (WSJ, 2 Oct) | Tesla sales fell in the third quarter | 0.25 | Short TSLAUSDT on Bitget demo |
| #1330 (Bloomberg, 1 Oct) | China chip smuggling cases expose Nvidia's blind spots | 0.15 | Declined |

Each replay is logged as a new decision whose source reads "Operator replay (...)", with the original link and publish time, and the positions it opened carry `source: "manual"`. They are operator-initiated, not autonomous: judge the autonomous agent by the decisions and positions marked `agent`.

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

Each decision is stored with: the headline and article link; the LLM's named entities, shock, severity, confidence, reasoning and stated uncertainty; the 0G provider that ran the inference; every implied exposure with the exact links and constants its score was multiplied from; the LLM's trade call on each candidate (short or pass, conviction, target, hold and reason); and an outcome that names what happened - `TRADED`, `DECLINED`, `PASSED`, `BLOCKED_BY_RISK`, `REJECTED_BY_VENUE`, `NOT_ON_VENUE`, `NO_MARKET_PRICE`, `ALREADY_HOLDING`, `NO_TRADABLE_EXPOSURE` or `EXECUTION_FAILED`.

The landing page's *A real decision* section rebuilds one decision's arithmetic from those stored factors. In the terminal, clicking a company shows every supply link's sources, quotes, caveats and counter-evidence.

## Role of the LLM

| | |
| --- | --- |
| **Model** | `claude-opus-5`, served through **0G Private Computer** (`router-api.0g.ai`) |
| **1. Reads the news** | For each headline: which graph company it directly disrupts (checked against the graph, never trusted), the shock (0–1), severity, confidence, reasoning and what would change its mind |
| **2. Makes the trade call** | For the candidate shorts the sourced graph derives: short or pass, conviction (sets the size), take-profit and holding period, each with a written reason |
| **3. Manages open positions** | Every 4 hours, reviews each open thesis against the news since entry and closes positions whose thesis no longer holds |
| **Guardrails, not decisions** | Code limits what it can choose: only graph-supported, venue-listed candidates; clamped bounds; the risk engine's caps; a hard 6% stop-loss; no trade if the model cannot be reached |
| **Audit** | Every call is recorded with its output, and the 0G provider that executed it |

## Architecture

```
Browser ──► Vercel: Next.js site (trycascadr.vercel.app)
                └── /api/* rewrite ──► VPS: Caddy (TLS) ──► FastAPI agent (127.0.0.1:8010)

FastAPI agent
├── news loop (10 min) ── Google News RSS ── LLM oracle (0G) ── graph traversal ── LLM trade call ── risk ── Agent Hub ── Bitget demo
├── exit loop (60 s) ──── Bitget marks ───── exit rules ─────── Bitget demo
├── review loop (4 h) ─── news since entry ── LLM thesis review ── Bitget demo (close)
└── SQLite (WAL, serialised) - decisions, headlines, positions, events, equity journal
```

| Layer | Technology |
| --- | --- |
| Frontend | Next.js 14 (App Router, standalone build), React 18, Tailwind CSS, react-force-graph-2d |
| Backend | Python 3.12, FastAPI, httpx, pydantic-settings, SQLite |
| Market data | Bitget public API v2 (live quotes and mark prices) |
| Execution | Bitget Agent Hub (`@bitget-ai/bitget-agent-mcp`, `--paper-trading`) over MCP stdio, Demo Trading environment; native v3 Unified Account API for fills and as a duplicate-safe fallback |
| LLM | `claude-opus-5` via 0G Private Computer |
| Hosting | Site on Vercel; agent on an Ubuntu VPS (systemd, Caddy with automatic TLS); Agent Hub runs beside it as a Node subprocess |

```
app/                       landing page (server-rendered from the API) and terminal
components/                graph canvas, terminal panels, landing sections
hooks/useCascadr.ts        live polling of the API
lib/                       API client and response types
backend/app/agent.py       the autonomous loop: sense → reason → propagate → decide → act
backend/app/trader.py      the LLM's trade call and its thesis review of open positions
backend/app/traversal.py   contagion scoring and the calibrated thresholds
backend/app/risk.py        portfolio risk limits
backend/app/portfolio/     position store, lifecycle, exits, equity journal
backend/app/market/        Bitget market data, Agent Hub client, Bitget demo execution, local simulator
backend/app/graph/         the sourced graph (data/edges.json, data/filing_facts.json)
backend/app/ingest/        news feeds, LLM oracle, SEC EDGAR extraction
backend/research/          event study, calibration, verified events
backend/tests/             154 tests
video/                     the demo film (Remotion, ElevenLabs), see video/README.md
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

To place demo orders through Bitget Agent Hub, install it (`npm i @bitget-ai/bitget-agent-mcp@3.3.1`) and set `CASCADR_AGENT_HUB_ENTRY` to its `lib/index.js`, with a Demo API key in `BITGET_DEMO_*`; without it, orders go through the native v3 client.

Deployment is described in [DEPLOY.md](DEPLOY.md); the backend in detail in [backend/README.md](backend/README.md).

## Demo film

A 2:50 film: the problem, the evidence, and Cascadr working live, including the live decision above. Watch it on [YouTube](https://www.youtube.com/watch?v=6W74-qPAj7c). It is built with [Remotion](https://www.remotion.dev) in [`video/`](video/), with narration, score and sound effects from ElevenLabs. Its README lists where every number, quote, clip and voice came from.

## Security

- Every endpoint that writes, trades or spends LLM credits requires an admin token, checked before the request body is read. Public endpoints are read-only; CORS allows `GET` only.
- Exchange and LLM keys live only in the server's environment file (mode 600) and are never sent to the browser or committed; `.env` is gitignored and the repository history holds none.
- The test suite runs with every exchange key blanked, so no test can reach a real or demo account.

## Limitations

- **Paper trading only.** No real funds are at risk.
- **Few tradable names on the demo venue.** Bitget's demo lists 8 of the graph's 15 stocks.
- **Trades are rare by design.** Most news is not a disruption, and the LLM declines it; when it is, the LLM may still pass, as in the live decision above.
- **No closed trade yet.** The two open positions (AAPL, TSLA) are operator replays from 2026-10-07, so win rate is not yet measurable and the Sharpe ratio covers hours of positions.
- **No Bitget market data in the trade call yet.** Bitget's market-data MCP returned 503 for every query on 2026-10-07; earnings dates and analyst targets are planned inputs.
- **First-order trades are not backtested.** The event study supports the downstream (second-order) drift. Shorting the directly hit company rests on the LLM's severity judgement and the calibrated shock floor; it was added on 2026-10-07 so the agent acts on disruptions to the companies Bitget's demo lists.
- **Small research sample.** Three verified events support the premise directionally; they do not prove it.
- **Headlines, not articles.** The LLM judges each headline, not the full article.
- **A small graph.** 19 companies in the electronics supply chain.

Nothing here is investment advice or a trading signal.

---

NetLayer Labs · Bitget AI Hackathon
