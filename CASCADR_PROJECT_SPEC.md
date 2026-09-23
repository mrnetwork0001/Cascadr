# 🌐 CASCADR — Supply Chain Knowledge Graph Arbitrage Agent

> **Bitget AI Hackathon: Build What Trades Next**  
> **Track:** Arbitrage (Cross-market correlation strategies)  
> **Target:** 🥇 1st Place ($3,000 + Spotlight Award)  
> **Core Tech Stack:** Next.js 14, Python (FastAPI), Neo4j (Knowledge Graph), LangChain/GraphRAG, Bitget API  
> **Author:** mrnetwork (NetLayer Labs)  

---

## 📌 Executive Summary

**Cascadr** is an institutional-grade, multi-agent AI system designed to trade downstream supply chain contagion on Bitget's 24/7 Tokenized U.S. Stock market.

Unlike retail trading bots that react to direct news (e.g., "Apple misses earnings -> short AAPL"), Cascadr uses **GraphRAG** (Graph Retrieval-Augmented Generation) to map the global supply chain. When a macro event occurs (e.g., a factory fire, a labor strike, or a geopolitical sanction), Cascadr traverses its Knowledge Graph to find exposed companies and executes preemptive short or long positions on Tokenized Stocks via the Bitget API *before* the human market prices in the contagion.

---

## 🏗️ System Architecture

### 1. The Multi-Agent Engine (Python / LangChain)
- **The Graph Builder Agent:** Ingests 10-K SEC filings and financial reports to build a Neo4j Knowledge Graph (e.g., `(Foxconn) -[SUPPLIES]-> (Apple)`).
- **The NLP News Oracle:** Monitors real-time news feeds (simulated for the hackathon). When news breaks, it passes the entity to the Graph.
- **The Execution Agent:** Uses the Bitget Playbook / Agent Hub API to automatically execute trades (e.g., Short Tokenized $AAPL if a critical supplier node goes offline).

### 2. The Dashboard (Next.js)
A highly professional "Bloomberg Terminal" aesthetic (dark mode, dense data, neon accents).
- **Interactive 3D Graph:** A visual representation of the Knowledge Graph using `react-force-graph` or similar libraries. Nodes light up red when contagion is detected.
- **Trade Log:** A real-time feed showing the Agent's reasoning: *"Detected TSMC delay -> Found 84% correlation to NVDA -> Executing Short on Bitget."*

---

## 🚀 Hackathon Submission Strategy
- **The "Wow" Factor:** The visual 3D Knowledge Graph reacting to live news is the ultimate demo. It proves that the AI actually *understands* the economy.
- **Integration:** Must utilize Bitget's Agent Hub or API to simulate the tokenized stock trades.
