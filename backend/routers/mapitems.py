from fastapi import APIRouter
from db.mdb import MongoDBConnector

router = APIRouter()

def _serialise(doc):
    doc["_id"] = str(doc["_id"])
    return doc

@router.get("/mapitems")
async def get_mapitems():
    """Return all non-deleted persistent map items from Atlas."""
    db = MongoDBConnector()
    docs = db.find("mapitem", {"_r": False})
    return [_serialise(d) for d in docs]
