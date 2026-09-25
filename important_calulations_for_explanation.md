## What drowsiness is

Drowsiness is the state between being awake and falling asleep, usually caused by fatigue, lack of sleep, long monotonous drives or late-night driving. A drowsy driver reacts more slowly and can have **microsleeps**: short episodes, often 1–10 seconds, where the eyes close and the brain effectively goes offline. At 60 km/h the car covers about 17 metres every second, so even a 2-second microsleep is dangerous.

Visible signs of drowsiness include:
- **Eyes staying closed longer than a blink.** This is the one we detect.
- Slow, heavy blinking.
- Yawning.
- The head nodding forward.

## How we detect drowsiness

We watch for **eyes that stay closed longer than a normal blink**, in three steps.

**Step 1: find the eyes.** MediaPipe Face Landmarker places 478 points on the driver's face in every camera frame. Six of those points outline each eye:

```
        p2    p3
   p1              p4        p1, p4 = eye corners
        p6    p5             p2, p3 = upper lid; p6, p5 = lower lid
```

**Step 2: measure how open the eye is with the Eye Aspect Ratio (EAR).**

```
EAR = ( |p2 − p6| + |p3 − p5| ) / ( 2 × |p1 − p4| )
        eye height (measured twice)     eye width
```

Example with an eye 30 px wide:

| Eye | Height measurements | EAR |
|---|---|---|
| Open | 9 px and 9 px | (9 + 9) / (2 × 30) = **0.30** |
| Closed | 2 px and 2 px | (2 + 2) / (2 × 30) = **0.07** |

EAR is a ratio, so it gives the same value whether the driver sits close to or far from the camera. Both eyes are averaged. **EAR below 0.22 counts as "eyes closed".**

**Step 3: rule out normal blinks (temporal validation).** A normal blink lasts only 0.1–0.4 seconds, so a single closed-eye frame means nothing.
- The eyes must stay closed **continuously for 1.5 seconds** before we confirm drowsiness. If they open, the timer resets.
- Once confirmed, the eyes must stay open for **1 second** before the alert clears, so the state doesn't flicker.

When drowsiness is confirmed:
- The voice says "Warning. Your eyes appear to be closed. Please stay alert."
- The simulated car slows to 30 km/h and sounds the horn.
- The alert is logged, e.g. "Drowsiness detected (EAR: 0.18)".

**What the Drowsiness card shows**

| Shows | Meaning |
|---|---|
| **Not Drowsy** | Eyes open (EAR ≥ 0.22) |
| **Eyes Closing** | Eyes closed, but not yet for 1.5 s (could still be a blink) |
| **Drowsy** | Eyes closed for 1.5 s or more (confirmed) |

The line underneath compares the driver's EAR with their own normal EAR. That personal baseline is the average open-eye EAR over roughly the last 10 seconds.
- **EAR stable:** EAR is normal for this driver.
- **EAR dropping:** EAR has fallen below 85% of the baseline. The eyes are getting heavy, an early warning sign.
- **Eyes closed:** EAR is below 0.22.

## The other dashboard metrics

### Eye Aspect Ratio (EAR) card
The live EAR value from above. The sparkline shows about the last 9 seconds; the dashed line is the 0.22 closed-eye threshold. Blinks appear as short dips and drowsiness as a long dip below the line.

### Head Position (yaw and pitch)
MediaPipe also returns a **transformation matrix** describing how the face is rotated in 3-D. We convert it to angles:

| Value | Meaning | Example |
|---|---|---|
| **Yaw** | Turning left/right (like saying "no") | `12° Right` |
| **Pitch** | Tilting up/down (like nodding) | `3° Down` |

**"Looking away" is detected with the V1 rule, not the angles.** We measure how far the nose tip is from each edge of the face:

```
ratio = distance(nose, left face edge) / (distance to left edge + distance to right edge)
```

- A centred face gives a ratio of about 0.5.
- A ratio above 0.60 means the head is turned **LEFT**; below 0.40 means **RIGHT**.
- Like drowsiness, it must last **1.5 seconds** before it counts. Then "Warning. Please keep your eyes on the road." plays and the car slows.

The degree values are for display. They make the head position easier to read and aren't used to trigger alerts.

### Gaze Direction
The head can point forward while the eyes look sideways, so gaze combines both:

```
gaze = head angle + eye rotation
       (yaw/pitch)   (iris position inside the eye × 30° left/right, × 20° up/down)
```

