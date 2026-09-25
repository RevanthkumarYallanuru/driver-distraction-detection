"""
VoiceService — one dedicated worker thread that speaks announcements
with pyttsx3, one at a time.

Design:
  * Never speaks from the camera/AI loop; callers just submit().
  * Only one utterance plays at a time; voices never overlap.
  * At most ONE utterance waits in line. A new submission replaces the
    waiting one if it is at least as important, so a backlog of stale
    warnings can never build up.
  * Waiting utterances older than max_age are dropped.

Note on pyttsx3 + SAPI5 (Windows): re-using one engine for several
runAndWait() calls inside a worker thread silently skips speech after
the first call. The worker therefore creates a fresh engine per
announcement (not per frame) inside this single thread, which was
verified to speak every time.
"""

import logging
import threading
import time
from dataclasses import dataclass
from typing import Callable, Optional

log = logging.getLogger(__name__)


@dataclass
class Utterance:
    text: str
    priority: int
    created: float


class VoiceService:

    def __init__(
        self,
        enabled: bool = True,
        rate: int = 165,
        volume: float = 1.0,
        max_age: float = 4.0,
        on_state_change: Optional[Callable[[bool, Optional[str]], None]] = None,
    ):
        self.enabled = enabled
        self.rate = rate
        self.volume = volume
        self.max_age = max_age
        self._on_state_change = on_state_change

        self._pending: Optional[Utterance] = None
        self._cond = threading.Condition()
        self._speaking: Optional[str] = None
        self._available = enabled
        self._error: Optional[str] = None

        self._stop = threading.Event()
        self._thread: Optional[threading.Thread] = None

    @property
    def speaking(self) -> bool:
        return self._speaking is not None

    @property
    def available(self) -> bool:
        return self._available

    @property
    def error(self) -> Optional[str]:
        return self._error

    def start(self) -> None:
        if not self.enabled:
            return
        self._thread = threading.Thread(target=self._run, name="voice", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        with self._cond:
            self._cond.notify_all()
        if self._thread:
            self._thread.join(timeout=5)

    def submit(self, text: str, priority: int = 0) -> bool:
        """Queue text for speaking. Returns False if it was rejected."""
        if not self.enabled or not self._available:
            return False

        with self._cond:
            if self._pending is not None and priority < self._pending.priority:
                return False
            self._pending = Utterance(text, priority, time.monotonic())
            self._cond.notify()
        return True

    # ------------------------------------------------------------------

    def _notify(self) -> None:
        if self._on_state_change:
            try:
                self._on_state_change(self._speaking is not None, self._speaking)
            except Exception:
                log.exception("voice state callback failed")

    def _run(self) -> None:
        try:
            import comtypes  # Windows: COM must be initialised per thread

            comtypes.CoInitialize()
        except Exception:
            pass

        try:
            import pyttsx3  # noqa: F401
        except Exception as error:
            self._available = False
            self._error = f"pyttsx3 unavailable: {error}"
            log.error(self._error)
            return

        while not self._stop.is_set():
            with self._cond:
                while self._pending is None and not self._stop.is_set():
                    self._cond.wait()
                if self._stop.is_set():
                    return
                utterance = self._pending
                self._pending = None

            if time.monotonic() - utterance.created > self.max_age:
                continue

            self._speak(utterance.text)

    def _speak(self, text: str) -> None:
        import pyttsx3

        self._speaking = text
        self._notify()
        try:
            engine = pyttsx3.init()
            engine.setProperty("rate", self.rate)
            engine.setProperty("volume", self.volume)
            engine.say(text)
            engine.runAndWait()
            engine.stop()
            self._error = None
        except Exception as error:
            self._error = f"Voice error: {error}"
            log.error(self._error)
        finally:
            self._speaking = None
            self._notify()
