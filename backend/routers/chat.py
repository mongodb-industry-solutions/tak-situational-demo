import time
import uuid
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from db.mdb import db as _db

router = APIRouter()

_COMMAND_CALLSIGN = "COMMAND"
_COMMAND_UID = "COMMAND-VEHICLE"

def _serialise(doc):
    doc["_id"] = str(doc["_id"])
    return doc

@router.get("/chat")
async def get_chat(limit: int = 50):
    """Return the most recent chat messages, ordered by time ascending."""
    collection = _db.get_collection("chat")
    docs = list(collection.find({"_r": False}, sort=[("b", -1)], limit=limit))
    docs.reverse()
    return [_serialise(d) for d in docs]

class SendMessageRequest(BaseModel):
    msg: str

@router.post("/chat", status_code=201)
async def send_chat(body: SendMessageRequest):
    """Send a message from the command center into the Ditto mesh via Atlas."""
    msg = body.msg.strip()
    if not msg:
        raise HTTPException(status_code=400, detail="Message cannot be empty")
    now = int(time.time() * 1000)
    doc = {
        "_id": str(uuid.uuid4()),
        "_r": False,
        "_v": 2,
        "_c": 0,
        "b": now,
        "e": _COMMAND_CALLSIGN,
        "d": _COMMAND_UID,
        "msg": msg,
        "room": "Ditto",
        "roomId": "ChatContact-Ditto",
        "parent": "RootContactGroup",
        "authorType": "a-f-G-U-C",
    }
    _db.insert_one("chat", doc)
    return doc