The iris centre comes from MediaPipe's iris points: in the middle of the eye means looking straight, near a corner means looking sideways.
- The dot in the circle shows where the driver is looking, plotted from the driver's point of view.
- Labels: **Center**, **Left/Right** (beyond ±15°), **Up/Down** (beyond ±12°), or combinations like **Down-Right**.
- Gaze is shown for information only and doesn't trigger alerts.

### Phone Detection
**YOLO11n** is an object-detection neural network trained on the COCO dataset of 80 everyday objects, one of which is "cell phone". It looks at the whole frame in one pass and returns boxes with a **confidence** from 0 to 1.

| Shows | Meaning |
|---|---|
| **Not Detected** | No phone with confidence ≥ 0.50 |
| **Possible Phone** | Phone seen (≥ 0.50), but not yet for 1.5 s |
| **Detected** | Phone seen continuously for 1.5 s: alert, voice warning, car slows |

**Confidence** is YOLO's best phone score in the current frame, shown even when it's below 0.50. For example, 0.08 means the network finds something only faintly phone-like. Only 0.50 or higher counts as a phone.

### Driver Attention Score (0–100)
A single summary number, **computed with our own scoring rules** rather than an industry-standard formula. It starts at 100 and subtracts penalties:

| Signal | Penalty |
|---|---|
| Eyes nearly closed (EAR near 0.22) | up to −10 |
| Eyes closed | −25, rising to −60 as the 1.5 s drowsiness timer fills |
| Head turned more than 10° | up to −30 (maximum at 40°) |
| Head tilted down more than 15° | up to −15 |
| Head turned toward confirmation (1.5 s timer) | up to −20 |
| Phone confidence | up to −20 |
| Phone timer toward confirmation | up to −30 |

A confirmed condition also caps the score:

| Confirmed condition | Score can't exceed |
|---|---|
| Critical (two or more conditions) | 15 |
| Drowsy | 30 |
| Phone | 40 |
| Looking away | 45 |

The score is smoothed: it drops within about half a second but recovers more gently, so it doesn't jump around.

| Score | Label |
|---|---|
| 75–100 | **ATTENTIVE:** good focus on driving |
| 50–74 | **REDUCED ATTENTION** |
| 25–49 | **DISTRACTED** |
| 0–24 | **CRITICAL** |

The **State** line in the camera overlay shows the same label.

### Distraction Severity (0–100)
Where the attention score says how focused the driver is, severity says **how dangerous the current situation is**. It takes the highest of three values:
1. **The confirmed condition:** Critical 95, Drowsy 85, Phone 70, Looking away 60.
2. **A condition building up:** up to 45, as a 1.5 s timer fills.
3. **General inattention:** half of (100 − attention score).

| Score | Label |
|---|---|
| 0–24 | **Low** |
| 25–49 | **Moderate** |
| 50–74 | **High** |
| 75–100 | **Critical** |

Drowsiness ranks above phone use and looking away because a sleeping driver can't react at all.

### Vehicle Speed (simulated)
Not a real car. The simulated vehicle:
- **Cruises at 60 km/h** when the driver is attentive.
- **Slows to 30 km/h** at 7.5 km/h per second when any condition is confirmed (SLOWING, then SLOWED).
- **Speeds back up** at 5 km/h per second once attention returns (ACCELERATING, then MOVING).

The yellow marker on the speedometer is the **target speed**. The road animation moves at the current speed.

### Recent Alerts
Every warning, with its time and the measurement that caused it, for example "Phone detected (Confidence: 0.72)" or "Looking right for 2 seconds". Colours: red is critical/drowsiness, amber is a warning, blue is information.

### System Status and camera figures

| Item | What it measures |
|---|---|
| **FPS** (on the camera) | Frames the webcam delivers per second, counted every second (typically 15–20) |
| **AI Model** | Whether MediaPipe and YOLO loaded successfully |
| **Camera** | Whether the webcam is delivering frames |
| **Real-time Processing** | Frames the AI analyses per second, and milliseconds per frame (about 45 ms when the laptop isn't busy) |
| **Data Logging** | Whether this session is being saved to `logs/session_*.jsonl` |
| **Voice Assistant** | Ready, or Speaking while an announcement plays |

## Limitations worth mentioning in a presentation
- EAR can read lower with some glasses, strong reflections, or a camera placed well below the eyes. The 0.22 threshold may need adjusting per person.
- We detect **eye closure** only, not yawning or head nodding.
- A normal webcam struggles in darkness. Production systems use infrared cameras.
- The attention score and severity are our own rule-based summaries; they haven't been validated in real driving.

I can add this as a "Metrics explained" section to your presentation documentation if you'd like.