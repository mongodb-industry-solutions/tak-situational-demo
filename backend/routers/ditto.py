import json
import os

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

router = APIRouter()


def _local_identity() -> dict | None:
    """Build the Ditto identity payload for a self-hosted Big Peer, or None.

    Returns None when the local Big Peer values aren't configured, which is the
    signal to fall back to the pre-made S3 asset (the internal cloud path).
    """
    app_id = os.getenv("DITTO_APP_ID", "").strip()
    auth_url = os.getenv("DITTO_AUTH_URL", "").strip().rstrip("/")
    ws_url = os.getenv("DITTO_WS_URL", "").strip().rstrip("/")
    token = os.getenv("DITTO_PLAYGROUND_TOKEN", "").strip()

    if not (app_id and token and (auth_url or ws_url)):
        return None

    # A Small Peer using an OnlinePlayground identity targets Ditto Cloud by
    # default. To reach a self-hosted Big Peer it needs all four values: the
    # app id, the shared token, a custom auth URL, and a websocket URL — plus
    # cloud sync switched off.
    #
    # Field names follow the Ditto quickstart .env contract (DITTO_APP_ID,
    # DITTO_PLAYGROUND_TOKEN, DITTO_AUTH_URL, DITTO_WEBSOCKET_URL).
    #
    # NOTE (unverified): the exact payload the ATAK Ditto Edge Sync plugin
    # expects from a scanned QR has not been confirmed against a device. The
    # plugin may well expect a different shape, in which case enter these
    # values by hand in the plugin's settings instead — /api/ditto/identity
    # returns the same data as JSON for that purpose.
    # See docs/RUN_LOCAL.md ("Pairing an ATAK device").
    return {
        "appId": app_id,
        "playgroundToken": token,
        "authUrl": auth_url
        or ws_url.replace("ws://", "http://").replace("wss://", "https://"),
        "websocketUrl": ws_url
        or auth_url.replace("http://", "ws://").replace("https://", "wss://"),
        # The plugin must not fall back to Ditto Cloud for sync.
        "enableDittoCloudSync": False,
    }


@router.get("/ditto/identity")
async def get_ditto_identity():
    """Return the Big Peer connection details as JSON (self-hosted runs only).

    Useful when a QR can't be scanned, or to type the values straight into the
    ATAK plugin's settings screen. The playground token is a demo credential, so
    this is only exposed when running against a self-hosted Big Peer — never for
    the cloud deployment.
    """
    identity = _local_identity()
    if identity is None:
        raise HTTPException(
            status_code=404,
            detail="No self-hosted Big Peer configured (this is the cloud deployment)",
        )
    return identity


@router.get("/ditto/qr")
def get_ditto_qr():
    # Plain `def`, not `async def`: the cloud path makes blocking boto3 calls
    # (get_object + StreamingBody.read) and the local path renders a PNG.
    # FastAPI runs sync handlers in its threadpool, so a slow S3 request can't
    # stall the dashboard's polling or the health probe.
    """Serve the ATAK Ditto-mesh join QR code.

    Two modes, picked automatically:

    1. Self-hosted (local kind stack) — generate the QR in-process from the
       DITTO_APP_ID / DITTO_AUTH_URL / DITTO_WS_URL / DITTO_PLAYGROUND_TOKEN
       values that scripts/setup.sh injects. Nothing to pre-bake, and the QR
       stays correct even though the Big Peer host depends on the laptop's
       current LAN IP.

    2. Cloud (internal Kanopy deployment) — stream a pre-made PNG from private
       S3. The QR encodes a real Ditto Cloud credential, so it must never be
       committed or served from a public URL; S3 credentials resolve server-side
       (IRSA / local role) and the browser only ever sees image bytes.
    """
    identity = _local_identity()
    if identity is not None:
        try:
            import qrcode  # lazy — only needed for the self-hosted path
        except ImportError:
            raise HTTPException(
                status_code=503,
                detail="qrcode not installed — run `make uv_sync` (or use /api/ditto/identity)",
            )

        # compact separators keep the payload small, which keeps the QR
        # low-density and therefore easy for a phone camera to read.
        payload = json.dumps(identity, separators=(",", ":"))
        img = qrcode.make(payload)

        import io

        buf = io.BytesIO()
        img.save(buf, format="PNG")
        return Response(
            content=buf.getvalue(),
            media_type="image/png",
            # The LAN IP (and so the payload) can change between runs.
            headers={"Cache-Control": "no-store"},
        )

    bucket = os.getenv("S3_ASSET_BUCKET", "").strip()
    key = os.getenv("S3_ASSET_KEY", "").strip()
    region = os.getenv("S3_ASSET_REGION", "").strip() or "us-east-1"
    if not bucket or not key:
        raise HTTPException(
            status_code=503,
            detail=(
                "No Ditto identity configured. Set DITTO_APP_ID + DITTO_PLAYGROUND_TOKEN "
                "+ DITTO_AUTH_URL/DITTO_WS_URL (self-hosted), or S3_ASSET_BUCKET + "
                "S3_ASSET_KEY (cloud)."
            ),
        )

    try:
        import boto3  # lazy — only needed to serve the QR
        from botocore.exceptions import BotoCoreError
    except ImportError:
        raise HTTPException(status_code=503, detail="boto3 not installed")

    try:
        client = boto3.client("s3", region_name=region)
    except BotoCoreError as e:
        # Cred-chain / missing-dependency failures (NoCredentialsError, ProfileNotFound,
        # MissingDependencyException, …) all subclass BotoCoreError — surface as a 503.
        raise HTTPException(status_code=503, detail=f"S3 client init failed: {e}")

    try:
        resp = client.get_object(Bucket=bucket, Key=key)
    except client.exceptions.NoSuchKey:
        raise HTTPException(status_code=404, detail=f"s3://{bucket}/{key} not found")
    except client.exceptions.NoSuchBucket:
        raise HTTPException(status_code=404, detail=f"bucket {bucket} not found")
    except Exception as e:  # noqa: BLE001 — surface any access/credential error to the client
        raise HTTPException(status_code=502, detail=f"S3 access failed: {e}")

    return Response(content=resp["Body"].read(), media_type="image/png")
