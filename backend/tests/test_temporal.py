from services.detection.temporal import SustainedCondition


def test_requires_sustained_duration():
    c = SustainedCondition(1.5, 1.0)
    assert c.update(True, 0.0) is False
    assert c.update(True, 1.4) is False
    assert c.update(True, 1.5) is True


def test_interruption_resets_timer():
    c = SustainedCondition(1.5)
    c.update(True, 0.0)
    c.update(False, 1.0)
    assert c.update(True, 1.1) is False
    assert c.update(True, 2.5) is False
    assert c.update(True, 2.6) is True


def test_release_after_recovery_window():
    c = SustainedCondition(1.5, 1.0)
    c.update(True, 0.0)
    c.update(True, 2.0)
    assert c.update(False, 2.1) is True      # still held
    assert c.update(True, 2.5) is True       # flicker back: no drop
    assert c.update(False, 3.0) is True
    assert c.update(False, 4.0) is False     # clear for 1 s


def test_progress():
    c = SustainedCondition(2.0)
    c.update(True, 0.0)
    assert c.progress(1.0) == 0.5
