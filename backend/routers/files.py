from fastapi import APIRouter
from db.mdb import MongoDBConnector

router = APIRouter()
_db = MongoDBConnector()


def _serialise(doc):
    doc["_id"] = str(doc["_id"])
    return doc


@router.get("/files")
async def get_files():
    """Return image file metadata. Coordinates are included only when the
    associated mapitem is still active (not tombstoned), so the frontend can
    use null j/l to decide whether to render a map marker."""
    collection = _db.get_collection("file")
    pipeline = [
        {"$match": {"_r": False, "mime": {"$regex": "^image/"}}},
        # Join only non-deleted mapitems — tombstoned ones yield empty array → null coords
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
            "c": 1,        # filename
            "e": 1,        # author callsign
            "b": 1,        # timestamp
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
