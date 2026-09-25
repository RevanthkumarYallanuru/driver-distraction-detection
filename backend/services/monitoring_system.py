"""
MonitoringSystem — wires every service together.

Threads:
  camera   : CameraService (only webcam owner)
  ai-engine: AIEngine (MediaPipe + YOLO + temporal validation)
  voice    : VoiceService (pyttsx3, one utterance at a time)

The asyncio "supervisor" loop (TELEMETRY_HZ) owns every decision:
detection snapshot -> AlertManager -> VehicleSimulator -> WebSocket.
Keeping decisions on one loop means no locks around alert/vehicle state.
"""

import asyncio
import logging
import time
from datetime import datetime, timezone
from typing import Optional

from config import Settings
from services.ai_engine import AIEngine, DetectionSnapshot
from services.alert_manager import AlertManager, build_definitions
from services.camera_service import CameraService
from services.telemetry_service import TelemetryService
from services.vehicle_simulator import VehicleSimulator
from services.voice_service import VoiceService

log = logging.getLogger(__name__)

# AI states in which detections are trustworthy enough to act on.
ACTIVE_AI_STATES = ("ONLINE", "DEGRADED")

DRIVER_STATUS_BY_ALERT = {
    "CRITICAL": "CRITICAL",
    "DROWSINESS": "DROWSY",
    "PHONE": "DISTRACTED",
    "LOOKING_AWAY": "DISTRACTED",
}

CONDITION_LABELS = {
    "DROWSINESS": "eyes closed",
    "PHONE": "phone usage",
    "LOOKING_AWAY": "looking away",
}


