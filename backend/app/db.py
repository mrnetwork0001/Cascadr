"""Serialised access to the shared SQLite connection.

The store, the journal, the feed reader and the agent share one connection
and reach it from asyncio.to_thread workers. sqlite3 caches one prepared
statement per SQL text, so two threads running the same query at once reset
each other's cursor: reads came back empty or half-read, and the equity
journal saved those wrong numbers. Every database call therefore runs here,
holding one lock for the whole call - execute, fetch and commit together - so
no call ever sees another's statement or transaction in progress.
"""

import asyncio
import threading
from collections.abc import Callable
from typing import Any

_LOCK = threading.RLock()


def locked(fn: Callable[..., Any], *args: Any) -> Any:
    with _LOCK:
        return fn(*args)


async def run(fn: Callable[..., Any], *args: Any) -> Any:
    """Run a synchronous database function in a worker thread, serialised."""
    return await asyncio.to_thread(locked, fn, *args)
