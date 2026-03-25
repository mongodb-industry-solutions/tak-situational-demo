from fastapi import APIRouter
from db.mdb import MongoDBConnector

router = APIRouter()
_db = MongoDBConnector()

def _serialise(doc):
    doc["_id"] = str(doc["_id"])
    return doc

@router.get("/tracks")
async def get_tracks():
    """Return all non-deleted track (PLI) documents from Atlas."""
    docs = _db.find("track", {"_r": False})
    return [_serialise(d) for d in docs]
