"""
MediaPipe Tasks Face Landmarker wrapper (same API and options as V1).

The model is loaded exactly once. analyze() returns plain data so the
caller never touches MediaPipe objects.
"""

import logging
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional, Tuple

import cv2
import mediapipe as mp

from services.detection import geometry

log = logging.getLogger(__name__)


@dataclass
class FaceAnalysis:
    face_detected: bool = False
    ear: Optional[float] = None
    left_ear: Optional[float] = None
    right_ear: Optional[float] = None
    head_ratio: Optional[float] = None
    head_direction: str = "UNKNOWN"
    # V2: angles in degrees (yaw > 0 = driver's left, pitch > 0 = down)
    yaw: Optional[float] = None
    pitch: Optional[float] = None
    roll: Optional[float] = None
    gaze_yaw: Optional[float] = None
    gaze_pitch: Optional[float] = None
    gaze_direction: str = "UNKNOWN"
    iris_points: List[Tuple[float, float]] = field(default_factory=list)
    # Normalised (0..1) points for the browser overlay
    eye_points: List[Tuple[float, float]] = field(default_factory=list)
    pose_points: List[Tuple[float, float]] = field(default_factory=list)
    face_box: Optional[Tuple[float, float, float, float]] = None


class FaceAnalyzer:

    def __init__(self, model_path: Path, ratio_right: float, ratio_left: float):
        if not Path(model_path).exists():
            raise FileNotFoundError(f"Face Landmarker model not found: {model_path}")

        options = mp.tasks.vision.FaceLandmarkerOptions(
            base_options=mp.tasks.BaseOptions(model_asset_path=str(model_path)),
            running_mode=mp.tasks.vision.RunningMode.VIDEO,
            num_faces=1,
            min_face_detection_confidence=0.5,
            min_face_presence_confidence=0.5,
            min_tracking_confidence=0.5,
            output_facial_transformation_matrixes=True,
        )

        self._landmarker = mp.tasks.vision.FaceLandmarker.create_from_options(options)
        self._ratio_right = ratio_right
        self._ratio_left = ratio_left
        self._last_timestamp_ms = -1
        self._t0 = time.monotonic()

    def _next_timestamp(self) -> int:
        # VIDEO mode requires strictly increasing timestamps.
        ts = int((time.monotonic() - self._t0) * 1000)
        if ts <= self._last_timestamp_ms:
            ts = self._last_timestamp_ms + 1
        self._last_timestamp_ms = ts
        return ts

    def analyze(self, frame_bgr) -> FaceAnalysis:
        height, width = frame_bgr.shape[:2]

        rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        result = self._landmarker.detect_for_video(image, self._next_timestamp())

        if not result.face_landmarks:
            return FaceAnalysis()

        face = result.face_landmarks[0]

        left_ear = geometry.calculate_ear(face, geometry.LEFT_EYE, width, height)
        right_ear = geometry.calculate_ear(face, geometry.RIGHT_EYE, width, height)
        ear = (left_ear + right_ear) / 2.0

        nose = geometry.to_pixel(face[geometry.NOSE], width, height)
        left = geometry.to_pixel(face[geometry.LEFT_FACE], width, height)
        right = geometry.to_pixel(face[geometry.RIGHT_FACE], width, height)

        ratio = geometry.head_ratio(nose, left, right)
        direction = geometry.head_direction(ratio, self._ratio_right, self._ratio_left)

        yaw = pitch = roll = gaze_yaw = gaze_pitch = None
        gaze = "UNKNOWN"
        iris_points: List[Tuple[float, float]] = []
        if result.facial_transformation_matrixes:
            yaw, pitch, roll = geometry.head_angles(result.facial_transformation_matrixes[0])
            if len(face) > geometry.IRIS_B:
                iris_x, iris_y = geometry.iris_offset(face)
                gaze_yaw, gaze_pitch = geometry.gaze_angles(yaw, pitch, iris_x, iris_y)
                gaze = geometry.gaze_direction(gaze_yaw, gaze_pitch)
                iris_points = [
                    (face[i].x, face[i].y) for i in (geometry.IRIS_A, geometry.IRIS_B)
                ]

        xs = [lm.x for lm in face]
        ys = [lm.y for lm in face]

        return FaceAnalysis(
            face_detected=True,
            ear=ear,
            left_ear=left_ear,
            right_ear=right_ear,
            head_ratio=ratio,
            head_direction=direction,
            yaw=yaw,
            pitch=pitch,
            roll=roll,
            gaze_yaw=gaze_yaw,
            gaze_pitch=gaze_pitch,
            gaze_direction=gaze,
            iris_points=iris_points,
            eye_points=[
                (face[i].x, face[i].y)
                for i in geometry.LEFT_EYE + geometry.RIGHT_EYE
            ],
            pose_points=[
                (face[i].x, face[i].y)
                for i in (geometry.NOSE, geometry.LEFT_FACE, geometry.RIGHT_FACE)
            ],
            face_box=(
                max(0.0, min(xs)),
                max(0.0, min(ys)),
                min(1.0, max(xs)),
                min(1.0, max(ys)),
            ),
        )

    def close(self) -> None:
        try:
            self._landmarker.close()
        except Exception:  # pragma: no cover - best effort cleanup
            log.exception("Error closing face landmarker")
