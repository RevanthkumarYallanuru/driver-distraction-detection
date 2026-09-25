"""
TelemetryService — WebSocket fan-out.

Message types sent to the browser (all JSON):
  {"type": "hello",        "events": [...], "alerts": [...], "announcement": {...}|null}
  {"type": "telemetry",    ...state...}            every tick (~10 Hz)
  {"type": "announcement", "announcement": {...}}  immediately on alert (visual + voice)
  {"type": "alert",        ...AlertLogEntry...}    immediately, for "Recent Alerts"
  {"type": "event",        ...Event...}            immediately on vehicle/system event
"""

import asyncio
import itertools
import json
import logging
from collections import deque
from datetime import datetime, timezone
from typing import Callable, Deque, Optional, Set

from fastapi import WebSocket

log = logging.getLogger(__name__)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class TelemetryService:

    def __init__(self, history: int = 60, on_record: Optional[Callable[[str, dict], None]] = None):
        self._clients: Set[WebSocket] = set()
        self._events: Deque[dict] = deque(maxlen=history)
        self._alerts: Deque[dict] = deque(maxlen=history)
        self._event_ids = itertools.count(1)
        self._alert_ids = itertools.count(1)
        self._on_record = on_record
        self.latest: Optional[dict] = None
        self.last_announcement: Optional[dict] = None

    @property
    def client_count(self) -> int:
        return len(self._clients)

    @property
    def events(self) -> list:
        return list(self._events)

    @property
    def alerts(self) -> list:
        return list(self._alerts)

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self._clients.add(websocket)
        await websocket.send_text(json.dumps({
            "type": "hello",
            "events": list(self._events),
            "alerts": list(self._alerts),
            "announcement": self.last_announcement,
        }))
        if self.latest is not None:
            await websocket.send_text(json.dumps(self.latest))

    def disconnect(self, websocket: WebSocket) -> None:
        self._clients.discard(websocket)

    def _record(self, kind: str, entry: dict) -> None:
        if self._on_record:
            try:
                self._on_record(kind, entry)
            except Exception:
                log.exception("record hook failed")

    def make_event(self, kind: str, message: str, level: str = "INFO") -> dict:
        event = {
            "type": "event",
            "id": next(self._event_ids),
            "kind": kind,
            "message": message,
            "level": level,
            "timestamp": _now_iso(),
        }
        self._events.append(event)
        self._record("event", event)
        return event

    def make_alert(self, alert_type: str, message: str, level: str) -> dict:
        """An entry for the dashboard's "Recent Alerts" list."""
        entry = {
            "type": "alert",
            "id": next(self._alert_ids),
            "alert_type": alert_type,
            "message": message,
            "level": level,
            "timestamp": _now_iso(),
        }
        self._alerts.append(entry)
        self._record("alert", entry)
        return entry

    async def broadcast(self, message: dict) -> None:
        if message.get("type") == "telemetry":
            self.latest = message
        elif message.get("type") == "announcement":
            self.last_announcement = message["announcement"]

        if not self._clients:
            return

        text = json.dumps(message)
        dead = []

        async def send(ws: WebSocket) -> None:
            try:
                await asyncio.wait_for(ws.send_text(text), timeout=1.0)
            except Exception:
                dead.append(ws)

        await asyncio.gather(*(send(ws) for ws in list(self._clients)))

        for ws in dead:
            self._clients.discard(ws)
