"""Runtime configuration.

Every external dependency is optional. With an empty environment the service
still starts: it serves the in-memory seed graph, reads public Bitget market
data, and simulates every order. Credentials only widen what it may do.
"""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    neo4j_uri: str | None = None
    neo4j_user: str = "neo4j"
    neo4j_password: str | None = None

    bitget_api_key: str | None = None
    bitget_api_secret: str | None = None
    bitget_passphrase: str | None = None

    # Bitget Demo Trading key (created in Bitget's demo mode). When set, paper
    # trades are placed on Bitget's demo exchange instead of being simulated
    # here, so Bitget keeps the paper-trading record. No real funds.
    bitget_demo_api_key: str | None = None
    bitget_demo_api_secret: str | None = None
    bitget_demo_passphrase: str | None = None

    # Deliberately a string, not a bool: pydantic would coerce "0"/"no"/"" into
    # False and silently arm live trading. Only the exact word "false" disarms.
    cascadr_paper_trading: str = "true"

    cascadr_max_order_usdt: float = 250.0

    sec_user_agent: str = "Cascadr Research contact@example.com"

    # LLM gateway. OpenAI-compatible /chat/completions - works with 0G Compute,
    # OpenRouter, Together, vLLM, LiteLLM. Unset: the oracle falls back to
    # deterministic matching and says so in the trace.
    llm_base_url: str | None = None
    llm_api_key: str | None = None
    llm_model: str | None = None
    llm_provider: str = "0g-compute"
    # "auto" picks by model name: claude-* -> anthropic, else openai.
    # 0G rejects Claude models on its OpenAI-format endpoint, so this matters.
    llm_api_format: str = "auto"
    # "" (standard), "verified" (attestable providers only) or "private" (TEE).
    # Opt-in: verified restricts availability as well as raising assurance.
    llm_trust_mode: str = ""

    # --- autonomy ---------------------------------------------------------
    # Must be exactly "true" to arm. Same string-not-bool reasoning as the
    # paper-trading gate: a stray "0" must never start an autonomous trader.
    cascadr_autonomous: str = "false"
    cascadr_poll_seconds: int = 600
    # Shock below this never reaches the risk layer.
    # Calibrated: research/README.md "Calibrating the agent".
    cascadr_shock_floor: float = 0.40
    # First-order trades: also short the company a headline names as directly
    # disrupted (shock at or above the floor), not only its downstream.
    cascadr_trade_origin: str = "true"
    cascadr_max_llm_per_hour: int = 60
    cascadr_news_max_age_hours: float = 6.0

    # Comma-separated origins allowed to call this API. The deployed frontend
    # must be listed here or the browser blocks every request.
    cascadr_cors_origins: str = "http://localhost:4010,http://127.0.0.1:4010"

    # SQLite location. In Docker this points at a mounted volume so the book
    # and the paper journal survive a redeploy.
    cascadr_db: str = "cascadr.db"

    # Required on every state-changing endpoint (X-Admin-Token header). Unset
    # means those endpoints are disabled outright - they spend LLM credits and
    # move the paper book, so they must never be open to anonymous callers.
    cascadr_admin_token: str | None = None

    # Starting balance of the paper account, USDT. A configuration of the
    # simulated account, not market data.
    cascadr_paper_equity: float = 100_000.0

    @property
    def paper_trading(self) -> bool:
        return self.cascadr_paper_trading.strip().lower() != "false"

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.cascadr_cors_origins.split(",") if o.strip()]

    @property
    def autonomous(self) -> bool:
        return self.cascadr_autonomous.strip().lower() == "true"

    @property
    def trade_origin(self) -> bool:
        return self.cascadr_trade_origin.strip().lower() == "true"

    @property
    def demo_configured(self) -> bool:
        return all(
            (self.bitget_demo_api_key, self.bitget_demo_api_secret, self.bitget_demo_passphrase)
        )

    @property
    def paper_venue(self) -> str:
        """Where paper trades are filled: Bitget's demo exchange when its key
        is configured, otherwise Cascadr's own simulator."""
        return "bitget-demo" if self.demo_configured else "cascadr-sim"

    @property
    def has_trading_credentials(self) -> bool:
        return all(
            (self.bitget_api_key, self.bitget_api_secret, self.bitget_passphrase)
        )

    @property
    def neo4j_enabled(self) -> bool:
        return bool(self.neo4j_uri and self.neo4j_password)


@lru_cache
def get_settings() -> Settings:
    return Settings()
