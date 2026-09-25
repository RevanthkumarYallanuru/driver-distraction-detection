# AI-Based Real-Time Driver Distraction Detection and Response System

A real-time driver-monitoring prototype. A webcam watches the driver; computer-vision
models detect **eye closure (drowsiness)**, **looking away from the road** and
**mobile-phone use**; a JARVIS-inspired assistant **speaks and displays warnings**;
and a **simulated vehicle** slows down while the driver is distracted, then
accelerates back once attention is restored.

> **Simulation notice.** The vehicle, its speed and its horn are **simulated**.
> This project does not connect to, or control, any real vehicle.

---

## Versions

### Version 1: desktop prototype (`src/`)

A single OpenCV window (`src/driver_monitor.py`) with:

- webcam capture
- MediaPipe Face Landmarker (Tasks API): Eye Aspect Ratio (EAR) and head direction
- YOLO11n cell-phone detection (COCO class 67)
- temporal validation (a condition must persist 1.5 s before it counts)
- pyttsx3 voice warnings with a 5 s cooldown

V1 is kept unchanged and still runs: `python src/driver_monitor.py`.
The other files in `src/` are the standalone experiments V1 was built from.

### Version 2: web dashboard (`backend/` + `frontend/`)

V2 turns the V1 logic into services behind a FastAPI backend and adds a live React
dashboard:

- **Left:** the live driver camera with a light detection overlay (face brackets,
  eye landmarks, phone bounding boxes, eye/head/phone readout).
- **Right:** an animated **simulated vehicle** with speed, target speed and status
  (MOVING / SLOWING / SLOWED / ACCELERATING / HORNED), plus the reason for any
  speed change.
- **AI status:** eyes, head, phone and driver state, each with a bar showing how far
  the condition is toward its sustained-duration confirmation.
- **Telemetry, speed trend and event log** updated in real time over a WebSocket.
- **JARVIS-inspired announcements:** every alert is shown on screen *and* spoken.

---

## How it behaves

| Driver | AI | Vehicle | Announcement |
|---|---|---|---|
| Eyes on road | `NORMAL` | `MOVING` at 60 km/h | none |
| Looks left/right for ≥ 1.5 s | `DISTRACTED` | `SLOWING` 60 → 30, then `SLOWED` | "Warning. Please keep your eyes on the road." |
| Phone visible for ≥ 1.5 s | `DISTRACTED` | slows / stays at 30 km/h | "Warning. Mobile phone usage detected. Please focus on driving." |
| Eyes closed for ≥ 1.5 s | `DROWSY` | slows + automatic horn | "Warning. Your eyes appear to be closed. Please stay alert." |
| Two or more at once | `CRITICAL` | slows + automatic horn | "Critical warning. Multiple signs of driver distraction detected." (one voice, not three) |
| Attention returns (clear for 1 s) | `NORMAL` | `ACCELERATING` 30 → 60, then `MOVING` | "Driver attention restored." (once) |

Speed always changes smoothly (7.5 km/h/s braking, 5 km/h/s acceleration, eased near the
target). It never jumps.

### Alert policy (`backend/services/alert_manager.py`)

- Priority: **CRITICAL > DROWSINESS > PHONE > LOOKING_AWAY**. Simultaneous conditions
  merge into one critical alert.
- Each alert type has its own cooldown (5 s; critical 6 s). While a condition persists,
  its warning repeats once per cooldown, as in V1.
- Escalating to a more severe alert skips the cooldown.
- "Attention restored" is announced once per distraction episode.

### Voice (`backend/services/voice_service.py`)

- One dedicated voice thread speaks one announcement at a time, so voices never overlap.
- At most one announcement waits in line. A newer, equally or more important
  announcement replaces it, and anything older than 4 s is dropped, so stale warnings
  don't pile up.
- The voice is a calm synthetic system voice (pyttsx3 / the OS voice). It is *inspired
  by* a futuristic assistant and does not imitate any real actor or character voice.
- On Windows, reusing one pyttsx3 SAPI5 engine inside a thread silently skips every
  announcement after the first. The worker therefore creates an engine per
  announcement (never per frame), which was verified to speak every time.

---

## Architecture

```
            ┌──────────────── backend (FastAPI, Python) ─────────────────┐
 webcam ──▶ │ CameraService ──▶ AIEngine ─────────▶ MonitoringSystem    │
 (1 owner)  │  (thread)          (thread)            (asyncio, 10 Hz)    │
            │     │               MediaPipe EAR/head   ├─ AlertManager ──┼──▶ VoiceService ──▶ speakers
            │     │               YOLO phone           ├─ VehicleSimulator│      (thread, pyttsx3)
            │     │               temporal validation  └─ TelemetryService┼──┐
            └─────┼────────────────────────────────────────────────────────┘  │
                  │ MJPEG  /api/stream                    WebSocket /ws/telemetry
                  ▼                                                          ▼
            ┌──────────────────── frontend (React, TypeScript) ──────────────────┐
            │ CameraPanel + DetectionOverlay │ VehiclePanel + VehicleScene        │
            │ AIStatusStrip · TelemetryPanel · SpeedTrend · EventLog · Announcements│
            └─────────────────────────────────────────────────────────────────────┘
```

