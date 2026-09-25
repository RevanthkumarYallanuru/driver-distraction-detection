"""
DriverStateAnalyzer — turns raw detections into the dashboard's
summary metrics:

  * Driver Attention Score (0-100, higher = more attentive)
  * Distraction Severity   (0-100, higher = more dangerous)
  * EAR trend              ("EAR stable" / "EAR dropping" / "Eyes closed")

These are presentation metrics derived from the same signals that drive
the alerts; they never trigger alerts or vehicle actions themselves.
The score is a transparent weighted penalty model (documented below),
not a trained model.
"""

import math
from dataclasses import dataclass
from typing import Optional

from services.ai_engine import DetectionSnapshot

# Severity assigned to each confirmed condition.
CONFIRMED_SEVERITY = {
    "CRITICAL": 95.0,
    "DROWSINESS": 85.0,
    "PHONE": 70.0,
    "LOOKING_AWAY": 60.0,
}

# Upper bound on attention while a condition is confirmed.
CONFIRMED_ATTENTION_CAP = {
    "CRITICAL": 15.0,
    "DROWSINESS": 30.0,
    "PHONE": 40.0,
    "LOOKING_AWAY": 45.0,
}


@dataclass
class DriverState:
    attention_score: Optional[int]
    attention_label: str
    attention_message: str
    severity_score: Optional[int]
    severity_label: str
    ear_status: str
    drowsiness_state: str
    ear_baseline: Optional[float]

    def to_dict(self) -> dict:
        return {
            "attention": {
                "score": self.attention_score,
                "label": self.attention_label,
                "message": self.attention_message,
            },
            "severity": {"score": self.severity_score, "label": self.severity_label},
            "ear_status": self.ear_status,
            "drowsiness_state": self.drowsiness_state,
            "ear_baseline": self.ear_baseline,
        }


def attention_label(score: Optional[float]) -> tuple:
    if score is None:
        return "NO DATA", "Waiting for the driver's face"
    if score >= 75:
        return "ATTENTIVE", "Good focus on driving"
    if score >= 50:
        return "REDUCED ATTENTION", "Stay focused on the road"
    if score >= 25:
        return "DISTRACTED", "Driver attention required"
    return "CRITICAL", "Immediate attention required"


def severity_label(score: Optional[float]) -> str:
    if score is None:
        return "Unknown"
    if score < 25:
        return "Low"
    if score < 50:
        return "Moderate"
    if score < 75:
        return "High"
    return "Critical"


def _clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, value))


def raw_attention(snap: DetectionSnapshot, ear_threshold: float,
                  alert_type: Optional[str]) -> Optional[float]:
    """
    Instantaneous attention score. Penalties (points off 100):
      eyes    up to 10 as EAR nears the threshold, 25 + 35 x drowsiness progress when closed
      head    up to 30 for |yaw| from 10 to 40 deg, up to 15 for looking down 15 to 40 deg,
              plus 20 x looking-away progress
      phone   20 x phone score + 30 x phone progress
    Confirmed conditions additionally cap the score (CONFIRMED_ATTENTION_CAP).
    """
    if not snap.face_detected:
        return None

    penalty = 0.0
    progress = snap.progress or {}

    if snap.ear is not None:
        if snap.ear < ear_threshold:
            penalty += 25 + 35 * progress.get("DROWSINESS", 0.0)
        else:
            penalty += 10 * _clamp((ear_threshold + 0.04 - snap.ear) / 0.04)

    if snap.head_yaw is not None:
        penalty += 30 * _clamp((abs(snap.head_yaw) - 10) / 30)
    if snap.head_pitch is not None:
        penalty += 15 * _clamp((snap.head_pitch - 15) / 25)
    penalty += 20 * progress.get("LOOKING_AWAY", 0.0)

    penalty += 20 * _clamp(snap.phone_score) + 30 * progress.get("PHONE", 0.0)

    score = _clamp(100 - penalty, 0, 100)
    if alert_type in CONFIRMED_ATTENTION_CAP:
        score = min(score, CONFIRMED_ATTENTION_CAP[alert_type])
    return score


def raw_severity(snap: DetectionSnapshot, attention: Optional[float],
                 alert_type: Optional[str]) -> Optional[float]:
    if attention is None and alert_type is None:
        return None
    confirmed = CONFIRMED_SEVERITY.get(alert_type, 0.0)
    building = 45 * max((snap.progress or {}).values(), default=0.0)
    inattention = 0.5 * (100 - attention) if attention is not None else 0.0
    return _clamp(max(confirmed, building, inattention), 0, 100)


class DriverStateAnalyzer:

    def __init__(self, ear_threshold: float, attention_tau: float = 0.6,
                 ear_fast_tau: float = 0.3, ear_baseline_tau: float = 10.0):
        self.ear_threshold = ear_threshold
        self.attention_tau = attention_tau
        self.ear_fast_tau = ear_fast_tau
        self.ear_baseline_tau = ear_baseline_tau

        self._attention: Optional[float] = None
        self._ear_fast: Optional[float] = None
        self._ear_baseline: Optional[float] = None

    @staticmethod
    def _ema(previous: Optional[float], value: float, dt: float, tau: float) -> float:
        if previous is None:
            return value
        alpha = 1 - math.exp(-dt / tau) if tau > 0 else 1.0
        return previous + alpha * (value - previous)

    def reset(self) -> None:
        self._attention = None
        self._ear_fast = None

    def update(self, snap: DetectionSnapshot, dt: float,
               alert_type: Optional[str]) -> DriverState:
        # ---------------- EAR trend ----------------
        ear_status = "No face"
        if snap.ear is not None:
            self._ear_fast = self._ema(self._ear_fast, snap.ear, dt, self.ear_fast_tau)
            if snap.ear >= self.ear_threshold:
                # Baseline only learns from open-eye frames.
                self._ear_baseline = self._ema(self._ear_baseline, snap.ear, dt, self.ear_baseline_tau)

            if snap.ear < self.ear_threshold:
                ear_status = "Eyes closed"
            elif self._ear_baseline and self._ear_fast < self._ear_baseline * 0.85:
                ear_status = "EAR dropping"
            else:
                ear_status = "EAR stable"
        else:
            self._ear_fast = None

        if snap.drowsiness_detected:
            drowsiness = "DROWSY"
        elif snap.eyes_state == "CLOSED":
            drowsiness = "EYES CLOSING"
        elif snap.face_detected:
            drowsiness = "NOT DROWSY"
        else:
            drowsiness = "UNKNOWN"

        # ---------------- attention ----------------
        raw = raw_attention(snap, self.ear_threshold, alert_type)
        if raw is None:
            self._attention = None
        else:
            # React quickly to worse attention, recover more gently.
            tau = self.attention_tau if (self._attention is None or raw < self._attention) else self.attention_tau * 2
            self._attention = self._ema(self._attention, raw, dt, tau)

        attention = None if self._attention is None else round(self._attention)
        label, message = attention_label(attention)

        severity = raw_severity(snap, self._attention, alert_type)

        return DriverState(
            attention_score=attention,
            attention_label=label,
            attention_message=message,
            severity_score=None if severity is None else round(severity),
            severity_label=severity_label(severity),
            ear_status=ear_status,
            drowsiness_state=drowsiness,
            ear_baseline=None if self._ear_baseline is None else round(self._ear_baseline, 3),
        )
