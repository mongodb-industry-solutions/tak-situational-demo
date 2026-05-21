from fastapi import APIRouter
from db.mdb import db as _db

router = APIRouter()

_UNKNOWN = 9999999  # Ditto/CoT sentinel for "value not available"


def _serialise(doc):
    doc["_id"] = str(doc["_id"])
    return doc


def _clean(v):
    """Return None for CoT sentinel values so the frontend can skip them."""
    try:
        f = float(v)
        return None if abs(f) >= _UNKNOWN else f
    except (TypeError, ValueError):
        return None


@router.get("/telemetry")
async def get_telemetry():
    """Return sensor telemetry extracted from live track (PLI) documents.

    Speed (r1, m/s), course (r2, degrees), altitude HAE (i, m) and
    circular error (h, m) are already present in every Ditto PLI update —
    no extra infrastructure needed.  The api collection will be used for
    richer telemetry in a future iteration once a custom ATAK plugin is built.
    """
    collection = _db.get_collection("track")
    docs = list(collection.find(
        {"_r": False},
        projection={"_id": 1, "c": 1, "e": 1, "d": 1,
                    "r1": 1, "r2": 1, "i": 1, "h": 1, "b": 1, "o": 1},
        sort=[("b", -1)],
        limit=50,
    ))

    result = []
    for doc in docs:
        doc["speed_ms"] = _clean(doc.pop("r1", None))
        doc["course_deg"] = _clean(doc.pop("r2", None))
        doc["alt_m"] = _clean(doc.pop("i", None))
        doc["ce_m"] = _clean(doc.pop("h", None))
        result.append(_serialise(doc))

    return result
