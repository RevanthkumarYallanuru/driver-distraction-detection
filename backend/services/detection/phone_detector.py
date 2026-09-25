"""
YOLO cell-phone detector (V1 logic: COCO class 67, confidence >= 0.50).
The model is loaded once.
"""

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import List

log = logging.getLogger(__name__)

# COCO class ID 67 = cell phone
PHONE_CLASS_ID = 67


@dataclass
class PhoneBox:
    # Normalised (0..1) coordinates for the browser overlay
    x1: float
    y1: float
    x2: float
    y2: float
    confidence: float

    def to_dict(self) -> dict:
        return {
            "x1": round(self.x1, 4),
            "y1": round(self.y1, 4),
            "x2": round(self.x2, 4),
            "y2": round(self.y2, 4),
            "confidence": round(self.confidence, 3),
        }


class PhoneDetector:

    def __init__(self, model_path: Path, min_confidence: float):
        if not Path(model_path).exists():
            raise FileNotFoundError(f"YOLO model not found: {model_path}")

        from ultralytics import YOLO  # heavy import, only when needed

        self._model = YOLO(str(model_path))
        self._min_confidence = min_confidence

    def detect(self, frame_bgr) -> List[PhoneBox]:
        height, width = frame_bgr.shape[:2]

        results = self._model(
            frame_bgr,
            verbose=False,
            classes=[PHONE_CLASS_ID],
        )

        boxes: List[PhoneBox] = []

        for result in results:
            for box in result.boxes:
                class_id = int(box.cls[0])
                confidence = float(box.conf[0])

                if class_id != PHONE_CLASS_ID or confidence < self._min_confidence:
                    continue

                x1, y1, x2, y2 = (float(v) for v in box.xyxy[0])
                boxes.append(
                    PhoneBox(
                        x1=x1 / width,
                        y1=y1 / height,
                        x2=x2 / width,
                        y2=y2 / height,
                        confidence=confidence,
                    )
                )

        return boxes
