"""
VehicleSimulator — a SIMULATED vehicle. It controls nothing real.

current speed smoothly approaches target speed every tick; the status
is derived from the relationship between the two:

    MOVING ──distraction──▶ SLOWING ──reached──▶ SLOWED
      ▲                                            │
      └──reached── ACCELERATING ◀──attention restored

    (supported, not triggered by the AI yet)  STOPPING ──▶ STOPPED
    HORNED temporarily overrides the displayed status.
"""

from dataclasses import dataclass
from typing import List, Optional

ARRIVED_TOLERANCE = 0.4    # km/h


@dataclass
class VehicleEvent:
    type: str
    message: str


class VehicleSimulator:

    def __init__(
        self,
        normal_speed: float = 60.0,
        reduced_speed: float = 30.0,
        deceleration: float = 7.5,
        acceleration: float = 5.0,
        horn_duration: float = 1.6,
    ):
        self.normal_speed = normal_speed
        self.reduced_speed = reduced_speed
        self.deceleration = deceleration
        self.acceleration = acceleration
        self.horn_duration = horn_duration

        self.speed = normal_speed
        self.target_speed = normal_speed
        self._base_status = "MOVING"
        self._horn_remaining = 0.0
        self._emergency_stop = False

    # ------------------------------------------------------------------
    # Commands
    # ------------------------------------------------------------------

    def set_distracted(self, distracted: bool) -> None:
        if self._emergency_stop:
            return
        self.target_speed = self.reduced_speed if distracted else self.normal_speed

    def emergency_stop(self) -> None:
        """Reserved for future severe conditions. Not used by the AI."""
        self._emergency_stop = True
        self.target_speed = 0.0

    def release_stop(self) -> None:
        self._emergency_stop = False
        self.target_speed = self.normal_speed

    def horn(self) -> None:
        self._horn_remaining = self.horn_duration

    # ------------------------------------------------------------------
    # State
    # ------------------------------------------------------------------

    @property
    def horn_active(self) -> bool:
        return self._horn_remaining > 0

    @property
    def status(self) -> str:
        return "HORNED" if self.horn_active else self._base_status

    @property
    def base_status(self) -> str:
        return self._base_status

    def _derive_status(self) -> str:
        if self.target_speed <= 0:
            return "STOPPED" if self.speed <= ARRIVED_TOLERANCE else "STOPPING"
        if self.speed > self.target_speed + ARRIVED_TOLERANCE:
            return "SLOWING"
        if self.speed < self.target_speed - ARRIVED_TOLERANCE:
            return "ACCELERATING"
        if self.target_speed < self.normal_speed:
            return "SLOWED"
        return "MOVING"

    def tick(self, dt: float) -> List[VehicleEvent]:
        events: List[VehicleEvent] = []

        if self._horn_remaining > 0:
            self._horn_remaining = max(0.0, self._horn_remaining - dt)

        diff = self.target_speed - self.speed
        if abs(diff) > 1e-6:
            rate = self.acceleration if diff > 0 else self.deceleration
            # Ease into the target: full rate far away, gentler when close.
            ease = min(1.0, max(0.35, abs(diff) / 6.0))
            step = min(abs(diff), rate * ease * dt)
            self.speed += step if diff > 0 else -step
            if abs(self.target_speed - self.speed) < 0.05:
                self.speed = self.target_speed

        new_status = self._derive_status()
        if new_status != self._base_status:
            events.extend(self._transition_events(self._base_status, new_status))
            self._base_status = new_status

        return events

    def _transition_events(self, old: str, new: str) -> List[VehicleEvent]:
        target = f"{self.target_speed:.0f} km/h"
        messages = {
            "SLOWING": ("VEHICLE SLOWING", f"Reducing speed to {target}"),
            "SLOWED": ("SPEED REDUCED", f"Holding reduced speed {target}"),
            "ACCELERATING": ("ACCELERATING", f"Resuming speed to {target}"),
            "MOVING": ("NORMAL SPEED", f"Cruising at {target}"),
            "STOPPING": ("STOPPING", "Controlled stop in progress"),
            "STOPPED": ("STOPPED", "Vehicle stationary"),
        }
        if new not in messages:
            return []
        kind, message = messages[new]
        return [VehicleEvent(kind, message)]

    def to_dict(self) -> dict:
        return {
            "speed": round(self.speed, 1),
            "target_speed": round(self.target_speed, 1),
            "vehicle_status": self.status,
            "base_status": self._base_status,
            "horn_active": self.horn_active,
            "normal_speed": self.normal_speed,
            "reduced_speed": self.reduced_speed,
        }
