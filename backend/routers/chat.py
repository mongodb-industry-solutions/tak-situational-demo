from fastapi import APIRouter
from db.mdb import MongoDBConnector

router = APIRouter()
_db = MongoDBConnector()

def _serialise(doc):
    doc["_id"] = str(doc["_id"])
    return doc

@router.get("/chat")
async def get_chat(limit: int = 50):
    """Return the most recent chat messages, ordered by time ascending."""
    collection = _db.get_collection("chat")
    docs = list(collection.find({}, sort=[("b", -1)], limit=limit))
    docs.reverse()
    return [_serialise(d) for d in docs]
