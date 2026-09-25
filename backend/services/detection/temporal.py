"""
Temporal validation: a condition only counts once it has been
continuously present for a minimum duration (V1 behaviour), and
it is only released after it has been continuously absent for a
short recovery window (V2 addition to prevent flicker).
"""

import time
from typing import Optional


class SustainedCondition:

    def __init__(self, activate_after: float, release_after: float = 0.0):
        self.activate_after = activate_after
        self.release_after = release_after

        self._present_since: Optional[float] = None
        self._absent_since: Optional[float] = None
        self._confirmed = False

    def update(self, present: bool, now: Optional[float] = None) -> bool:
        now = time.monotonic() if now is None else now

        if present:
            self._absent_since = None
            if self._present_since is None:
                self._present_since = now
            if now - self._present_since >= self.activate_after:
                self._confirmed = True
        else:
            self._present_since = None
            if self._confirmed:
                if self._absent_since is None:
                    self._absent_since = now
                if now - self._absent_since >= self.release_after:
                    self._confirmed = False
                    self._absent_since = None

        return self._confirmed

    def elapsed(self, now: Optional[float] = None) -> float:
        """Seconds the raw condition has been continuously present."""
        if self._present_since is None:
            return 0.0
        now = time.monotonic() if now is None else now
        return now - self._present_since

    def progress(self, now: Optional[float] = None) -> float:
        """0..1 progress towards confirmation (for the UI)."""
        if self._confirmed:
            return 1.0
        if self.activate_after <= 0:
            return 0.0
        return min(1.0, self.elapsed(now) / self.activate_after)

    @property
    def confirmed(self) -> bool:
        return self._confirmed

    def reset(self) -> None:
        self._present_since = None
        self._absent_since = None
        self._confirmed = False
