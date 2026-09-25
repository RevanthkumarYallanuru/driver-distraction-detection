"""
AlertManager — decides WHEN and WHAT to announce.

Inputs : the set of temporally-validated conditions each tick.
Outputs: at most one Announcement per tick (visual + voice).

Rules
  * Several simultaneous conditions collapse into ONE critical alert,
    never several overlapping voices.
  * Priority (highest first): CRITICAL > DROWSINESS > PHONE > LOOKING_AWAY.
  * Each alert type has its own cooldown. While a condition persists
    it is repeated once per cooldown (V1 behaviour).
  * Escalation to a higher-severity alert bypasses the cooldown.
  * When every condition clears, "attention restored" is announced
    exactly once per distraction episode.
"""

import itertools
import time
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from typing import Dict, Iterable, Optional

from services.voice_service import VoiceService


@dataclass(frozen=True)
class AlertDefinition:
    type: str
    level: str          # NORMAL | INFO | WARNING | CRITICAL
    severity: int       # higher = more important
    title: str
    message: str
    voice: Optional[str]
    cooldown: float


def build_definitions(warning_cooldown: float, critical_cooldown: float,
                      restored_voice: bool) -> Dict[str, AlertDefinition]:
    return {
        "CRITICAL": AlertDefinition(
            "CRITICAL", "CRITICAL", 4,
            "CRITICAL DRIVER ALERT",
            "Multiple distraction indicators detected.",
            "Critical warning. Multiple signs of driver distraction detected.",
            critical_cooldown,
        ),
        "DROWSINESS": AlertDefinition(
            "DROWSINESS", "WARNING", 3,
            "DROWSINESS WARNING",
            "Eyes appear to be closed. Please stay alert.",
            "Warning. Your eyes appear to be closed. Please stay alert.",
            warning_cooldown,
        ),
        "PHONE": AlertDefinition(
            "PHONE", "WARNING", 2,
            "PHONE DETECTED",
            "Mobile phone usage detected.",
            "Warning. Mobile phone usage detected. Please focus on driving.",
            warning_cooldown,
        ),
        "LOOKING_AWAY": AlertDefinition(
            "LOOKING_AWAY", "WARNING", 1,
            "DRIVER DISTRACTION",
            "Please keep your eyes on the road.",
            "Warning. Please keep your eyes on the road.",
            warning_cooldown,
        ),
        "ATTENTION_RESTORED": AlertDefinition(
            "ATTENTION_RESTORED", "NORMAL", 0,
            "DRIVER ATTENTION RESTORED",
            "Driver attention restored. Resuming normal speed.",
            "Driver attention restored." if restored_voice else None,
            0.0,
        ),
    }


PRIORITY = ("DROWSINESS", "PHONE", "LOOKING_AWAY")


@dataclass
class Announcement:
    id: int
    type: str
    level: str
    severity: int
    title: str
    message: str
    voice: Optional[str]
    spoken: bool
    conditions: list
    timestamp: str
    detail: Optional[str] = None   # e.g. "Vehicle slowing to 30 km/h"

    def to_dict(self) -> dict:
        return asdict(self)


class AlertManager:

    def __init__(self, definitions: Dict[str, AlertDefinition],
                 voice: Optional[VoiceService] = None):
        self.definitions = definitions
        self.voice = voice

        self._ids = itertools.count(1)
        self._current: Optional[str] = None
        self._last_announced: Dict[str, float] = {}
        self._episode_active = False
        self.last_announcement: Optional[Announcement] = None

    @staticmethod
    def resolve(conditions: Iterable[str]) -> Optional[str]:
        active = [c for c in PRIORITY if c in set(conditions)]
        if len(active) >= 2:
            return "CRITICAL"
        if active:
            return active[0]
        return None

    @property
    def current(self) -> Optional[AlertDefinition]:
        return self.definitions.get(self._current) if self._current else None

    def update(self, conditions: Iterable[str],
               now: Optional[float] = None) -> Optional[Announcement]:
        now = time.monotonic() if now is None else now
        conditions = list(conditions)
        resolved = self.resolve(conditions)
        previous = self._current
        self._current = resolved

        if resolved is None:
            if self._episode_active:
                self._episode_active = False
                return self._announce("ATTENTION_RESTORED", conditions, now)
            return None

        self._episode_active = True
        definition = self.definitions[resolved]
        since_last = now - self._last_announced.get(resolved, float("-inf"))

        escalated = (
            previous is not None
            and resolved != previous
            and definition.severity > self.definitions[previous].severity
        )

        if escalated or since_last >= definition.cooldown:
            return self._announce(resolved, conditions, now)

        return None

    def _announce(self, alert_type: str, conditions: list, now: float) -> Announcement:
        definition = self.definitions[alert_type]
        self._last_announced[alert_type] = now

        spoken = False
        if definition.voice and self.voice is not None:
            spoken = self.voice.submit(definition.voice, definition.severity)

        announcement = Announcement(
            id=next(self._ids),
            type=definition.type,
            level=definition.level,
            severity=definition.severity,
            title=definition.title,
            message=definition.message,
            voice=definition.voice,
            spoken=spoken,
            conditions=conditions,
            timestamp=datetime.now(timezone.utc).isoformat(),
        )
        self.last_announcement = announcement
        return announcement
