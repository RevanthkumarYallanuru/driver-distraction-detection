"""
AIEngine — perception + temporal validation.

Runs the V1 detection pipeline (MediaPipe EAR + head direction, YOLO
phone detection, sustained-duration timers) on a single worker thread
that consumes frames from CameraService. It produces a thread-safe
DetectionSnapshot; it does NOT decide on alerts or vehicle behaviour.
"""

import logging
import threading
import time
from dataclasses import asdict, dataclass, field
from typing import Dict, List, Optional, Tuple

from config import Settings
from services.camera_service import CameraService
from services.detection.temporal import SustainedCondition

log = logging.getLogger(__name__)


CONDITIONS = ("DROWSINESS", "PHONE", "LOOKING_AWAY")


@dataclass
class DetectionSnapshot:
    ai_status: str = "STARTING"          # STARTING | ONLINE | DEGRADED | PAUSED | OFFLINE
    ai_messages: List[str] = field(default_factory=list)
    face_model_loaded: bool = False
    phone_model_loaded: bool = False

    face_detected: bool = False
    ear: Optional[float] = None
    eyes_state: str = "UNKNOWN"          # OPEN | CLOSED | UNKNOWN
    head_direction: str = "UNKNOWN"      # CENTER | LEFT | RIGHT | UNKNOWN
    head_ratio: Optional[float] = None
    # Degrees. yaw > 0 = driver's left, pitch > 0 = looking down.
    head_yaw: Optional[float] = None
    head_pitch: Optional[float] = None
    head_roll: Optional[float] = None
    gaze_yaw: Optional[float] = None
    gaze_pitch: Optional[float] = None
    gaze_direction: str = "UNKNOWN"

    phone_visible: bool = False          # raw, this frame
    phone_confidence: Optional[float] = None
    phone_score: float = 0.0             # best phone score, even below threshold
    phone_boxes: List[dict] = field(default_factory=list)

    # Temporally validated conditions
    drowsiness_detected: bool = False
    looking_away: bool = False
    phone_detected: bool = False
    progress: Dict[str, float] = field(default_factory=dict)
    elapsed: Dict[str, float] = field(default_factory=dict)   # seconds present

    eye_points: List[Tuple[float, float]] = field(default_factory=list)
    iris_points: List[Tuple[float, float]] = field(default_factory=list)
    pose_points: List[Tuple[float, float]] = field(default_factory=list)
    face_box: Optional[Tuple[float, float, float, float]] = None

    frame_width: int = 0
    frame_height: int = 0
    processing_fps: float = 0.0
    inference_ms: float = 0.0
    simulated: List[str] = field(default_factory=list)

    @property
    def active_conditions(self) -> List[str]:
        active = []
        if self.drowsiness_detected:
            active.append("DROWSINESS")
        if self.phone_detected:
            active.append("PHONE")
        if self.looking_away:
            active.append("LOOKING_AWAY")
        return active

    @property
    def distraction_detected(self) -> bool:
        return bool(self.active_conditions)

    def to_dict(self) -> dict:
        data = asdict(self)
        data["active_conditions"] = self.active_conditions
        data["distraction_detected"] = self.distraction_detected
        return data


