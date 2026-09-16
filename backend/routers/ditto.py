import os

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

router = APIRouter()


@router.get("/ditto/qr")
async def get_ditto_qr():
    """Serve the ATAK Ditto-mesh join QR code from private S3.

    The QR encodes a Ditto identity credential, so it must never be committed
    to source or served from a public URL. It's a private S3 object read here
    with S3 credentials resolved server-side (IRSA / local role) — the browser
    never sees S3, only the resulting image bytes. Config uses the generic
    S3_ASSET_* keys (usable for any demo asset, not just the QR). Pattern
    mirrors routers/files.py get_thumbnail.
    """
    bucket = os.getenv("S3_ASSET_BUCKET", "").strip()
    key = os.getenv("S3_ASSET_KEY", "").strip()
    region = os.getenv("S3_ASSET_REGION", "").strip() or "us-east-1"
    if not bucket or not key:
        raise HTTPException(status_code=503, detail="S3_ASSET_BUCKET / S3_ASSET_KEY not configured")

    try:
        import boto3  # lazy — only needed to serve the QR
    except ImportError:
        raise HTTPException(status_code=503, detail="boto3 not installed")

    try:
        client = boto3.client("s3", region_name=region)
    except Exception as e:  # cred chain / missing dep surfaces here
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
