from services.vehicle_simulator import VehicleSimulator


def run(sim, seconds, dt=0.1):
    speeds, events = [], []
    for _ in range(int(round(seconds / dt))):
        events += [e.type for e in sim.tick(dt)]
        speeds.append(sim.speed)
    return speeds, events


def test_starts_moving_at_normal_speed():
    sim = VehicleSimulator()
    assert sim.speed == 60 and sim.status == "MOVING"


def test_distraction_slows_smoothly_to_30():
    sim = VehicleSimulator()
    sim.set_distracted(True)
    sim.tick(0.1)
    assert sim.status == "SLOWING"
    start = sim.speed
    speeds, events = run(sim, 10)
    # Never jumps: each 100 ms step is at most 7.5 * 0.1 km/h.
    steps = [a - b for a, b in zip([start] + speeds, speeds)]
    assert max(steps) <= 0.75 + 1e-9
    assert all(s >= 0 for s in steps)
    assert sim.speed == 30
    assert sim.status == "SLOWED"
    assert "SPEED REDUCED" in events


def test_recovery_accelerates_back_to_60():
    sim = VehicleSimulator()
    sim.set_distracted(True)
    run(sim, 10)
    sim.set_distracted(False)
    sim.tick(0.1)
    assert sim.status == "ACCELERATING"
    speeds, events = run(sim, 15)
    assert speeds == sorted(speeds)
    assert sim.speed == 60 and sim.status == "MOVING"
    assert "NORMAL SPEED" in events


def test_horn_temporarily_overrides_status():
    sim = VehicleSimulator(horn_duration=1.0)
    sim.horn()
    assert sim.status == "HORNED"
    run(sim, 1.1)
    assert sim.status == "MOVING"


def test_emergency_stop_supported():
    sim = VehicleSimulator()
    sim.emergency_stop()
    sim.tick(0.1)
    assert sim.status == "STOPPING"
    run(sim, 20)
    assert sim.status == "STOPPED" and sim.speed == 0
    sim.set_distracted(False)   # ignored while stopped
    assert sim.target_speed == 0
