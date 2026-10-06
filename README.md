# CASCADR

**An autonomous, event-driven trading agent** — Bitget AI Hackathon, Agentic
Trading → Event-driven Agent track.

Cascadr reads live news about the companies in the electronics supply chain.
When a headline signals a disruption, an LLM judges how severe it is, a
source-cited supply-chain graph works out which downstream companies are
exposed, and the agent paper-trades Bitget stock perpetuals against them. Every
decision, including every refusal, is recorded with its reasoning.

> **Paper trading only.** No exchange keys are configured and no order is ever
> sent. Fills are simulated at Bitget's live prices with modelled slippage.
> Nothing here is a trading signal.

---

## What is real

Everything the site shows comes from the running system. There is no demo mode,
no scripted feed and no fallback data: if the API is unreachable, the UI says so.

| Layer | What runs |
| --- | --- |
| News | Google News RSS, one query per company, every 10 minutes |
| Oracle | `claude-opus-5` via 0G Private Computer; each call records the 0G provider that ran it |
| Graph | 16 companies, 19 links, each with cited sources — see [backend/app/graph/data/edges.json](backend/app/graph/data/edges.json) |
| Contagion | server-side, 3-hop traversal: `shock × ∏ dependency × 0.62^hops` |
| Market data | Bitget public API — live quotes and mark prices for stock perps |
| Portfolio | paper book in SQLite, marked to Bitget's mark price every minute, cluster/symbol caps, drawdown halt, stop-loss / take-profit / time stop |
| Execution | paper orders on Bitget's demo exchange (Demo Trading, no real funds), which fills and records them; without a demo key, fills are simulated at Bitget's live prices. Real-money order signing exists but is gated off |

### Where the numbers come from

- **Supply-chain links.** Each link carries its evidence class, the sources
  behind it (URL, publisher, date and a quote that appears on the page), the
  reasoning from source to number, caveats and any counter-evidence.
  - `DISCLOSED` — the share is stated in a filing (e.g. AMD's 10-K: TSMC makes
    *all* its CPU and GPU wafers at 7nm and below).
  - `REPORTED` — a specific share published by a named analyst or outlet.
  - `QUALITATIVE` — the relationship is sourced but only described in words;
    the number comes from one fixed rule: sole 0.95, primary 0.70, one of two
    0.50, one of several 0.25.

  Links nobody could source were removed; the file lists them and why.
- **Company size** is the latest fiscal year's revenue from the income
  statement, converted to USD at the fiscal-year-end rate.
- **Prices** are Bitget's.
- **Decisions** are the LLM's, on real headlines, stored with the article link.

---

## Run it

The frontend proxies `/api` to a backend (the deployed one by default; set
`BACKEND_URL` to point elsewhere):

```bash
npm install
npm run dev -- -p 4010
```

The backend is in [backend/](backend/) — see its README.

| Route | What it is |
| --- | --- |
| `/` | Landing page, rendered from live API data |
| `/terminal` | The live terminal: news and verdicts, the graph coloured by the selected decision, the agent log, the paper book, the Bitget tape |

---

## Layout

```
app/page.tsx              landing page (server component, reads the API)
app/terminal/page.tsx     the terminal
hooks/useCascadr.ts       polls the API: quotes 5s, positions 10s, feed 15s
lib/api.ts                API client — no fallback data
lib/types.ts              the API's response shapes
components/graph/         force-directed canvas, legend, node inspector
components/panels/        news oracle, exposure ranking, agent log, positions
components/terminal/      top bar (live tape, agent state), status bar
backend/app/agent.py      the autonomous loop: sense → reason → propagate → act
backend/app/graph/        the sourced graph
backend/research/         the event study behind the premise
```

---

## Does the premise hold?

[backend/research/](backend/research/) runs an event study over three
verified historical disruptions (seven company pairs): downstream names barely
moved on the day of the news, then drifted lower over the following week,
surviving a semiconductor-sector control. Three is far too few to call it
proven, and five of the pairs share one earthquake; the README there lists
every caveat, and the events that were dropped after checking.

---

NetLayer Labs · Bitget AI Hackathon
