"""Trade alerts, pushed to the operator's phone.

Uses ntfy (https://ntfy.sh): the server POSTs a message to a private topic and
anyone subscribed to that topic - the ntfy phone app, or the topic's web page -
gets a push notification. No account is needed; the topic name is the secret,
so it should be long and random (CASCADR_ALERT_NTFY_TOPIC).

An alert must never get in the way of trading: sending is best-effort, bounded
by a short timeout, and any failure is logged and swallowed.
"""

import httpx

from app.config import Settings


class Alerts:
    def __init__(self, settings: Settings, client: httpx.AsyncClient | None = None):
        self._s = settings
        self._client = client or httpx.AsyncClient(timeout=8.0)
        self.sent = 0
        self.failed = 0

    @property
    def configured(self) -> bool:
        return bool(self._s.cascadr_alert_ntfy_topic)

    async def aclose(self) -> None:
        await self._client.aclose()

    async def send(self, title: str, message: str, tags: str = "", priority: str = "default") -> bool:
        if not self.configured:
            return False
        server = self._s.cascadr_alert_ntfy_server.rstrip("/")
        headers = {
            # HTTP header values must be plain ASCII.
            "Title": title.encode("ascii", "replace").decode(),
            "Priority": priority,
        }
        if tags:
            headers["Tags"] = tags
        if self._s.cascadr_public_url:
            headers["Click"] = self._s.cascadr_public_url.rstrip("/") + "/terminal"
        try:
            r = await self._client.post(
                f"{server}/{self._s.cascadr_alert_ntfy_topic}",
                content=message.encode("utf-8"),
                headers=headers,
            )
            r.raise_for_status()
            self.sent += 1
            return True
        except Exception as exc:
            self.failed += 1
            print(f"[alerts] not sent ({type(exc).__name__})", flush=True)
            return False
