from fastapi import APIRouter
from db.mdb import MongoDBConnector

router = APIRouter()
_db = MongoDBConnector()


def _serialise(doc):
    doc["_id"] = str(doc["_id"])
    return doc


@router.get("/files")
async def get_files():
    """Return image file metadata joined with mapitem coordinates."""
    collection = _db.get_collection("file")
    pipeline = [
        {"$match": {"_r": False, "mime": {"$regex": "^image/"}}},
        {"$lookup": {
            "from": "mapitem",
            "localField": "itemId",
            "foreignField": "_id",
            "as": "location",
        }},
        {"$project": {
            "_id": 1,
            "c": 1,        # filename
            "e": 1,        # author callsign
            "b": 1,        # timestamp
            "mime": 1,
            "sz": 1,       # file size bytes
            "itemId": 1,
            "j": {"$arrayElemAt": ["$location.j", 0]},
            "l": {"$arrayElemAt": ["$location.l", 0]},
        }},
        {"$sort": {"b": -1}},
    ]
    docs = list(collection.aggregate(pipeline))
    return [_serialise(d) for d in docs]
