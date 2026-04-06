import base64
import os

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from db.mdb import MongoDBConnector

router = APIRouter()
_db = MongoDBConnector()

_COMMAND_UID = "COMMAND-VEHICLE"
_COMMAND_PEER_KEY = "COMMAND-VEHICLE"


def _serialise(doc):
    doc["_id"] = str(doc["_id"])
    return doc


@router.get("/files")
async def get_files():
    """Return image file metadata. Coordinates are included only when the
    associated mapitem is still active (not tombstoned)."""
    collection = _db.get_collection("file")
    pipeline = [
        {"$match": {"_r": False, "mime": {"$regex": "^image/"}}},
        {"$lookup": {
            "from": "mapitem",
            "let": {"item_id": "$itemId"},
            "pipeline": [
                {"$match": {"$expr": {"$and": [
                    {"$eq": ["$_id", "$$item_id"]},
                    {"$eq": ["$_r", False]},
                ]}}}
            ],
            "as": "location",
        }},
        {"$project": {
            "_id": 1,
            "c": 1,
            "e": 1,
            "b": 1,
            "mime": 1,
            "sz": 1,
            "itemId": 1,
            "j": {"$arrayElemAt": ["$location.j", 0]},
            "l": {"$arrayElemAt": ["$location.l", 0]},
        }},
        {"$sort": {"b": -1}},
    ]
    docs = list(collection.aggregate(pipeline))
    return [_serialise(d) for d in docs]


@router.get("/files/{file_id}/thumb")
async def get_thumbnail(file_id: str):
    """Proxy the Ditto attachment thumbnail through to the frontend."""
    ditto_ep = os.getenv("DITTO_URL_EP", "").rstrip("/")
    ditto_token = os.getenv("DITTO_API_KEY", "")
    if not ditto_ep:
        raise HTTPException(status_code=503, detail="DITTO_URL_EP not configured")

    ditto_url = f"https://{ditto_ep}"

    collection = _db.get_collection("file")
    doc = collection.find_one({"_id": file_id, "_r": False}, {"thumb": 1, "mime": 1})
    if not doc or not doc.get("thumb"):
        raise HTTPException(status_code=404, detail="Thumbnail not found")

    thumb_id = doc["thumb"].get("_id")
    if not isinstance(thumb_id, bytes):
        raise HTTPException(status_code=404, detail="No thumbnail binary")

    # Ditto attachment IDs are URL-safe base64 without padding
    attachment_id = base64.urlsafe_b64encode(thumb_id).decode().rstrip("=")

    import httpx  # lazy — only needed for thumbnail proxy
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(
            f"{ditto_url}/api/v4/attachments/{attachment_id}",
            headers={"Authorization": f"Bearer {ditto_token}"},
        )

    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail=f"Ditto returned {resp.status_code}")

    return Response(content=resp.content, media_type=doc.get("mime", "image/jpeg"))


@router.delete("/files/{file_id}", status_code=200)
async def delete_file(file_id: str):
    """Tombstone the file and its associated mapitem so deletion propagates to ATAK."""
    file_col = _db.get_collection("file")
    doc = file_col.find_one({"_id": file_id, "_r": False})
    if not doc:
        raise HTTPException(status_code=404, detail="File not found")

    tombstone = dict(doc)
    tombstone["_r"] = True
    tombstone["a"] = _COMMAND_PEER_KEY
    tombstone["d"] = _COMMAND_UID
    file_col.delete_one({"_id": file_id})
    file_col.insert_one(tombstone)

    if doc.get("itemId"):
        mapitem_col = _db.get_collection("mapitem")
        mapitem = mapitem_col.find_one({"_id": doc["itemId"], "_r": False})
        if mapitem:
            tombstone_item = dict(mapitem)
            tombstone_item["_r"] = True
            tombstone_item["a"] = _COMMAND_PEER_KEY
            tombstone_item["d"] = _COMMAND_UID
            mapitem_col.delete_one({"_id": doc["itemId"]})
            mapitem_col.insert_one(tombstone_item)

    return {"deleted": True}
