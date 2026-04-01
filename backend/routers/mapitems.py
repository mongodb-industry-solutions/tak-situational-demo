import time
import uuid
from datetime import datetime, timezone
from typing import Literal
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from db.mdb import MongoDBConnector

router = APIRouter()
_db = MongoDBConnector()

_COMMAND_UID = "COMMAND-VEHICLE"
_COMMAND_PEER_KEY = "COMMAND-VEHICLE"   # must be non-empty — plugin rejects events with empty peer key
_STALE_MS = 365 * 24 * 60 * 60 * 1000  # markers stale after 1 year

def _serialise(doc):
    doc["_id"] = str(doc["_id"])
    return doc

@router.get("/mapitems")
async def get_mapitems():
    """Return all non-deleted persistent map items from Atlas."""
    docs = _db.find("mapitem", {"_r": False})
    return [_serialise(d) for d in docs]

class PlaceMarkerRequest(BaseModel):
    lat: float
    lon: float
    label: str
    marker_type: Literal["a-f-G", "a-n-G", "a-u-G", "a-h-G"] = "a-f-G"

@router.post("/mapitems", status_code=201)
async def place_marker(body: PlaceMarkerRequest):
    """Place a map marker from the command center into the Ditto mesh via Atlas."""
    label = body.label.strip()
    if not label:
        raise HTTPException(status_code=400, detail="Label cannot be empty")
    now = int(time.time() * 1000)
    now_iso = datetime.fromtimestamp(now / 1000, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    type_prefix = body.marker_type[:3]  # "a-f", "a-n", "a-u", "a-h"
    iconset = f"COT_MAPPING_2525C/{type_prefix}/{body.marker_type}"
    detail = (
        f"<detail>"
        f"<archive/>"
        f"<usericon iconsetpath='{iconset}'/>"
        f"<remarks></remarks>"
        f"<color argb='-1'/>"
        f"<contact callsign='{label}'/>"
        f"<creator uid='{_COMMAND_UID}' callsign='COMMAND' time='{now_iso}' type='a-f-G-U-C'/>"
        f"</detail>"
    )
    doc = {
        "_id": str(uuid.uuid4()),
        "_r": False,
        "_v": 2,
        "_c": 0,
        "b": now,
        "n": now,
        "o": now + _STALE_MS,
        "j": body.lat,
        "l": body.lon,
        "i": 0.0,
        "h": 9999999,
        "k": 9999999,
        "c": label,
        "e": label,
        "d": _COMMAND_UID,
        "a": _COMMAND_PEER_KEY,
        "w": body.marker_type,
        "f": True,
        "g": "2.0",
        "p": "h-e",
        "q": "Undefined",
        "r": detail,
    }
    _db.insert_one("mapitem", doc)
    return doc

@router.delete("/mapitems/{marker_id}", status_code=200)
async def delete_marker(marker_id: str):
    """Delete a map marker and propagate to ATAK.

    The Ditto connector applies loop-prevention: it won't push MongoDB changes back to
    Ditto for documents that originated from Ditto (ATAK-created).  To bypass this we
    hard-delete the original document and re-insert a fresh tombstone with our peer key.
    The connector sees the INSERT as a brand-new command-vehicle document and pushes it
    to Ditto, where the CRDT merges it with the existing ATAK version — _r: true (newer
    timestamp) wins and ATAK removes the marker from its map.
    """
    collection = _db.get_collection("mapitem")
    doc = collection.find_one({"_id": marker_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Marker not found")
    tombstone = dict(doc)
    tombstone["_r"] = True
    tombstone["a"] = _COMMAND_PEER_KEY
    tombstone["d"] = _COMMAND_UID
    collection.delete_one({"_id": marker_id})
    collection.insert_one(tombstone)
    return {"deleted": True}
