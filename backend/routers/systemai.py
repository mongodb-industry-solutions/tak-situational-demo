import json
import os
import time
import uuid
from typing import Optional

import anthropic
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from db.mdb import db as _db

router = APIRouter()

# ── LLM client (MongoDB gateway pattern: LLM_BASE_URL + LLM_API_KEY)
def _make_client() -> anthropic.Anthropic:
    api_key = os.environ.get("LLM_API_KEY", "")
    base_url = os.environ.get("LLM_BASE_URL")
    kwargs: dict = {"api_key": api_key}
    if base_url:
        kwargs["base_url"] = base_url
        kwargs["default_headers"] = {"api-key": api_key}
    return anthropic.Anthropic(**kwargs)

_client = _make_client()
_MODEL = os.environ.get("LLM_MODEL", "claude-opus-4-7")

_SYSTEM = (
    "You are LEAFY-AI — the AI tactical operations officer embedded in the MongoDB command vehicle dashboard.\n\n"
    "You have real-time access to live field data syncing through a Ditto peer-to-peer mesh to MongoDB Atlas. "
    "Always call the appropriate data tools before answering — your responses must be grounded in live data.\n\n"
    "Be terse and precise. Use military brevity. Answer in 2–4 sentences max unless a full list is needed.\n"
    "Plain text only — no markdown. No asterisks, no bold, no bullet points with *, no headers.\n"
    "When asked for a SITREP: report all active (non-stale) nodes with their positions, then any recent alerts or chat.\n"
    "When asked about proximity or distance: use the lat/lon coordinates from get_nodes to estimate distances."
)

_TOOLS: list[dict] = [
    {
        "name": "get_nodes",
        "description": (
            "Fetch all field unit positions (PLI tracks) from MongoDB Atlas. "
            "Returns each unit's callsign, GPS coordinates, CoT type, staleness, and last update time. "
            "Call this for questions about unit positions, distances, SITREP, or active units."
        ),
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "get_recent_chat",
        "description": (
            "Fetch the most recent ATAK chat messages from field operators. "
            "Returns sender callsign, message text, and timestamp. "
            "Call this for questions about recent communications, orders, or field reports."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "limit": {"type": "integer", "description": "Max messages to return (default 20)"}
            },
            "required": [],
        },
    },
    {
        "name": "get_map_markers",
        "description": (
            "Fetch all active map markers and annotations placed by field operators. "
            "Returns title, GPS coordinates, and CoT type. "
            "Call this for questions about objectives, POIs, or marked locations on the map."
        ),
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "get_alerts",
        "description": (
            "Fetch recent alert events raised by field units. "
            "Returns callsign, alert type, and timestamp. "
            "Call this for questions about incidents, 911 alerts, or emergency events."
        ),
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
]


def _execute_tool(name: str, inputs: dict) -> str:
    now_ms = int(time.time() * 1000)

    if name == "get_nodes":
        docs = list(_db.get_collection("track").find({"_r": False}))
        nodes = [
            {
                "callsign": d.get("e") or d.get("c") or "UNKNOWN",
                "lat": d.get("j"),
                "lon": d.get("l"),
                "cot_type": d.get("w"),
                "stale": now_ms > d.get("o", 0),
                "last_updated_ms": d.get("b"),
            }
            for d in docs
        ]
        return json.dumps(nodes)

    if name == "get_recent_chat":
        limit = inputs.get("limit", 20)
        docs = list(
            _db.get_collection("chat").find({"_r": False}, sort=[("b", -1)], limit=limit)
        )
        docs.reverse()
        return json.dumps(
            [{"callsign": d.get("e", "UNKNOWN"), "message": d.get("msg", ""), "ts_ms": d.get("b")} for d in docs]
        )

    if name == "get_map_markers":
        docs = list(_db.get_collection("mapitem").find({"_r": False}))
        return json.dumps(
            [{"title": d.get("e") or d.get("c") or "UNKNOWN", "lat": d.get("j"), "lon": d.get("l"), "cot_type": d.get("w")} for d in docs]
        )

    if name == "get_alerts":
        docs = list(
            _db.get_collection("alert").find(
                {"_r": False, "w": {"$ne": "b-a-o-can"}}, sort=[("b", -1)], limit=10
            )
        )
        return json.dumps(
            [{"callsign": d.get("e", "UNKNOWN"), "type": d.get("w"), "ts_ms": d.get("b")} for d in docs]
        )

    return json.dumps({"error": f"Unknown tool: {name}"})


def _load_history(session_id: str) -> list[dict]:
    doc = _db.get_collection("ai_sessions").find_one({"_id": session_id})
    if doc:
        msgs = doc.get("messages", [])
        # Keep last 40 entries (20 exchanges) to stay within context limits
        return msgs[-40:] if len(msgs) > 40 else msgs
    return []


def _save_exchange(session_id: str, user_msg: str, ai_reply: str) -> None:
    now_ms = int(time.time() * 1000)
    _db.get_collection("ai_sessions").update_one(
        {"_id": session_id},
        {
            "$push": {
                "messages": {
                    "$each": [
                        {"role": "user", "content": user_msg},
                        {"role": "assistant", "content": ai_reply},
                    ]
                }
            },
            "$set": {"updated_at_ms": now_ms},
            "$setOnInsert": {"created_at_ms": now_ms},
        },
        upsert=True,
    )


def _run_agent(history: list[dict], user_msg: str) -> str:
    messages: list[dict] = history + [{"role": "user", "content": user_msg}]

    for _ in range(10):  # cap tool-call rounds
        response = _client.messages.create(
            model=_MODEL,
            system=_SYSTEM,
            messages=messages,
            tools=_TOOLS,
            max_tokens=1024,
        )

        if response.stop_reason == "end_turn":
            for block in response.content:
                if block.type == "text":
                    return block.text
            return "(No response)"

        if response.stop_reason == "tool_use":
            messages.append({"role": "assistant", "content": response.content})
            tool_results = [
                {
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": _execute_tool(block.name, block.input),
                }
                for block in response.content
                if block.type == "tool_use"
            ]
            messages.append({"role": "user", "content": tool_results})
        else:
            break

    return "(Agent did not complete)"


class AskRequest(BaseModel):
    msg: str
    session_id: Optional[str] = None


@router.post("/systemai")
async def ask_atlas(body: AskRequest):
    msg = body.msg.strip()
    if not msg:
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    session_id = body.session_id or str(uuid.uuid4())
    history = _load_history(session_id)

    try:
        reply = _run_agent(history, msg)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"AI agent error: {exc}") from exc

    _save_exchange(session_id, msg, reply)
    return {"reply": reply, "session_id": session_id}
