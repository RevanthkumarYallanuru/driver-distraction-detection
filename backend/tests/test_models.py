"""Integration tests against the real models, using Ultralytics' bundled sample images."""
from pathlib import Path

import cv2
import pytest

from config import settings

ASSETS = Path(__import__("ultralytics").__file__).parent / "assets"


@pytest.mark.skipif(not settings.face_model_path.exists(), reason="face model missing")
def test_face_landmarker_finds_face_and_computes_ear():
    from services.detection.face_analyzer import FaceAnalyzer

    # Right half of the sample: one face at webcam-like scale, head turned.
    image = cv2.imread(str(ASSETS / "zidane.jpg"))[:, 640:].copy()

    analyzer = FaceAnalyzer(settings.face_model_path, 0.40, 0.60)
    try:
        result = analyzer.analyze(image)
        mirrored = analyzer.analyze(cv2.flip(image, 1))
    finally:
        analyzer.close()

    assert result.face_detected
    assert result.ear > settings.ear_threshold        # eyes open
    assert len(result.eye_points) == 12
    # Head pose flips with the image.
    assert result.head_direction == "LEFT"
    assert mirrored.face_detected and mirrored.head_direction == "RIGHT"


def test_no_face_in_empty_frame():
    import numpy as np
    from services.detection.face_analyzer import FaceAnalyzer

    analyzer = FaceAnalyzer(settings.face_model_path, 0.40, 0.60)
    try:
        result = analyzer.analyze(np.zeros((480, 640, 3), dtype=np.uint8))
    finally:
        analyzer.close()
    assert not result.face_detected and result.head_direction == "UNKNOWN"


@pytest.mark.skipif(not settings.yolo_model_path.exists(), reason="yolo model missing")
def test_yolo_runs_and_filters_to_phones():
    from services.detection.phone_detector import PhoneDetector

    detector = PhoneDetector(settings.yolo_model_path, 0.5)
    boxes = detector.detect(cv2.imread(str(ASSETS / "bus.jpg")))
    assert boxes == []   # a bus scene has no phones


def test_missing_model_raises_cleanly(tmp_path):
    from services.detection.face_analyzer import FaceAnalyzer

    with pytest.raises(FileNotFoundError):
        FaceAnalyzer(tmp_path / "nope.task", 0.4, 0.6)
