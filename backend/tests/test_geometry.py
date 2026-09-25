from types import SimpleNamespace as P

from services.detection import geometry


def _eye(open_amount):
    # p1..p6 laid out like a real eye, 100 px wide.
    return [P(x=0, y=0), P(x=30, y=-open_amount), P(x=70, y=-open_amount),
            P(x=100, y=0), P(x=70, y=open_amount), P(x=30, y=open_amount)]


def test_ear_matches_v1_formula():
    ear = geometry.calculate_ear(_eye(15), range(6), 1, 1)
    # (30 + 30) / (2 * 100)
    assert abs(ear - 0.30) < 1e-9


def test_ear_closed_eye_below_threshold():
    assert geometry.calculate_ear(_eye(3), range(6), 1, 1) < 0.22


def test_ear_zero_width_is_safe():
    pts = [P(x=0, y=0)] * 6
    assert geometry.calculate_ear(pts, range(6), 1, 1) == 0.0


def test_head_direction_thresholds():
    assert geometry.head_direction(0.5) == "CENTER"
    assert geometry.head_direction(0.35) == "RIGHT"
    assert geometry.head_direction(0.65) == "LEFT"


def test_head_ratio():
    assert geometry.head_ratio((50, 0), (0, 0), (100, 0)) == 0.5
    assert geometry.head_ratio((80, 0), (0, 0), (100, 0)) == 0.8
    assert geometry.head_ratio((0, 0), (0, 0), (0, 0)) == 0.5