- **Only `CameraService` opens the webcam.** The AI engine and the MJPEG stream both
  read its latest frame, so any number of browser tabs share one camera.
- **Models load once**, on the AI thread at startup. The API is reachable while they load
  (the UI shows "AI LOADING").
- **All decisions happen on one asyncio loop** (alerts, vehicle, telemetry), so that
  state needs no locks.
- The **frontend never runs inference.** It draws what the backend reports. The camera
  image is sent clean; landmarks and boxes arrive as normalized coordinates in the
  telemetry and are drawn as SVG.
- Telemetry is pushed at 10 Hz (~1 KB per message); announcements and events are pushed
  as soon as they happen. The browser does **not** poll.

### WebSocket messages

```jsonc
// every 100 ms
{ "type": "telemetry", "speed": 38.2, "target_speed": 30, "vehicle_status": "SLOWING",
  "driver_status": "DISTRACTED", "head_direction": "LEFT", "ear": 0.31,
  "phone_detected": false, "drowsiness_detected": false, "looking_away": true,
  "distraction_detected": true, "alert_type": "LOOKING_AWAY",
  "alert_message": "Please keep your eyes on the road.", "alert_level": "WARNING",
  "camera": {...}, "ai": {...}, "voice": {...}, "overlay": {...}, ... }

// immediately when an alert fires
{ "type": "announcement", "announcement": { "title": "DRIVER DISTRACTION",
  "message": "Please keep your eyes on the road.",
  "voice": "Warning. Please keep your eyes on the road.",
  "detail": "Vehicle slowing to 30 km/h", "level": "WARNING", ... } }

// vehicle / system events (HORNED, SPEED REDUCED, CAMERA DISCONNECTED, ...)
{ "type": "event", "kind": "SPEED REDUCED", "message": "Holding reduced speed 30 km/h", ... }
```

### HTTP endpoints

| Endpoint | Purpose |
|---|---|
| `GET /api/stream` | MJPEG camera stream |
| `WS /ws/telemetry` | real-time telemetry, announcements, events |
| `GET /api/health` | camera / AI / voice status |
| `POST /api/vehicle/horn` | sound the simulated horn |
| `POST /api/debug/simulate` | *debug only:* inject a confirmed condition (see Testing) |

---

## Tech stack

**Backend:** Python, FastAPI, Uvicorn, OpenCV, MediaPipe Tasks (Face Landmarker),
Ultralytics YOLO11n, PyTorch, pyttsx3.
**Frontend:** React 19, TypeScript, Vite, Tailwind CSS 4, Framer Motion, Lucide icons,
Recharts (speed-trend chart only).

## Folder structure

```
driver-distraction-detection/
├── backend/
│   ├── main.py                    FastAPI app, lifespan, serves the built frontend
│   ├── config.py                  all thresholds & settings (env-overridable)
│   ├── api/routes.py              REST, MJPEG stream, WebSocket
│   ├── services/
│   │   ├── camera_service.py      single webcam owner, auto-reconnect
│   │   ├── ai_engine.py           per-frame detection + temporal validation
│   │   ├── detection/
│   │   │   ├── geometry.py        V1 EAR + head-ratio maths
│   │   │   ├── face_analyzer.py   MediaPipe Face Landmarker (Tasks API)
│   │   │   ├── phone_detector.py  YOLO phone detection
│   │   │   └── temporal.py        sustained-duration validation
│   │   ├── alert_manager.py       priority, cooldowns, announcements
│   │   ├── voice_service.py       single voice worker thread
│   │   ├── vehicle_simulator.py   smooth speed + vehicle state machine
│   │   ├── telemetry_service.py   WebSocket fan-out, event history
│   │   └── monitoring_system.py   wires everything together
│   ├── tests/                     pytest suite
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── components/            camera/, vehicle/, telemetry/, alerts/, layout/, ui/
│       ├── hooks/                 store selectors, animated speed
│       ├── services/              WebSocket client + telemetry store
│       ├── pages/Dashboard.tsx
│       └── types/telemetry.ts
├── models/face_landmarker.task
├── yolo11n.pt
├── src/                           Version 1 (unchanged)
└── README.md
```

---

## Setup

### Prerequisites

- Python 3.10+ (developed on 3.14)
- Node.js 20+ and npm
- A webcam
- Windows, macOS or Linux (voice uses SAPI5 on Windows, NSSpeechSynthesizer on macOS,
  eSpeak on Linux; on Linux install `espeak-ng`)

