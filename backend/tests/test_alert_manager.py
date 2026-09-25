from services.alert_manager import AlertManager, build_definitions


class FakeVoice:
    def __init__(self):
        self.spoken = []

    def submit(self, text, priority=0):
        self.spoken.append(text)
        return True


def make():
    voice = FakeVoice()
    return AlertManager(build_definitions(5.0, 6.0, True), voice), voice


def test_no_alert_when_normal():
    m, v = make()
    assert m.update([], 0.0) is None
    assert v.spoken == []


def test_single_condition_announces_once_per_cooldown():
    m, v = make()
    a = m.update(["LOOKING_AWAY"], 0.0)
    assert a.type == "LOOKING_AWAY"
    assert a.voice == "Warning. Please keep your eyes on the road."
    for t in (0.1, 1.0, 4.9):
        assert m.update(["LOOKING_AWAY"], t) is None
    assert m.update(["LOOKING_AWAY"], 5.0).type == "LOOKING_AWAY"
    assert len(v.spoken) == 2


def test_multiple_conditions_collapse_to_one_critical():
    m, v = make()
    a = m.update(["PHONE", "LOOKING_AWAY", "DROWSINESS"], 0.0)
    assert a.type == "CRITICAL"
    assert v.spoken == ["Critical warning. Multiple signs of driver distraction detected."]


def test_escalation_bypasses_cooldown():
    m, v = make()
    m.update(["LOOKING_AWAY"], 0.0)
    a = m.update(["LOOKING_AWAY", "PHONE"], 0.5)
    assert a is not None and a.type == "CRITICAL"


def test_priority_order():
    assert AlertManager.resolve(["DROWSINESS"]) == "DROWSINESS"
    assert AlertManager.resolve(["PHONE"]) == "PHONE"
    assert AlertManager.resolve(["PHONE", "DROWSINESS"]) == "CRITICAL"
    assert AlertManager.resolve([]) is None


def test_restored_announced_once():
    m, v = make()
    m.update(["PHONE"], 0.0)
    a = m.update([], 1.0)
    assert a.type == "ATTENTION_RESTORED"
    assert m.update([], 2.0) is None
    assert m.update([], 3.0) is None
    assert v.spoken[-1] == "Driver attention restored."


def test_de_escalation_respects_cooldown():
    m, v = make()
    m.update(["PHONE"], 0.0)
    m.update(["PHONE", "LOOKING_AWAY"], 1.0)        # critical
    # Phone put away, still looking away; LOOKING_AWAY never announced -> allowed.
    assert m.update(["LOOKING_AWAY"], 2.0).type == "LOOKING_AWAY"
    assert m.update(["LOOKING_AWAY"], 3.0) is None
