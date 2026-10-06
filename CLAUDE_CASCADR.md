# 🛡️ CLAUDE Context Directives - CASCADR

Please read `CASCADR_PROJECT_SPEC.md` to fully understand the system architecture and the Bitget Hackathon goals.

We are building a highly professional, institutional-grade AI Trading Dashboard called **Cascadr**. It uses GraphRAG to map supply chains and trade downstream contagion on Bitget.

### Instructions for Claude Code:
1. Initialize a full-stack Next.js 14 application using the App Router.
2. Set up the UI layout using Tailwind CSS. It should have a strict "Bloomberg Terminal" aesthetic (dark mode, dense data, monospace fonts, neon red/green indicators).
3. Scaffold a Python backend (FastAPI) structure that will eventually handle the Neo4j Knowledge Graph and LangChain logic.
4. For the Next.js frontend, implement a mock `react-force-graph` (or similar visual graph library) component that visualizes a basic supply chain (e.g., TSMC -> Apple, Foxconn -> Apple).
5. Build a side-panel "Execution Log" that mocks the Bitget Agent Hub triggering a short position when a node on the graph turns red.

Let's begin by scaffolding the Next.js app in this directory.
