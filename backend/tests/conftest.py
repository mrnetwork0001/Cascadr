"""Tests never reach a real exchange account.

backend/.env may hold real Bitget keys (live or demo) for local runs. Settings
reads that file, so without this every test that starts the app would trade
on whatever account those keys open. Environment variables take precedence
over .env, so blanking them here disables the keys for every test; tests that
exercise Bitget pass their own credentials to a mocked transport.
"""

import pytest

EXCHANGE_KEYS = (
    "BITGET_API_KEY", "BITGET_API_SECRET", "BITGET_PASSPHRASE",
    "BITGET_DEMO_API_KEY", "BITGET_DEMO_API_SECRET", "BITGET_DEMO_PASSPHRASE",
)


@pytest.fixture(autouse=True)
def no_exchange_keys(monkeypatch):
    for k in EXCHANGE_KEYS:
        monkeypatch.setenv(k, "")
    from app.config import get_settings

    get_settings.cache_clear()
    yield
    get_settings.cache_clear()
