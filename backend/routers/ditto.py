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
    # These values are the *inputs* to the pairing material: the QR must encode
    # a PDL (Peer Ditto License), not this JSON — see _encode_pdl(). The same
    # dict is still served by /api/ditto/identity for typing the values into the
    # plugin by hand. See docs/RUN_LOCAL.md ("Pairing an ATAK device").
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


# ---------------------------------------------------------------------------
# PDL (Peer Ditto License) — what the ATAK plugin's QR actually has to contain.
#
# The plugin (com.dittofederal.atak.plugin) does NOT accept a plain identity
# JSON. Its IdentityParserV2 expects a PDL: urlsafe_base64(zlib(json)) whose
# keys map 1:1 to the plugin's TakDittoLicenseV2 fields:
#
#   lt=PDL  v=2  o=org  id=licenseId  cr=created(ms)  e=expires(ms)  co=count
#   p=[products]  f={features}  t=token  it=OP|SK  a=appId  ch=checksum
#   wu=websocketUrl  au=authUrl
#
# `it: "OP"` (OnlinePlayground) plus au/wu is how a self-hosted Big Peer is
# addressed. The plugin's checksum check is non-enforcing (it only logs), so the
# CRC below is computed for correctness rather than as a gate.
# ---------------------------------------------------------------------------

_PDL_EXPIRES_MS = 4102444800000  # 2100-01-01T00:00:00Z


def _pdl_checksum(payload: dict) -> int:
    """CRC32 over the license fields, mirroring the plugin's calcCrc()."""
    import binascii
    import struct

    def le32(n: int) -> bytes:
        return struct.pack("<I", n & 0xFFFFFFFF)

    def le64(n: int) -> bytes:
        return struct.pack("<Q", n & 0xFFFFFFFFFFFFFFFF)

    crc = binascii.crc32(payload["lt"].encode())
    crc = binascii.crc32(le32(payload["v"]), crc)
    crc = binascii.crc32(payload["o"].encode(), crc)
    crc = binascii.crc32(payload["id"].encode(), crc)
    crc = binascii.crc32(le64(payload["cr"]), crc)
    crc = binascii.crc32(le64(payload["e"]), crc)
    crc = binascii.crc32(le32(payload["co"]), crc)
    crc = binascii.crc32(payload["t"].encode(), crc)
    crc = binascii.crc32(payload["it"].encode(), crc)
    crc = binascii.crc32(payload["a"].encode(), crc)
    return crc & 0xFFFFFFFF


def _encode_pdl(identity: dict) -> str:
    """Encode an identity as the PDL text a scanned ATAK QR must contain."""
    import base64
    import time
    import zlib

    payload = {
        "lt": "PDL",
        "v": 2,
        "o": os.getenv("DITTO_PDL_ORG", "MongoDB Industry Solutions"),
        "id": os.getenv("DITTO_PDL_ID", identity["appId"]),
        "cr": int(time.time() * 1000),
        "e": _PDL_EXPIRES_MS,
        "co": 1,
        "p": ["ATAK"],
        "f": {},
        "t": identity["playgroundToken"],
        "it": "OP",
        "a": identity["appId"],
        "wu": identity["websocketUrl"],
        "au": identity["authUrl"],
    }
    payload["ch"] = _pdl_checksum(payload)
    raw = json.dumps(payload, separators=(",", ":")).encode()
    return base64.urlsafe_b64encode(zlib.compress(raw)).decode()


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

        # The plugin rejects a plain identity JSON — the QR has to carry a PDL.
        # Compact separators keep it small, which keeps the QR low-density and
        # therefore easy for a phone camera to read.
        payload = _encode_pdl(identity)
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
