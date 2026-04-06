from fastapi import APIRouter
from db.mdb import db as _db

router = APIRouter()


def _serialise(doc):
    doc["_id"] = str(doc["_id"])
    return doc


@router.get("/alerts")
async def get_alerts(limit: int = 50):
    """Return the most recent non-deleted alerts from Atlas, newest first."""
    collection = _db.get_collection("alert")
    docs = list(collection.find({"_r": False, "w": {"$ne": "b-a-o-can"}}, sort=[("b", -1)], limit=limit))
    return [_serialise(d) for d in docs]