class AIEngine:

    def __init__(self, settings: Settings, camera: CameraService):
        self.settings = settings
        self.camera = camera

        self._face = None
        self._phone = None
        self._model_errors: List[str] = []

        self._eyes = SustainedCondition(settings.drowsiness_time, settings.recovery_time)
        self._away = SustainedCondition(settings.look_away_time, settings.recovery_time)
        self._phone_timer = SustainedCondition(settings.phone_detection_time, settings.recovery_time)

        self._snapshot = DetectionSnapshot()
        self._lock = threading.Lock()

        self._simulated_until: Dict[str, float] = {}

        self._stop = threading.Event()
        self._thread: Optional[threading.Thread] = None

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    def start(self) -> None:
        self._stop.clear()
        self._thread = threading.Thread(target=self._run, name="ai-engine", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=5)
        if self._face is not None:
            self._face.close()

    def snapshot(self) -> DetectionSnapshot:
        with self._lock:
            return self._snapshot

    # ------------------------------------------------------------------
    # Test / demo helper (only exposed when DEBUG_ENDPOINTS=1)
    # ------------------------------------------------------------------

    def simulate(self, condition: str, seconds: float) -> None:
        if condition not in CONDITIONS:
            raise ValueError(f"Unknown condition {condition}")
        self._simulated_until[condition] = time.monotonic() + seconds

    def clear_simulation(self) -> None:
        self._simulated_until.clear()

    # ------------------------------------------------------------------
    # Worker
    # ------------------------------------------------------------------

    def _load_models(self) -> None:
        from services.detection.face_analyzer import FaceAnalyzer
        from services.detection.phone_detector import PhoneDetector

        try:
            log.info("Loading MediaPipe Face Landmarker from %s", self.settings.face_model_path)
            self._face = FaceAnalyzer(
                self.settings.face_model_path,
                self.settings.head_ratio_right,
                self.settings.head_ratio_left,
            )
        except Exception as error:
            log.error("Face model unavailable: %s", error)
            self._model_errors.append(f"Face model unavailable: {error}")

        try:
            log.info("Loading YOLO model from %s", self.settings.yolo_model_path)
            self._phone = PhoneDetector(
                self.settings.yolo_model_path,
                self.settings.phone_confidence,
            )
            log.info("YOLO model loaded")
        except Exception as error:
            log.error("YOLO model unavailable: %s", error)
            self._model_errors.append(f"Phone detection unavailable: {error}")

    def _publish(self, snapshot: DetectionSnapshot) -> None:
        with self._lock:
            self._snapshot = snapshot

    def _base_status(self) -> Tuple[str, List[str]]:
        messages = list(self._model_errors)
        if self._face is None and self._phone is None:
            return "OFFLINE", messages
        if not self.camera.connected:
            messages.append(self.camera.error or "Camera disconnected")
            return "PAUSED", messages
        if messages:
            return "DEGRADED", messages
        return "ONLINE", messages

    def _run(self) -> None:
        self._publish(DetectionSnapshot(ai_status="STARTING", ai_messages=["Loading AI models"]))
        self._load_models()

        frame_id = 0
        processed = 0
        fps_start = time.monotonic()
        fps_count = 0
        processing_fps = 0.0
        last_boxes: list = []
        last_score = 0.0

        while not self._stop.is_set():
            frame_id_new, frame = self.camera.wait_for_frame(frame_id, timeout=0.5)

            if frame is None:
                # Camera stalled or disconnected: pause AI, reset timers.
                if not self.camera.connected:
                    self._eyes.reset()
                    self._away.reset()
                    self._phone_timer.reset()
                    status, messages = self._base_status()
                    self._publish(
                        DetectionSnapshot(
                            ai_status=status,
                            ai_messages=messages,
                            face_model_loaded=self._face is not None,
                            phone_model_loaded=self._phone is not None,
                            simulated=self._active_simulations(),
                            **self._simulated_flags(),
                        )
                    )
                continue

            frame_id = frame_id_new
            started = time.monotonic()

            try:
                snapshot = self._process(frame, processed, last_boxes, last_score)
                last_boxes = snapshot.phone_boxes
                last_score = snapshot.phone_score
            except Exception as error:  # never let one bad frame kill the loop
                log.exception("Frame processing failed")
                status, messages = self._base_status()
                snapshot = DetectionSnapshot(
                    ai_status="DEGRADED",
                    ai_messages=messages + [f"Frame processing error: {error}"],
                )

            processed += 1
            fps_count += 1
            elapsed = time.monotonic() - fps_start
            if elapsed >= 1.0:
                processing_fps = fps_count / elapsed
                fps_count = 0
                fps_start = time.monotonic()

            snapshot.processing_fps = round(processing_fps, 1)
            snapshot.inference_ms = round((time.monotonic() - started) * 1000, 1)
            self._publish(snapshot)

    def _active_simulations(self) -> List[str]:
        now = time.monotonic()
        return [c for c, until in self._simulated_until.items() if until > now]

    def _simulated_flags(self) -> dict:
        active = self._active_simulations()
        return {
            "drowsiness_detected": "DROWSINESS" in active,
            "phone_detected": "PHONE" in active,
            "looking_away": "LOOKING_AWAY" in active,
        }

    def _process(self, frame, index: int, last_boxes: list, last_score: float = 0.0) -> DetectionSnapshot:
        now = time.monotonic()
        height, width = frame.shape[:2]
        s = self.settings

        status, messages = self._base_status()
        snap = DetectionSnapshot(
            ai_status=status,
            ai_messages=messages,
            face_model_loaded=self._face is not None,
            phone_model_loaded=self._phone is not None,
            frame_width=width,
            frame_height=height,
        )

        # ---------------- Face: EAR + head direction ----------------
        if self._face is not None:
            face = self._face.analyze(frame)
            snap.face_detected = face.face_detected

            if face.face_detected:
                eyes_closed = face.ear < s.ear_threshold
                snap.ear = round(face.ear, 4)
                snap.eyes_state = "CLOSED" if eyes_closed else "OPEN"
                snap.head_direction = face.head_direction
                snap.head_ratio = round(face.head_ratio, 3)
                if face.yaw is not None:
                    snap.head_yaw = round(face.yaw, 1)
                    snap.head_pitch = round(face.pitch, 1)
                    snap.head_roll = round(face.roll, 1)
                if face.gaze_yaw is not None:
                    snap.gaze_yaw = round(face.gaze_yaw, 1)
                    snap.gaze_pitch = round(face.gaze_pitch, 1)
                    snap.gaze_direction = face.gaze_direction
                snap.iris_points = [(round(x, 4), round(y, 4)) for x, y in face.iris_points]
                snap.eye_points = [(round(x, 4), round(y, 4)) for x, y in face.eye_points]
                snap.pose_points = [(round(x, 4), round(y, 4)) for x, y in face.pose_points]
                snap.face_box = tuple(round(v, 4) for v in face.face_box)

                self._eyes.update(eyes_closed, now)
                self._away.update(face.head_direction != "CENTER", now)
            else:
                # V1: losing the face resets the eye / look-away timers.
                self._eyes.update(False, now)
                self._away.update(False, now)

        # ---------------- Phone ----------------
        if self._phone is not None:
            every = max(1, s.yolo_every_n_frames)
            if index % every == 0:
                found, score = self._phone.detect_with_score(frame)
                boxes = [b.to_dict() for b in found]
            else:
                boxes, score = last_boxes, last_score
            snap.phone_boxes = boxes
            snap.phone_score = round(score, 3)
            snap.phone_visible = bool(boxes)
            snap.phone_confidence = max((b["confidence"] for b in boxes), default=None)
            self._phone_timer.update(snap.phone_visible, now)

        snap.drowsiness_detected = self._eyes.confirmed
        snap.looking_away = self._away.confirmed
        snap.phone_detected = self._phone_timer.confirmed
        snap.progress = {
            "DROWSINESS": round(self._eyes.progress(now), 2),
            "LOOKING_AWAY": round(self._away.progress(now), 2),
            "PHONE": round(self._phone_timer.progress(now), 2),
        }
        snap.elapsed = {
            "DROWSINESS": round(self._eyes.elapsed(now), 1),
            "LOOKING_AWAY": round(self._away.elapsed(now), 1),
            "PHONE": round(self._phone_timer.elapsed(now), 1),
        }

        # Debug-only simulated conditions are OR-ed on top of real ones.
        simulated = self._active_simulations()
        if simulated:
            snap.simulated = simulated
            flags = self._simulated_flags()
            snap.drowsiness_detected |= flags["drowsiness_detected"]
            snap.phone_detected |= flags["phone_detected"]
            snap.looking_away |= flags["looking_away"]

        return snap
