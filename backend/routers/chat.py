from fastapi import APIRouter
from db.mdb import MongoDBConnector

router = APIRouter()

def _serialise(doc):
    doc["_id"] = str(doc["_id"])
    return doc

@router.get("/chat")
async def get_chat():
    """Return chat messages ordered by time ascending."""
    db = MongoDBConnector()
    collection = db.get_collection("chat")
    docs = list(collection.find({}, sort=[("time", 1)]))
    return [_serialise(d) for d in docs]
