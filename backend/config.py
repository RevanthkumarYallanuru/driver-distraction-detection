"""
Central configuration for the V2 backend.

Detection thresholds are carried over unchanged from V1
(src/driver_monitor.py). Most values can be overridden with
environment variables so the system can be tuned without code changes.
"""

import os
from dataclasses import dataclass, field
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BACKEND_DIR.parent


def _env_float(name: str, default: float) -> float:
    try:
        return float(os.environ.get(name, default))
    except ValueError:
        return default


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except ValueError:
        return default


def _env_bool(name: str, default: bool) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in ("1", "true", "yes", "on")


def _first_existing(*candidates: Path) -> Path:
    for candidate in candidates:
        if candidate.exists():
            return candidate
    return candidates[0]


@dataclass(frozen=True)
class Settings:
    # ---------------------------------------------------------------
    # Models
    # ---------------------------------------------------------------
    face_model_path: Path = field(
        default_factory=lambda: Path(
            os.environ.get(
                "FACE_MODEL_PATH",
                PROJECT_ROOT / "models" / "face_landmarker.task",
            )
        )
    )
    yolo_model_path: Path = field(
        default_factory=lambda: Path(
            os.environ.get(
                "YOLO_MODEL_PATH",
                _first_existing(
                    PROJECT_ROOT / "models" / "yolo11n.pt",
                    PROJECT_ROOT / "yolo11n.pt",
                ),
            )
        )
    )

    # ---------------------------------------------------------------
    # Camera
    # ---------------------------------------------------------------
    camera_index: int = _env_int("CAMERA_INDEX", 0)
    camera_width: int = _env_int("CAMERA_WIDTH", 640)
    camera_height: int = _env_int("CAMERA_HEIGHT", 480)
    camera_retry_seconds: float = _env_float("CAMERA_RETRY_SECONDS", 2.0)
    stream_jpeg_quality: int = _env_int("STREAM_JPEG_QUALITY", 75)
    stream_max_fps: float = _env_float("STREAM_MAX_FPS", 30.0)

    # ---------------------------------------------------------------
    # Detection thresholds (V1 values)
    # ---------------------------------------------------------------
    ear_threshold: float = _env_float("EAR_THRESHOLD", 0.22)
    drowsiness_time: float = _env_float("DROWSINESS_TIME", 1.5)
    look_away_time: float = _env_float("LOOK_AWAY_TIME", 1.5)
    phone_detection_time: float = _env_float("PHONE_DETECTION_TIME", 1.5)
    phone_confidence: float = _env_float("PHONE_CONFIDENCE", 0.50)
    head_ratio_right: float = 0.40
    head_ratio_left: float = 0.60

    # Run YOLO every N processed frames (1 = every frame, as in V1).
    yolo_every_n_frames: int = _env_int("YOLO_EVERY_N_FRAMES", 1)

    # A confirmed condition must stay clear this long before the
    # driver is considered "attentive" again (prevents flicker).
    recovery_time: float = _env_float("RECOVERY_TIME", 1.0)

    # ---------------------------------------------------------------
    # Alerts / voice
    # ---------------------------------------------------------------
    alert_cooldown: float = _env_float("WARNING_COOLDOWN", 5.0)
    critical_cooldown: float = _env_float("CRITICAL_COOLDOWN", 6.0)
    min_voice_gap: float = _env_float("MIN_VOICE_GAP", 1.5)
    voice_enabled: bool = _env_bool("VOICE_ENABLED", True)
    voice_rate: int = _env_int("VOICE_RATE", 165)
    announce_restored_voice: bool = _env_bool("ANNOUNCE_RESTORED_VOICE", True)

    # ---------------------------------------------------------------
    # Simulated vehicle
    # ---------------------------------------------------------------
    normal_speed: float = _env_float("NORMAL_SPEED", 60.0)
    reduced_speed: float = _env_float("REDUCED_SPEED", 30.0)
    deceleration: float = _env_float("DECELERATION", 7.5)   # km/h per second
    acceleration: float = _env_float("ACCELERATION", 5.0)   # km/h per second
    horn_duration: float = _env_float("HORN_DURATION", 1.6)

    # ---------------------------------------------------------------
    # Server
    # ---------------------------------------------------------------
    telemetry_hz: float = _env_float("TELEMETRY_HZ", 10.0)
    host: str = os.environ.get("HOST", "127.0.0.1")
    port: int = _env_int("PORT", 8000)
    open_browser: bool = _env_bool("OPEN_BROWSER", True)
    # Enables POST /api/debug/simulate for testing without a driver.
    debug_endpoints: bool = _env_bool("DEBUG_ENDPOINTS", False)
    frontend_dist: Path = PROJECT_ROOT / "frontend" / "dist"


settings = Settings()