class MonitoringSystem:

    def __init__(self, settings: Settings):
        self.settings = settings

        self.camera = CameraService(
            index=settings.camera_index,
            width=settings.camera_width,
            height=settings.camera_height,
            retry_seconds=settings.camera_retry_seconds,
            jpeg_quality=settings.stream_jpeg_quality,
        )
        self.engine = AIEngine(settings, self.camera)
        self.voice = VoiceService(enabled=settings.voice_enabled, rate=settings.voice_rate)
        self.alerts = AlertManager(
            build_definitions(
                settings.alert_cooldown,
                settings.critical_cooldown,
                settings.announce_restored_voice,
            ),
            self.voice,
        )
        self.vehicle = VehicleSimulator(
            normal_speed=settings.normal_speed,
            reduced_speed=settings.reduced_speed,
            deceleration=settings.deceleration,
            acceleration=settings.acceleration,
            horn_duration=settings.horn_duration,
        )
        self.telemetry = TelemetryService()

        self._task: Optional[asyncio.Task] = None
        self._was_distracted = False
        self._camera_connected: Optional[bool] = None
        self._ai_status: Optional[str] = None
        self.started_at = time.time()

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def start(self) -> None:
        self.camera.start()
        self.engine.start()
        self.voice.start()
        self.telemetry.make_event("SYSTEM", "AI driver monitoring system starting")
        self._task = asyncio.create_task(self._supervise(), name="supervisor")

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        # Blocking joins happen off the event loop.
        await asyncio.to_thread(self.engine.stop)
        await asyncio.to_thread(self.camera.stop)
        await asyncio.to_thread(self.voice.stop)

    # ------------------------------------------------------------------
    # Commands
    # ------------------------------------------------------------------

    async def sound_horn(self, reason: str = "Manual horn") -> None:
        self.vehicle.horn()
        await self._emit("HORNED", reason, "WARNING")

    # ------------------------------------------------------------------
    # Supervisor loop
    # ------------------------------------------------------------------

    async def _supervise(self) -> None:
        period = 1.0 / max(1.0, self.settings.telemetry_hz)
        last = time.monotonic()

        while True:
            try:
                now = time.monotonic()
                dt = now - last
                last = now
                await self._tick(now, dt)
            except asyncio.CancelledError:
                raise
            except Exception:
                log.exception("Supervisor tick failed")
            await asyncio.sleep(period)

    async def _emit(self, kind: str, message: str, level: str = "INFO") -> None:
        await self.telemetry.broadcast(self.telemetry.make_event(kind, message, level))

    async def _tick(self, now: float, dt: float) -> None:
        snap = self.engine.snapshot()
        await self._track_system_state(snap)

        ai_active = snap.ai_status in ACTIVE_AI_STATES

        if ai_active:
            distracted = snap.distraction_detected

            if distracted and not self._was_distracted:
                labels = ", ".join(CONDITION_LABELS[c] for c in snap.active_conditions)
                await self._emit("DISTRACTION DETECTED", f"Confirmed: {labels}", "WARNING")
            elif not distracted and self._was_distracted:
                await self._emit("ATTENTION RESTORED", "Driver attention back on the road", "NORMAL")
            self._was_distracted = distracted

            # Vehicle target first so the announcement can describe it.
            self.vehicle.set_distracted(distracted)

            announcement = self.alerts.update(snap.active_conditions, now)
            if announcement is not None:
                announcement.detail = self._vehicle_note(announcement.type)
                await self.telemetry.broadcast(
                    {"type": "announcement", "announcement": announcement.to_dict()}
                )
                if announcement.type != "ATTENTION_RESTORED":
                    await self._emit("DRIVER ALERT", announcement.message, announcement.level)
                if announcement.type in ("CRITICAL", "DROWSINESS"):
                    await self.sound_horn(f"Automatic horn: {announcement.title.lower()}")

        for event in self.vehicle.tick(dt):
            level = "WARNING" if event.type in ("VEHICLE SLOWING", "SPEED REDUCED") else "INFO"
            await self._emit(event.type, event.message, level)

        await self.telemetry.broadcast(self._build_telemetry(snap, ai_active))

    async def _track_system_state(self, snap: DetectionSnapshot) -> None:
        connected = self.camera.connected
        if connected != self._camera_connected:
            if connected:
                await self._emit("CAMERA CONNECTED", "Driver camera online", "NORMAL")
            elif self._camera_connected is not None or self.camera.error != "Camera starting":
                await self._emit("CAMERA DISCONNECTED", self.camera.error or "Camera lost", "CRITICAL")
            self._camera_connected = connected

        if snap.ai_status != self._ai_status:
            messages = {
                "ONLINE": ("AI ONLINE", "Face landmarks and phone detection active", "NORMAL"),
                "DEGRADED": ("AI DEGRADED", "; ".join(snap.ai_messages) or "Partial detection", "WARNING"),
                "PAUSED": ("AI PAUSED", "Waiting for camera frames", "WARNING"),
                "OFFLINE": ("AI OFFLINE", "; ".join(snap.ai_messages) or "No models loaded", "CRITICAL"),
            }
            if snap.ai_status in messages:
                await self._emit(*messages[snap.ai_status])
            self._ai_status = snap.ai_status

    def _vehicle_note(self, alert_type: str) -> str:
        v = self.vehicle
        if alert_type == "ATTENTION_RESTORED":
            return f"Vehicle accelerating to {v.normal_speed:.0f} km/h"
        if v.speed > v.reduced_speed + 0.5:
            return f"Vehicle slowing to {v.reduced_speed:.0f} km/h"
        return f"Vehicle holding reduced speed {v.reduced_speed:.0f} km/h"

    # ------------------------------------------------------------------
    # Telemetry payload
    # ------------------------------------------------------------------

    def _driver_status(self, snap: DetectionSnapshot, ai_active: bool) -> str:
        if not ai_active:
            return "UNKNOWN"
        current = self.alerts.current
        if current is not None:
            return DRIVER_STATUS_BY_ALERT.get(current.type, "DISTRACTED")
        if snap.face_model_loaded and not snap.face_detected:
            return "NO FACE"
        return "NORMAL"

    def _system_status(self, snap: DetectionSnapshot) -> str:
        if not self.camera.connected or snap.ai_status in ("PAUSED", "OFFLINE"):
            return "PAUSED"
        if snap.ai_status == "STARTING":
            return "STARTING"
        if snap.ai_status == "DEGRADED":
            return "DEGRADED"
        return "ACTIVE"

    def _build_telemetry(self, snap: DetectionSnapshot, ai_active: bool) -> dict:
        current = self.alerts.current if ai_active else None
        last = self.alerts.last_announcement

        return {
            "type": "telemetry",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            # --- vehicle ---
            **self.vehicle.to_dict(),
            # --- driver / detection ---
            "driver_status": self._driver_status(snap, ai_active),
            "head_direction": snap.head_direction,
            "ear": snap.ear,
            "ear_threshold": self.settings.ear_threshold,
            "eyes_state": snap.eyes_state,
            "face_detected": snap.face_detected,
            "phone_visible": snap.phone_visible,
            "phone_confidence": snap.phone_confidence,
            "phone_detected": snap.phone_detected,
            "drowsiness_detected": snap.drowsiness_detected,
            "looking_away": snap.looking_away,
            "distraction_detected": ai_active and snap.distraction_detected,
            "active_conditions": snap.active_conditions if ai_active else [],
            "condition_progress": snap.progress,
            # --- alert ---
            "alert_type": current.type if current else None,
            "alert_message": current.message if current else None,
            "alert_level": current.level if current else "NORMAL",
            "last_alert": (
                {"type": last.type, "title": last.title, "timestamp": last.timestamp}
                if last else None
            ),
            # --- system ---
            "system_status": self._system_status(snap),
            "camera": {
                "connected": self.camera.connected,
                "fps": round(self.camera.fps, 1),
                "error": self.camera.error,
            },
            "ai": {
                "status": snap.ai_status,
                "messages": snap.ai_messages,
                "fps": snap.processing_fps,
                "inference_ms": snap.inference_ms,
                "face_model": snap.face_model_loaded,
                "phone_model": snap.phone_model_loaded,
                "simulated": snap.simulated,
            },
            "voice": {
                "enabled": self.voice.enabled and self.voice.available,
                "speaking": self.voice.speaking,
                "error": self.voice.error,
            },
            # --- overlay (normalised 0..1 coordinates) ---
            "overlay": {
                "frame_width": snap.frame_width,
                "frame_height": snap.frame_height,
                "eye_points": snap.eye_points,
                "pose_points": snap.pose_points,
                "face_box": snap.face_box,
                "phone_boxes": snap.phone_boxes,
            },
        }
