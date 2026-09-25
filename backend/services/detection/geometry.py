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


# ---------------------------------------------------------------------
# V2 additions: head angles and eye gaze
# ---------------------------------------------------------------------

# Iris centres (Face Landmarker 478-point model)
IRIS_A = 468   # iris inside the LEFT_EYE landmark set (33 ... 133)
IRIS_B = 473   # iris inside the RIGHT_EYE landmark set (362 ... 263)
EYE_A_CORNERS = (33, 133)
EYE_B_CORNERS = (362, 263)
EYE_A_LIDS = (159, 145)
EYE_B_LIDS = (386, 374)


def head_angles(rotation) -> Tuple[float, float, float]:
    """
    Yaw / pitch / roll in degrees from the Face Landmarker's facial
    transformation matrix (3x3 rotation, camera space with y up).

    Sign convention (matches V1's LEFT/RIGHT labels, driver's view):
      yaw   > 0  -> driver turned to their LEFT   (V1 "LEFT")
      pitch > 0  -> driver looking DOWN
      roll  > 0  -> head tilted clockwise in the image
    """
    fx, fy, fz = rotation[0][2], rotation[1][2], rotation[2][2]
    yaw = math.degrees(math.atan2(fx, fz))
    pitch = math.degrees(math.atan2(-fy, math.hypot(fx, fz)))
    roll = math.degrees(math.atan2(-rotation[0][1], rotation[1][1]))
    return yaw, pitch, roll


def _axis_offset(value: float, a: float, b: float) -> float:
    """Position of value between a and b mapped to -1..1 (0 = centred)."""
    span = b - a
    if abs(span) < 1e-6:
        return 0.0
    t = (value - a) / span
    return max(-1.0, min(1.0, (t - 0.5) * 2.0))


def iris_offset(landmarks) -> Tuple[float, float]:
    """
    Average iris position inside both eyes, each axis in -1..1.
    x > 0 -> iris toward image-right (driver's LEFT); y > 0 -> looking down.
    """
    xs, ys = [], []
    for iris, (c1, c2), (top, bottom) in (
        (IRIS_A, EYE_A_CORNERS, EYE_A_LIDS),
        (IRIS_B, EYE_B_CORNERS, EYE_B_LIDS),
    ):
        left_x = min(landmarks[c1].x, landmarks[c2].x)
        right_x = max(landmarks[c1].x, landmarks[c2].x)
        xs.append(_axis_offset(landmarks[iris].x, left_x, right_x))
        ys.append(_axis_offset(landmarks[iris].y, landmarks[top].y, landmarks[bottom].y))
    return sum(xs) / len(xs), sum(ys) / len(ys)


def gaze_angles(yaw: float, pitch: float, iris_x: float, iris_y: float,
                eye_range_h: float = 30.0, eye_range_v: float = 20.0) -> Tuple[float, float]:
    """Approximate gaze = head orientation + eye rotation inside the head."""
    return yaw + iris_x * eye_range_h, pitch + iris_y * eye_range_v


def gaze_direction(gaze_yaw: float, gaze_pitch: float,
                   h_threshold: float = 15.0, v_threshold: float = 12.0) -> str:
    horizontal = "LEFT" if gaze_yaw > h_threshold else "RIGHT" if gaze_yaw < -h_threshold else ""
    vertical = "DOWN" if gaze_pitch > v_threshold else "UP" if gaze_pitch < -v_threshold else ""
    if horizontal and vertical:
        return f"{vertical}-{horizontal}"
    return horizontal or vertical or "CENTER"