### Python / backend

```bash
python -m venv venv
venv\Scripts\activate            # Windows
# source venv/bin/activate       # macOS / Linux
python -m pip install --upgrade pip
pip install -r backend/requirements.txt
```

### Frontend

```bash
cd frontend
npm install
```

### Models

- `models/face_landmarker.task`: MediaPipe Face Landmarker, included in the repo. If it's
  missing, download `face_landmarker.task` from the MediaPipe Face Landmarker docs into
  `models/`.
- `yolo11n.pt`: included at the project root (`models/yolo11n.pt` also works). Ultralytics
  can download it automatically if you delete it.

If a model is missing, the backend keeps running: the dashboard shows **AI DEGRADED** and
explains which detector is unavailable.

---

## Running

### Development (two terminals, hot reload)

Terminal 1 (backend):

```bash
cd backend
uvicorn main:app --reload
```

Terminal 2 (frontend):

```bash
cd frontend
npm run dev
```

Browser: <http://localhost:5173>. Vite proxies `/api` and `/ws` to the backend on port 8000.

### One command (built dashboard, auto-opens the browser)

```bash
cd frontend && npm run build && cd ..
python backend/main.py
```

This starts the backend, AI engine and camera, serves the dashboard at
<http://localhost:8000> and opens it in your browser. Pass `--no-browser` to skip that.

### Camera permissions

The **backend** process opens the webcam, not the browser, so the browser never asks for
camera permission. If the dashboard shows **CAMERA DISCONNECTED**:

- Windows: *Settings → Privacy & security → Camera* → allow desktop apps to use the camera.
- macOS: allow your terminal app under *System Settings → Privacy & Security → Camera*.
- Close other apps using the camera (Teams, Zoom, the V1 app).
- Check for a privacy shutter or camera kill-switch key. With the shutter closed, many
  laptops deliver a "camera blocked" image, so the feed is live but no face is detected.
- Use `CAMERA_INDEX=1` if you have several cameras.

The backend retries every 2 s, so the dashboard recovers on its own once the camera is
available.

### Configuration

All V1 thresholds are kept and can be overridden with environment variables. Examples:

| Variable | Default | Meaning |
|---|---|---|
| `EAR_THRESHOLD` | 0.22 | below = eyes closed |
| `DROWSINESS_TIME` / `LOOK_AWAY_TIME` / `PHONE_DETECTION_TIME` | 1.5 s | time a condition must persist |
| `PHONE_CONFIDENCE` | 0.50 | YOLO confidence |
| `WARNING_COOLDOWN` | 5 s | per-alert voice cooldown |
| `RECOVERY_TIME` | 1.0 s | time a condition must stay clear before release |
| `NORMAL_SPEED` / `REDUCED_SPEED` | 60 / 30 km/h | simulated speeds |
| `YOLO_EVERY_N_FRAMES` | 1 | run YOLO less often on slow CPUs |
| `VOICE_ENABLED` | 1 | turn voice off with `0` |
| `CAMERA_INDEX` | 0 | webcam index |

---

## Testing

```bash
cd backend
python -m pytest
```

The suite covers the V1 EAR and head-direction maths, temporal validation, alert priority,
cooldowns and escalation, vehicle smoothness and state transitions, and the real models:
MediaPipe finds a face and computes EAR and head direction on the Ultralytics sample image
(including a mirrored copy), YOLO runs, and a missing model fails cleanly.

To exercise the alert → voice → vehicle chain without acting it out in front of the
camera, start the backend with debug endpoints and inject a confirmed condition:

```bash
python backend/main.py --debug
curl -X POST localhost:8000/api/debug/simulate -H "Content-Type: application/json" -d "{\"condition\":\"PHONE\",\"seconds\":6}"
```

Injected conditions are labeled **TEST INJECTION** on the dashboard. The endpoint is off
unless you pass `--debug` or set `DEBUG_ENDPOINTS=1`.

---

## Limitations

- **Simulated vehicle only.** No vehicle hardware or CAN bus is involved. Emergency stopping
  (`STOPPING` / `STOPPED`) is built into the simulator but no AI condition triggers it yet.
- Head direction is the V1 nose-to-face-edge ratio: it detects left/right turns, not
  pitch (looking down).
- EAR depends on camera angle, lighting and glasses. Tune `EAR_THRESHOLD` per driver if
  needed.
- YOLO11n on CPU runs at roughly 10–20 fps together with MediaPipe. Use
  `YOLO_EVERY_N_FRAMES=2` on slower machines.
- If no face is visible, the driver status is **NO FACE** and no distraction is raised
  (same as V1).
- If the camera drops, the AI pauses and the vehicle holds its current state. It neither
  brakes nor accelerates on missing data.
- Voice quality depends on the operating system's installed voices.
