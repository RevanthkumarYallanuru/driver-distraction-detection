"""
TelemetryService — WebSocket fan-out.

Message types sent to the browser (all JSON):
  {"type": "hello",        "events": [...], "announcement": {...}|null}
  {"type": "telemetry",    ...state...}         every tick (~10 Hz)
  {"type": "announcement", "announcement": {...}}  immediately on alert
  {"type": "event",        ...Event...}         immediately on event
"""

import asyncio
import itertools
import json
import logging
from collections import deque
from datetime import datetime, timezone
from typing import Deque, Optional, Set

from fastapi import WebSocket

log = logging.getLogger(__name__)


class TelemetryService:

    def __init__(self, history: int = 60):
        self._clients: Set[WebSocket] = set()
        self._events: Deque[dict] = deque(maxlen=history)
        self._ids = itertools.count(1)
        self.latest: Optional[dict] = None
        self.last_announcement: Optional[dict] = None

    @property
    def client_count(self) -> int:
        return len(self._clients)

    @property
    def events(self) -> list:
        return list(self._events)

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self._clients.add(websocket)
        await websocket.send_text(json.dumps({
            "type": "hello",
            "events": list(self._events),
            "announcement": self.last_announcement,
        }))
        if self.latest is not None:
            await websocket.send_text(json.dumps(self.latest))

    def disconnect(self, websocket: WebSocket) -> None:
        self._clients.discard(websocket)

    def make_event(self, kind: str, message: str, level: str = "INFO") -> dict:
        event = {
            "type": "event",
            "id": next(self._ids),
            "kind": kind,
            "message": message,
            "level": level,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        self._events.append(event)
        return event

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
