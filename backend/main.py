import os

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

from routers import (
    alerts,
    chat,
    ditto,
    files,
    genymotion,
    mapitems,
    systemai,
    telemetry,
    tracks,
)

app = FastAPI(title="TAK Situational Demo")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(tracks.router, prefix="/api")
app.include_router(chat.router, prefix="/api")
app.include_router(mapitems.router, prefix="/api")
app.include_router(alerts.router, prefix="/api")
app.include_router(files.router, prefix="/api")
app.include_router(telemetry.router, prefix="/api")
app.include_router(systemai.router, prefix="/api")
app.include_router(genymotion.router, prefix="/api")
app.include_router(ditto.router, prefix="/api")


def _truthy(value: str | None) -> bool:
    return (value or "").strip().lower() in ("1", "true", "yes", "on")


@app.get("/api/health")
async def api_health():
    """Liveness/readiness probe target.

    Deliberately cheap — no database round-trip — because the Kubernetes probes
    in infra/local/backend.yaml and environment/*.yaml hit it on a short
    interval. Use /api/features to see what is actually wired up.
    """
    return {"status": "ok"}


@app.get("/api/features")
async def api_features():
    """Advertise which optional capabilities this deployment has.

    The same image runs locally (self-hosted MongoDB EA + Ditto Big Peer) and on
    Kanopy (Atlas + Ditto Cloud), with different things configured. The frontend
    reads this to decide what to render, so a fresh clone shows a coherent UI
    instead of panels that fail on every call.
    """
    devices = genymotion.configured_devices()
    return {
        # Paused internal work (Genymotion-backed ATAK emulation). Hidden unless
        # explicitly switched on AND at least one device is configured, so
        # nobody is shown a view that cannot connect to anything.
        "simulate": _truthy(os.getenv("ENABLE_SIMULATE")) and bool(devices),
        # Which emulated devices exist (e.g. ["alpha"]). The Simulate view
        # renders only these rather than assuming both ALPHA and BRAVO.
        "simulateDevices": devices,
        # True when a Ditto identity can be produced for ATAK pairing — either a
        # self-hosted Big Peer or the cloud QR asset in S3. Uses the same check
        # as the endpoints that serve it, so a partial self-hosted config (e.g.
        # no auth/websocket URL) fails closed instead of showing a broken QR.
        "joinMesh": ditto._local_identity() is not None
        or bool(os.getenv("S3_ASSET_BUCKET") and os.getenv("S3_ASSET_KEY")),
    }


@app.get("/")
async def health():
    return {"message": "Server is running"}
