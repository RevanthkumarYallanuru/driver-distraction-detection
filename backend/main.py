"""
AI Driver Monitoring System — Version 2 backend.

Development:
    cd backend
    uvicorn main:app --reload        (frontend: cd frontend && npm run dev)

All-in-one (after `npm run build` in frontend/):
    python backend/main.py           -> serves the dashboard and opens it
"""

import logging
import os
import sys
import threading
import webbrowser
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

# Allow `python backend/main.py` from the project root.
sys.path.insert(0, str(Path(__file__).resolve().parent))

# CLI conveniences (must be applied before config is imported).
if __name__ == "__main__":
    if "--no-browser" in sys.argv:
        os.environ["OPEN_BROWSER"] = "0"
    if "--debug" in sys.argv:
        os.environ["DEBUG_ENDPOINTS"] = "1"

from api.routes import router  # noqa: E402
from config import settings  # noqa: E402
from services.monitoring_system import MonitoringSystem  # noqa: E402

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("driver-monitor")


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("==============================")
    log.info(" AI DRIVER MONITORING SYSTEM v2")
    log.info("==============================")
    system = MonitoringSystem(settings)
    app.state.system = system
    await system.start()
    try:
        yield
    finally:
        log.info("Shutting down monitoring system")
        await system.stop()


app = FastAPI(title="AI Driver Monitoring System", version="2.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)


# Serve the production frontend build, if present.
if settings.frontend_dist.exists():
    app.mount(
        "/assets",
        StaticFiles(directory=settings.frontend_dist / "assets"),
        name="assets",
    )

    @app.get("/{path:path}", include_in_schema=False)
    async def spa(path: str):
        candidate = settings.frontend_dist / path
        if path and candidate.is_file():
            return FileResponse(candidate)
        # Never cache the HTML shell so a rebuilt dashboard loads immediately.
        return FileResponse(
            settings.frontend_dist / "index.html",
            headers={"Cache-Control": "no-cache"},
        )


if __name__ == "__main__":
    import uvicorn

    url = f"http://localhost:{settings.port}"
    if not settings.frontend_dist.exists():
        url = "http://localhost:5173"
        log.warning("frontend/dist not found; start the Vite dev server (npm run dev)")

    if settings.open_browser:
        threading.Timer(2.5, lambda: webbrowser.open(url)).start()

    uvicorn.run(app, host=settings.host, port=settings.port, log_level="info")
