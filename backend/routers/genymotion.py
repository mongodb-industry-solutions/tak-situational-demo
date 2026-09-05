import os

from fastapi import APIRouter, HTTPException

router = APIRouter()

# One always-on Genymotion PaaS EC2 instance per device label. The WebSocket
# signalling endpoint on these boxes is NOT behind the console's Basic Auth (verified
# 2026-09-04: a bare WS upgrade to wss://<host>/ with zero credentials returns a clean
# 101 Switching Protocols). Auth is the in-band `{type:"token", token}` message the
# player sends after connecting, and the value the console itself uses for that token
# is simply the EC2 instance id — so that's what we hand the browser too.
#
# Pausing/resuming the underlying EC2 instance (ec2:StartInstances/StopInstances) is
# intentionally NOT implemented yet — pending an IAM scoping answer from IST platform
# (the service account's IRSA role may be shared across other Kanopy apps). Until
# that's resolved, every device below is treated as always-on: POST/GET report ONLINE
# immediately, DELETE is a no-op that only disconnects the player.
DEVICES = {
    "alpha": {
        "host": os.environ.get("GENYMOTION_PAAS_HOST_ALPHA"),
        "token": os.environ.get("GENYMOTION_PAAS_TOKEN_ALPHA"),
    },
    "bravo": {
        "host": os.environ.get("GENYMOTION_PAAS_HOST_BRAVO"),
        "token": os.environ.get("GENYMOTION_PAAS_TOKEN_BRAVO"),
    },
}


def _device(label: str):
    device = DEVICES.get((label or "").lower())
    if not device or not device["host"] or not device["token"]:
        raise HTTPException(
            500,
            f'no Genymotion device configured for "{label}" — set '
            f"GENYMOTION_PAAS_HOST_{label.upper()} / GENYMOTION_PAAS_TOKEN_{label.upper()}",
        )
    return device


@router.post("/genymotion/device")
async def start_device(body: dict):
    label = body.get("label")
    if not label:
        raise HTTPException(400, "label required")
    _device(label)  # validate it's configured
    return {"label": label, "state": "ONLINE"}


@router.get("/genymotion/device")
async def device_state(label: str):
    device = _device(label)
    return {"state": "ONLINE", "webrtcAddress": f"wss://{device['host']}", "token": device["token"]}


@router.delete("/genymotion/device")
async def stop_device(label: str):
    return {"ok": True, "state": "STOPPED"}
