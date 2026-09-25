"""
CameraService — the ONLY component that touches the physical webcam.

A single background thread reads frames and keeps the latest one
(plus a JPEG encoding of it for the MJPEG stream). Consumers never
open their own capture. If the camera is missing or stops delivering
frames, the thread keeps retrying instead of crashing the app.
"""

import logging
import sys
import threading
import time
from typing import Optional, Tuple

import cv2
import numpy as np

log = logging.getLogger(__name__)

# How many consecutive failed reads before we reopen the device.
MAX_READ_FAILURES = 15


class CameraService:

    def __init__(
        self,
        index: int = 0,
        width: int = 640,
        height: int = 480,
        retry_seconds: float = 2.0,
        jpeg_quality: int = 75,
    ):
        self.index = index
        self.width = width
        self.height = height
        self.retry_seconds = retry_seconds
        self.jpeg_quality = jpeg_quality

        self._lock = threading.Lock()
        self._frame_ready = threading.Condition(self._lock)
        self._frame: Optional[np.ndarray] = None
        self._jpeg: Optional[bytes] = None
        self._frame_id = 0

        self._connected = False
        self._error: Optional[str] = "Camera starting"
        self._fps = 0.0

        self._stop = threading.Event()
        self._thread: Optional[threading.Thread] = None

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(target=self._run, name="camera", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        with self._frame_ready:
            self._frame_ready.notify_all()
        if self._thread:
            self._thread.join(timeout=3)

    # ------------------------------------------------------------------
    # Consumer API
    # ------------------------------------------------------------------

    @property
    def connected(self) -> bool:
        return self._connected

    @property
    def error(self) -> Optional[str]:
        return self._error

    @property
    def fps(self) -> float:
        return self._fps

    def wait_for_frame(
        self, after_id: int, timeout: float = 1.0
    ) -> Tuple[int, Optional[np.ndarray]]:
        """Block until a frame newer than after_id exists (or timeout)."""
        with self._frame_ready:
            if self._frame_id <= after_id and not self._stop.is_set():
                self._frame_ready.wait(timeout)
            if self._frame_id <= after_id:
                return after_id, None
            return self._frame_id, self._frame

    def latest_jpeg(self) -> Tuple[int, Optional[bytes]]:
        with self._lock:
            return self._frame_id, self._jpeg

    # ------------------------------------------------------------------
    # Capture thread
    # ------------------------------------------------------------------

    def _open(self) -> Optional[cv2.VideoCapture]:
        # DirectShow opens much faster than MSMF on most Windows webcams.
        backends = [cv2.CAP_DSHOW, cv2.CAP_ANY] if sys.platform == "win32" else [cv2.CAP_ANY]

        for backend in backends:
            cap = cv2.VideoCapture(self.index, backend)
            if cap.isOpened():
                cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.width)
                cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.height)
                cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                ok, _ = cap.read()
                if ok:
                    return cap
            cap.release()
        return None

    def _set_disconnected(self, message: str) -> None:
        if self._connected or self._error != message:
            log.warning("Camera: %s", message)
        self._connected = False
        self._error = message
        self._fps = 0.0

    def _run(self) -> None:
        encode_params = [int(cv2.IMWRITE_JPEG_QUALITY), self.jpeg_quality]

        while not self._stop.is_set():
            cap = self._open()

            if cap is None:
                self._set_disconnected(f"Camera {self.index} unavailable")
                self._stop.wait(self.retry_seconds)
                continue

            log.info("Camera %s connected", self.index)
            self._connected = True
            self._error = None

            failures = 0
            fps_window_start = time.monotonic()
            fps_count = 0

            while not self._stop.is_set():
                ok, frame = cap.read()

                if not ok or frame is None:
                    failures += 1
                    if failures >= MAX_READ_FAILURES:
                        self._set_disconnected("Camera frame read failed")
                        break
                    time.sleep(0.02)
                    continue

                failures = 0

                ok, buffer = cv2.imencode(".jpg", frame, encode_params)
                jpeg = buffer.tobytes() if ok else None

                with self._frame_ready:
                    self._frame = frame
                    if jpeg is not None:
                        self._jpeg = jpeg
                    self._frame_id += 1
                    self._frame_ready.notify_all()

                fps_count += 1
                elapsed = time.monotonic() - fps_window_start
                if elapsed >= 1.0:
                    self._fps = fps_count / elapsed
                    fps_count = 0
                    fps_window_start = time.monotonic()

            cap.release()
            if not self._stop.is_set():
                self._stop.wait(self.retry_seconds)

        self._connected = False
