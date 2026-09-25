import json

from services.ai_engine import DetectionSnapshot
from services.data_logger import DataLogger
from services.detection import geometry
from services.driver_state import DriverStateAnalyzer, attention_label, severity_label
from services.monitoring_system import alert_log_message


def attentive(**overrides):
    base = dict(
        ai_status="ONLINE", face_detected=True, ear=0.31, eyes_state="OPEN",
        head_direction="CENTER", head_yaw=2.0, head_pitch=3.0, phone_score=0.02,
        progress={"DROWSINESS": 0.0, "LOOKING_AWAY": 0.0, "PHONE": 0.0},
        elapsed={"DROWSINESS": 0.0, "LOOKING_AWAY": 0.0, "PHONE": 0.0},
    )
    base.update(overrides)
    return DetectionSnapshot(**base)


def settle(analyzer, snap, alert=None, seconds=5.0, dt=0.1):
    state = None
    for _ in range(int(seconds / dt)):
        state = analyzer.update(snap, dt, alert)
    return state


# ---------------- geometry: head angles & gaze ----------------

def test_head_angles_identity_is_straight_ahead():
    yaw, pitch, roll = geometry.head_angles([[1, 0, 0], [0, 1, 0], [0, 0, 1]])
    assert abs(yaw) < 1e-9 and abs(pitch) < 1e-9 and abs(roll) < 1e-9


def test_head_angles_signs():
    import math
    a = math.radians(20)
    # Forward vector rotated toward +x (image right = driver's left) -> yaw > 0
    turned = [[math.cos(a), 0, math.sin(a)], [0, 1, 0], [-math.sin(a), 0, math.cos(a)]]
    assert abs(geometry.head_angles(turned)[0] - 20) < 1e-6
    # Forward vector rotated toward -y (down) -> pitch > 0
    down = [[1, 0, 0], [0, math.cos(a), -math.sin(a)], [0, math.sin(a), math.cos(a)]]
    assert abs(geometry.head_angles(down)[1] - 20) < 1e-6


def test_gaze_direction_labels():
    assert geometry.gaze_direction(0, 0) == "CENTER"
    assert geometry.gaze_direction(20, 0) == "LEFT"
    assert geometry.gaze_direction(-20, 0) == "RIGHT"
    assert geometry.gaze_direction(0, 20) == "DOWN"
    assert geometry.gaze_direction(-20, 20) == "DOWN-RIGHT"


# ---------------- attention & severity ----------------

def test_attentive_driver_scores_high_and_low_severity():
    state = settle(DriverStateAnalyzer(0.22), attentive())
    assert state.attention_score >= 90
    assert state.attention_label == "ATTENTIVE"
    assert state.severity_label == "Low"
    assert state.ear_status == "EAR stable"
    assert state.drowsiness_state == "NOT DROWSY"


def test_turned_head_lowers_attention():
    state = settle(DriverStateAnalyzer(0.22), attentive(head_yaw=35.0))
    assert state.attention_score < 80


def test_confirmed_conditions_cap_attention_and_raise_severity():
    a = DriverStateAnalyzer(0.22)
    state = settle(a, attentive(ear=0.12, eyes_state="CLOSED", drowsiness_detected=True,
                                progress={"DROWSINESS": 1.0}), alert="DROWSINESS")
    assert state.attention_score <= 30
    assert state.severity_score >= 85 and state.severity_label == "Critical"
    assert state.drowsiness_state == "DROWSY"
    assert state.ear_status == "Eyes closed"

    state = settle(DriverStateAnalyzer(0.22), attentive(phone_score=0.8, phone_detected=True,
                                                         progress={"PHONE": 1.0}), alert="PHONE")
    assert state.attention_score <= 40 and state.severity_label == "High"


def test_no_face_gives_no_score():
    state = DriverStateAnalyzer(0.22).update(attentive(face_detected=False, ear=None), 0.1, None)
    assert state.attention_score is None and state.attention_label == "NO DATA"


def test_ear_dropping_detected_against_baseline():
    a = DriverStateAnalyzer(0.22)
    settle(a, attentive(ear=0.32), seconds=20)
    state = settle(a, attentive(ear=0.24), seconds=1.5)
    assert state.ear_status == "EAR dropping"


def test_labels():
    assert attention_label(86)[0] == "ATTENTIVE"
    assert attention_label(60)[0] == "REDUCED ATTENTION"
    assert attention_label(10)[0] == "CRITICAL"
    assert severity_label(20) == "Low"
    assert severity_label(90) == "Critical"


# ---------------- alert log wording ----------------

def test_alert_log_messages_include_measurements():
    snap = attentive(ear=0.18, phone_score=0.72, head_direction="RIGHT",
                     elapsed={"LOOKING_AWAY": 2.1})
    assert alert_log_message("DROWSINESS", snap) == "Drowsiness detected (EAR: 0.18)"
    assert alert_log_message("PHONE", snap) == "Phone detected (Confidence: 0.72)"
    assert alert_log_message("LOOKING_AWAY", snap) == "Looking right for 2 seconds"
    assert alert_log_message("ATTENTION_RESTORED", snap) == "Normal driving state"


# ---------------- data logger ----------------

def test_data_logger_writes_jsonl(tmp_path):
    logger = DataLogger(tmp_path, enabled=True, telemetry_interval=0)
    logger.start()
    logger.log_telemetry({"speed": 60, "attention": {"score": 90}, "severity": {"score": 5},
                          "gaze": {"direction": "LEFT"}})
    logger.log_alert({"type": "alert", "alert_type": "PHONE", "message": "Phone detected"})
    logger.log_event({"type": "event", "kind": "SPEED REDUCED", "message": "Holding 30 km/h"})
    assert logger.status()["recording"] and logger.status()["records"] == 3
    logger.stop()
    lines = [json.loads(line) for line in next(tmp_path.glob("session_*.jsonl")).read_text().splitlines()]
    assert lines[0]["kind"] == "telemetry" and lines[0]["speed"] == 60 and lines[0]["attention"] == 90
    assert lines[0]["gaze_direction"] == "LEFT"
    assert lines[1]["kind"] == "alert" and lines[1]["alert_type"] == "PHONE"
    assert lines[2]["kind"] == "event" and lines[2]["event"] == "SPEED REDUCED"


def test_data_logger_disabled(tmp_path):
    logger = DataLogger(tmp_path, enabled=False)
    logger.start()
    logger.log_alert({"x": 1})
    assert not logger.status()["recording"]
    assert list(tmp_path.iterdir()) == []
