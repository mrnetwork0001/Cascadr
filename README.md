# CASCADR

**Supply Chain Knowledge Graph Arbitrage Agent** — Bitget AI Hackathon (Arbitrage track).

Cascadr maps the global electronics supply chain as a knowledge graph, then trades
*downstream contagion*: when an upstream node is disrupted, it traverses the graph to
find exposed listed companies and shorts their Bitget tokenized equities before the
market prices the second-order effect in.

---

## Status

The frontend terminal plus a Python backend that scores contagion server-side,
reads **live** Bitget market data, and extracts **real** SEC filing disclosures.
Orders are built against real stock-perp contracts but held behind a paper-trading
gate. Neo4j is scaffolded but not populated, and supply-side dependency weights
are still curated estimates.

> **Instruments:** shorting requires Bitget **stock perpetual futures**
> (`NVDAUSDT`), not tokenized xStocks (`NVDAx`) — those are spot-only and cannot
> be shorted.

| Layer | State |
| --- | --- |
| Next.js 14 terminal UI | ✅ built |
| Force-directed knowledge graph | ✅ built (mock topology) |
| Contagion traversal + scoring | ✅ built (runs client-side over the mock graph) |
| Agent execution log + Bitget order bodies | ✅ built (payloads are shaped, not sent) |
| Python backend (FastAPI) | ✅ built — see [backend/](backend/) |
| Bitget market data | ✅ live (public API, no key needed) |
| SEC EDGAR filing ingestion | ✅ built — real 10-K extraction with citations |
| Bitget order execution | ✅ built, **paper-gated** — never sends by default |
| Neo4j store | ⬜ repository + schema written, not populated |
| Premise backtest | ✅ event study — see [backend/research/](backend/research/) |
| Terminal ↔ backend | ✅ live, with local fallback when the service is down |

---

## Run it

```bash
npm install
npm run dev
```

| Route | What it is |
| --- | --- |
| `/` | Landing page — the thesis, the pipeline, a worked cascade, and the build status |
| `/terminal` | The live terminal |

Open the printed URL and hit **Launch terminal**, then **RUN SCENARIO** in the top right.

### What the demo does

1. **NLP News Oracle** ingests a scripted wire feed (M6.4 quake → TSMC Fab 18 offline)
   and resolves the headline to graph entities.
2. **Traversal** walks the downstream cone from the shocked node up to 3 hops,
   multiplying edge dependencies and decaying per hop.
3. **Graph** cascades outward one hop at a time — nodes escalate
   `NOMINAL → WATCH → STRESSED → CRITICAL`, and the active route animates in red.
4. **Execution agent** shorts every exposed name above the trade threshold, printing
   the Bitget `POST /api/v2/mix/order` body it would send (click **body** on any
   `EXEC` line to expand it).
5. **Positions blotter** marks to a live tape that drifts down in proportion to each
   name's exposure, so P&L follows from the thesis rather than being decoration.

**RESET** returns the graph to nominal and clears the book.

---

## Architecture

```
app/page.tsx              landing page (server component)
app/terminal/page.tsx     single-screen terminal layout
hooks/useCascadrEngine.ts scenario state machine: news → traversal → orders → P&L
lib/traversal.ts          contagion propagation + exposure scoring
lib/mock/graph.ts         the knowledge graph (stand-in for Neo4j)
lib/mock/scenario.ts      the scripted wire feed (stand-in for a news socket)
lib/types.ts              domain model — the contract the Python backend will fill
components/graph/         force-directed canvas, legend, node inspector
components/panels/        news oracle, exposure ranking, execution log, blotter
components/landing/       hero graph preview, section shell, launch CTA
```

### Swapping mocks for the real thing

The mock boundary is deliberately narrow — three files:

- `lib/mock/graph.ts` → replace with a fetch against Neo4j. `GraphNode` maps to a
  `:Company` node and `GraphEdge` to a `[:SUPPLIES]` relationship.
- `lib/mock/scenario.ts` → replace with a websocket subscription to the live news feed.
- `useCascadrEngine.submitOrder` → replace the logged payload with a real call to the
  Bitget Agent Hub. The body it already builds is the request shape.

`lib/traversal.ts` is real logic, not a mock: exposure scores are computed from the
graph, so editing dependencies in `graph.ts` changes what the agent trades.

---

## Notes on the data

Node revenues and the supply-chain topology are real and public
(ASML → TSMC → fabless designers → assemblers → brands). The `dependency` weights are
illustrative estimates, not sourced figures, and the tokenized symbols follow the
xStocks convention (`NVDAX`, `AAPLX`) used for tokenized equities.

Prices in this build are seeded constants with a random walk on top. Nothing here is
a trading signal.

---

NetLayer Labs · Bitget AI Hackathon
