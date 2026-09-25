"""HTTP + WebSocket endpoints. Thin layer over MonitoringSystem."""

import asyncio
import logging
from functools import lru_cache
from typing import Literal

import cv2
import numpy as np
from fastapi import APIRouter, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, Field

from services.monitoring_system import MonitoringSystem

log = logging.getLogger(__name__)

router = APIRouter()

BOUNDARY = "frame"


def get_system(request_or_ws) -> MonitoringSystem:
    return request_or_ws.app.state.system


@lru_cache(maxsize=1)
def placeholder_jpeg() -> bytes:
    """Frame shown in the MJPEG stream while the camera is unavailable."""
    image = np.full((480, 640, 3), (18, 14, 12), dtype=np.uint8)
    cv2.putText(image, "NO CAMERA SIGNAL", (178, 236),
                cv2.FONT_HERSHEY_SIMPLEX, 0.8, (120, 120, 120), 2, cv2.LINE_AA)
    cv2.putText(image, "retrying...", (268, 270),
                cv2.FONT_HERSHEY_SIMPLEX, 0.55, (90, 90, 90), 1, cv2.LINE_AA)
    ok, buffer = cv2.imencode(".jpg", image)
    return buffer.tobytes()


def _part(jpeg: bytes) -> bytes:
    return (
        b"--" + BOUNDARY.encode() + b"\r\n"
        b"Content-Type: image/jpeg\r\n"
        b"Content-Length: " + str(len(jpeg)).encode() + b"\r\n\r\n"
        + jpeg + b"\r\n"
    )


# ----------------------------------------------------------------------
# Status
# ----------------------------------------------------------------------

@router.get("/api/health")
async def health(request: Request):
    system = get_system(request)
    snap = system.engine.snapshot()
    return {
        "status": "ok",
        "camera": {"connected": system.camera.connected, "error": system.camera.error,
                   "fps": round(system.camera.fps, 1)},
        "ai": {"status": snap.ai_status, "messages": snap.ai_messages},
        "voice": {"enabled": system.voice.enabled, "available": system.voice.available},
        "websocket_clients": system.telemetry.client_count,
        "simulated_vehicle": True,
    }


@router.get("/api/telemetry")
async def telemetry_snapshot(request: Request):
    """One-off snapshot (debugging). The dashboard uses the WebSocket."""
    return get_system(request).telemetry.latest or {}


@router.get("/api/events")
async def events(request: Request):
    return get_system(request).telemetry.events


# ----------------------------------------------------------------------
# Camera stream (MJPEG) — frames come from the single CameraService
# ----------------------------------------------------------------------

@router.get("/api/stream")
async def stream(request: Request):
    system = get_system(request)
    interval = 1.0 / max(1.0, system.settings.stream_max_fps)

    async def frames():
        last_id = -1
        idle = 0.0
        while True:
            if await request.is_disconnected():
                break
            frame_id, jpeg = system.camera.latest_jpeg()
            if system.camera.connected and jpeg is not None and frame_id != last_id:
                last_id = frame_id
                idle = 0.0
                yield _part(jpeg)
            elif not system.camera.connected and idle <= 0:
                # Keep the connection alive with a placeholder once a second.
                yield _part(placeholder_jpeg())
                idle = 1.0
            await asyncio.sleep(interval)
            idle -= interval

    return StreamingResponse(
        frames(),
        media_type=f"multipart/x-mixed-replace; boundary={BOUNDARY}",
        headers={"Cache-Control": "no-cache, no-store", "Pragma": "no-cache"},
    )


@router.get("/api/snapshot.jpg")
async def snapshot(request: Request):
    _, jpeg = get_system(request).camera.latest_jpeg()
    return Response(jpeg or placeholder_jpeg(), media_type="image/jpeg")


# ----------------------------------------------------------------------
# Simulated vehicle commands
# ----------------------------------------------------------------------

@router.post("/api/vehicle/horn")
async def horn(request: Request):
    await get_system(request).sound_horn("Manual horn (dashboard)")
    return {"ok": True}


# ----------------------------------------------------------------------
# Debug helpers (DEBUG_ENDPOINTS=1 only): drive the pipeline without a
# driver in front of the camera, for testing the vehicle/alert flow.
# ----------------------------------------------------------------------

class SimulateRequest(BaseModel):
    condition: Literal["DROWSINESS", "PHONE", "LOOKING_AWAY"]
    seconds: float = Field(6.0, gt=0, le=60)


@router.post("/api/debug/simulate")
async def simulate(request: Request, body: SimulateRequest):
    system = get_system(request)
    if not system.settings.debug_endpoints:
        raise HTTPException(404, "Debug endpoints disabled (set DEBUG_ENDPOINTS=1)")
    system.engine.simulate(body.condition, body.seconds)
    return {"ok": True, "condition": body.condition, "seconds": body.seconds}


@router.post("/api/debug/clear")
async def clear_simulation(request: Request):
    system = get_system(request)
    if not system.settings.debug_endpoints:
        raise HTTPException(404, "Debug endpoints disabled (set DEBUG_ENDPOINTS=1)")
    system.engine.clear_simulation()
    return {"ok": True}


# ----------------------------------------------------------------------
# Real-time telemetry
# ----------------------------------------------------------------------

@router.websocket("/ws/telemetry")
async def telemetry_ws(websocket: WebSocket):
    system = get_system(websocket)
    await system.telemetry.connect(websocket)
    try:
        while True:
            # Incoming messages are only used as keep-alive pings.
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    except Exception:
        log.debug("WebSocket closed unexpectedly", exc_info=True)
    finally:
        system.telemetry.disconnect(websocket)
