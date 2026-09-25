"""
Pure geometry helpers extracted from V1 (src/driver_monitor.py).

The maths is unchanged: 6-point Eye Aspect Ratio and the
nose-to-face-edge ratio used for head direction.
"""

import math
from typing import Sequence, Tuple

Point = Tuple[float, float]


# MediaPipe Face Mesh landmark indices (same as V1)
LEFT_EYE = [33, 160, 158, 133, 153, 144]
RIGHT_EYE = [362, 385, 387, 263, 373, 380]
NOSE = 1
LEFT_FACE = 234
RIGHT_FACE = 454


def distance(point1: Point, point2: Point) -> float:
    return math.sqrt(
        (point1[0] - point2[0]) ** 2 + (point1[1] - point2[1]) ** 2
    )


def to_pixel(landmark, width: int, height: int) -> Point:
    return (landmark.x * width, landmark.y * height)


def calculate_ear(
    landmarks: Sequence,
    eye_indices: Sequence[int],
    width: int,
    height: int,
) -> float:
    points = [to_pixel(landmarks[i], width, height) for i in eye_indices]

    p1, p2, p3, p4, p5, p6 = points

    vertical_1 = distance(p2, p6)
    vertical_2 = distance(p3, p5)
    horizontal = distance(p1, p4)

    if horizontal == 0:
        return 0.0

    return (vertical_1 + vertical_2) / (2.0 * horizontal)


def head_ratio(nose: Point, left: Point, right: Point) -> float:
    left_distance = distance(nose, left)
    right_distance = distance(nose, right)
    total = left_distance + right_distance

    if total == 0:
        return 0.5

    return left_distance / total


def head_direction(
    ratio: float,
    right_threshold: float = 0.40,
    left_threshold: float = 0.60,
) -> str:
    if ratio < right_threshold:
        return "RIGHT"
    if ratio > left_threshold:
        return "LEFT"
    return "CENTER"
