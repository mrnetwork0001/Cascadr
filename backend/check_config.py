"""Configuration check.

Run after editing .env:

    ./.venv/bin/python check_config.py

Reports what is configured and then actually exercises the LLM with a real
headline, because "the key is set" and "the endpoint works" are different
claims and only the second one matters.
"""

import asyncio
import sys

from app.config import get_settings
from app.graph.seed import NODES
from app.ingest.oracle import NewsOracle
from app.llm.client import LLMClient

OK, WARN, BAD = "\033[92m✓\033[0m", "\033[93m!\033[0m", "\033[91m✗\033[0m"

PROBE = (
    "M7.4 earthquake strikes Hualien; TSMC halts 3nm production at Fab 18, "
    "quarterly guidance withdrawn"
)


async def main() -> int:
    s = get_settings()
    print("\n── Cascadr configuration ──────────────────────────────────\n")

    # --- safety first ----------------------------------------------------
    if s.paper_trading:
        print(f"{OK} PAPER TRADING ON - orders are simulated, nothing is sent")
    else:
        print(f"{BAD} LIVE TRADING ARMED - CASCADR_PAPER_TRADING is exactly 'false'")
        print("   Real orders will be sent if Bitget credentials are present.")
        print(f"   Per-order cap: {s.cascadr_max_order_usdt:,.0f} USDT")

    # --- bitget ----------------------------------------------------------
    if s.has_trading_credentials:
        print(f"{OK} Bitget credentials present (needed only for orders + reconcile)")
    else:
        print(f"{WARN} Bitget credentials absent - market data still works (public API)")
        print("   /positions/reconcile will report 'cannot check', which is correct.")

    # --- neo4j -----------------------------------------------------------
    print(
        f"{OK} Neo4j configured" if s.neo4j_enabled
        else f"{WARN} Neo4j unset - using the curated seed graph"
    )

    # --- llm -------------------------------------------------------------
    llm = LLMClient(s)
    if not llm.configured:
        print(f"{BAD} LLM NOT CONFIGURED - set LLM_BASE_URL and LLM_MODEL in .env")
        print("   The oracle will fall back to keyword matching and label itself")
        print("   'heuristic'. This is the single biggest gap for the Agentic track.")
        await llm.aclose()
        print()
        return 1

    print(f"{OK} LLM configured: {s.llm_model} @ {s.llm_base_url}")
    if not s.llm_api_key:
        print(f"{WARN} LLM_API_KEY is empty - fine if your endpoint is unauthenticated")

    print(f"\n── Live probe ─────────────────────────────────────────────\n")
    print(f'Headline: "{PROBE}"\n')

    verdict = await NewsOracle(llm).analyse(PROBE, NODES)
    await llm.aclose()

    if verdict.engine != "llm":
        print(f"{BAD} The LLM call did NOT succeed. Oracle fell back to heuristic.")
        print(f"   Reason: {verdict.detail}")
        print("\n   Common causes:")
        print("     • LLM_BASE_URL includes /chat/completions (it must not)")
        print("     • LLM_BASE_URL is missing /v1")
        print("     • model string does not match what the provider expects")
        print("     • gateway needs a signed header rather than a bearer token")
        print()
        return 1

    print(f"{OK} LLM responded - engine=llm, model={verdict.model}")
    print(f"   entities   : {verdict.entities}")
    print(f"   shock      : {verdict.shock:.2f}  ({verdict.severity})")
    print(f"   confidence : {verdict.confidence:.2f}")
    print(f"   reasoning  : {verdict.reasoning}")
    print(f"   uncertainty: {verdict.uncertainty}")

    if not verdict.entities:
        print(f"\n{WARN} No entity resolved from a headline that names TSMC.")
        print("   The model may be ignoring the id list. Check the model string.")
        return 1
    if verdict.shock < 0.5:
        print(f"\n{WARN} Shock {verdict.shock:.2f} looks low for 'guidance withdrawn'.")
        print("   Expect ~0.8+. A weaker model may under-read severity - that is")
        print("   worth knowing before it sizes positions.")

    print(f"\n{OK} Oracle is live. Restart the backend to use it.\n")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
