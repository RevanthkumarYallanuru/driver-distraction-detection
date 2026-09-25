"""
DataLogger — records each monitoring session to a JSON Lines file:

    logs/session_YYYYmmdd_HHMMSS.jsonl

One line per record, with "kind" = "telemetry" (1 per second),
"alert" or "event". Useful for reports and offline analysis.
Writes are tiny and buffered; the file is flushed about once a second.
"""

import json
import logging
import time
from datetime import datetime
from pathlib import Path
from typing import Optional, TextIO

log = logging.getLogger(__name__)

# Telemetry fields worth keeping in the log (the rest is overlay data).
TELEMETRY_FIELDS = (
    "timestamp", "speed", "target_speed", "vehicle_status", "driver_status",
    "head_direction", "head_yaw", "head_pitch", "ear",
    "eyes_state", "phone_score", "phone_detected", "drowsiness_detected",
    "looking_away", "distraction_detected", "alert_type", "alert_level",
)


class DataLogger:

    def __init__(self, directory: Path, enabled: bool = True, telemetry_interval: float = 1.0):
        self.directory = Path(directory)
        self.enabled = enabled
        self.telemetry_interval = telemetry_interval

        self._file: Optional[TextIO] = None
        self._path: Optional[Path] = None
        self._records = 0
        self._last_telemetry = 0.0
        self._last_flush = 0.0
        self._error: Optional[str] = None

    @property
    def recording(self) -> bool:
        return self._file is not None

    def status(self) -> dict:
        return {
            "enabled": self.enabled,
            "recording": self.recording,
            "file": self._path.name if self._path else None,
            "records": self._records,
            "error": self._error,
        }

    def start(self) -> None:
        if not self.enabled:
            return
        try:
            self.directory.mkdir(parents=True, exist_ok=True)
            name = datetime.now().strftime("session_%Y%m%d_%H%M%S.jsonl")
            self._path = self.directory / name
            self._file = self._path.open("a", encoding="utf-8")
            log.info("Data logging to %s", self._path)
        except OSError as error:
            self._error = f"Cannot open log file: {error}"
            self._file = None
            log.error(self._error)

    def stop(self) -> None:
        if self._file:
            try:
                self._file.close()
            finally:
                self._file = None

    def _write(self, kind: str, payload: dict) -> None:
        if self._file is None:
            return
        try:
            self._file.write(json.dumps({"kind": kind, **payload}) + "\n")
            self._records += 1
            now = time.monotonic()
            if now - self._last_flush >= 1.0:
                self._file.flush()
                self._last_flush = now
        except (OSError, ValueError) as error:
            self._error = f"Log write failed: {error}"
            log.error(self._error)
            self.stop()

    def log_telemetry(self, telemetry: dict) -> None:
        now = time.monotonic()
        if now - self._last_telemetry < self.telemetry_interval:
            return
        self._last_telemetry = now
        self._write("telemetry", {k: telemetry.get(k) for k in TELEMETRY_FIELDS} | {
            "gaze_direction": (telemetry.get("gaze") or {}).get("direction"),
            "attention": (telemetry.get("attention") or {}).get("score"),
            "severity": (telemetry.get("severity") or {}).get("score"),
        })

    def log_alert(self, alert: dict) -> None:
        self._write("alert", {k: v for k, v in alert.items() if k != "type"})

    def log_event(self, event: dict) -> None:
        # The event's own "kind" (e.g. SPEED REDUCED) must not replace the record kind.
        payload = {k: v for k, v in event.items() if k not in ("type", "kind")}
        self._write("event", {"event": event.get("kind"), **payload})
