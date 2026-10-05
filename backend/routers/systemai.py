import json
import os
import time
import uuid

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from db.mdb import db as _db

router = APIRouter()

# ── Provider selection ─────────────────────────────────────────────────────
# Two backends, same agent and same tools:
#
#   ollama    — a model running in-cluster (the local, self-hosted stack).
#               No API key, no external account. Default when OLLAMA_BASE_URL
#               is set.
#   anthropic — MongoDB's internal LLM gateway (the Kanopy deployment), via
#               LLM_BASE_URL + LLM_API_KEY. Default when LLM_API_KEY is set.
#
# Set LLM_PROVIDER explicitly to override the auto-detection. When neither is
# configured the panel reports itself disabled instead of erroring, and the
# frontend hides it — the rest of the dashboard is unaffected.
_OLLAMA_BASE_URL = os.environ.get("OLLAMA_BASE_URL", "").strip().rstrip("/")
_LLM_API_KEY = os.environ.get("LLM_API_KEY", "").strip()
_LLM_BASE_URL = os.environ.get("LLM_BASE_URL", "").strip()
_TIMEOUT = float(os.environ.get("LLM_TIMEOUT_SECONDS", "300"))


def _provider() -> str:
    explicit = os.environ.get("LLM_PROVIDER", "").strip().lower()
    if explicit:
        return explicit
    if _OLLAMA_BASE_URL:
        return "ollama"
    if _LLM_API_KEY:
        return "anthropic"
    return "none"


def _default_model(provider: str) -> str:
    if provider == "ollama":
        return "qwen2.5:7b"
    return "claude-opus-4-7"


_PROVIDER = _provider()
_MODEL = os.environ.get("LLM_MODEL", "").strip() or _default_model(_PROVIDER)

_SYSTEM = (
    "You are LEAFY-AI — the AI tactical operations officer embedded in the MongoDB command vehicle dashboard.\n\n"
    "You have real-time access to live field data syncing through a Ditto peer-to-peer mesh to MongoDB. "
    "Always call the appropriate data tools before answering — your responses must be grounded in live data.\n\n"
    "Be terse and precise. Use military brevity. Answer in 2–4 sentences max unless a full list is needed.\n"
    "Plain text only — no markdown. No asterisks, no bold, no bullet points with *, no headers.\n"
    "When asked for a SITREP: report all active (non-stale) nodes with their positions, then any recent alerts or chat.\n"
    "When asked about proximity or distance: use the lat/lon coordinates from get_nodes to estimate distances."
)

# Canonical tool definitions, in Anthropic's shape. _openai_tools() converts
# them for Ollama, so there is only ever one source of truth.
_TOOLS: list[dict] = [
    {
        "name": "get_nodes",
        "description": (
            "Fetch all field unit positions (PLI tracks) from MongoDB. "
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
                "limit": {
                    "type": "integer",
                    "description": "Max messages to return (default 20)",
                }
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


def _openai_tools() -> list[dict]:
    """Translate _TOOLS into the OpenAI/Ollama function-calling schema."""
    return [
        {
            "type": "function",
            "function": {
                "name": t["name"],
                "description": t["description"],
                "parameters": t["input_schema"],
            },
        }
        for t in _TOOLS
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
        # A model can hand back a string here; coerce rather than crash the turn.
        try:
            limit = int(limit)
        except (TypeError, ValueError):
            limit = 20
        docs = list(
            _db.get_collection("chat").find(
                {"_r": False}, sort=[("b", -1)], limit=limit
            )
        )
        docs.reverse()
        return json.dumps(
            [
                {
                    "callsign": d.get("e", "UNKNOWN"),
                    "message": d.get("msg", ""),
                    "ts_ms": d.get("b"),
                }
                for d in docs
            ]
        )

    if name == "get_map_markers":
        docs = list(_db.get_collection("mapitem").find({"_r": False}))
        return json.dumps(
            [
                {
                    "title": d.get("e") or d.get("c") or "UNKNOWN",
                    "lat": d.get("j"),
                    "lon": d.get("l"),
                    "cot_type": d.get("w"),
                }
                for d in docs
            ]
        )

    if name == "get_alerts":
        docs = list(
            _db.get_collection("alert").find(
                {"_r": False, "w": {"$ne": "b-a-o-can"}}, sort=[("b", -1)], limit=10
            )
        )
        return json.dumps(
            [
                {
                    "callsign": d.get("e", "UNKNOWN"),
                    "type": d.get("w"),
                    "ts_ms": d.get("b"),
                }
                for d in docs
            ]
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


# ── Anthropic agent (cloud / internal gateway) ─────────────────────────────
_anthropic_client = None


def _get_anthropic_client():
    """Build the Anthropic client lazily.

    Deliberately not done at import time: the local stack has no LLM_API_KEY,
    and constructing a client with empty credentials at import would break the
    whole backend rather than just this one panel.
    """
    global _anthropic_client
    if _anthropic_client is None:
        import anthropic  # lazy — not installed/needed on the Ollama path

        kwargs: dict = {"api_key": _LLM_API_KEY}
        if _LLM_BASE_URL:
            kwargs["base_url"] = _LLM_BASE_URL
            # MongoDB's gateway authenticates with an `api-key` header rather
            # than Anthropic's native scheme.
            kwargs["default_headers"] = {"api-key": _LLM_API_KEY}
        _anthropic_client = anthropic.Anthropic(**kwargs)
    return _anthropic_client


def _run_agent_anthropic(history: list[dict], user_msg: str) -> str:
    client = _get_anthropic_client()
    messages: list[dict] = history + [{"role": "user", "content": user_msg}]

    for _ in range(10):  # cap tool-call rounds
        response = client.messages.create(
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


# ── Ollama agent (local / self-hosted) ─────────────────────────────────────
def _run_agent_ollama(history: list[dict], user_msg: str) -> str:
    """Drive Ollama's native /api/chat endpoint, which supports tool calling.

    Uses httpx directly rather than pulling in the OpenAI SDK — httpx is already
    a dependency for the attachment proxy, and this keeps the image small.
    """
    import httpx  # lazy — matches the pattern used elsewhere in the backend

    messages: list[dict] = [{"role": "system", "content": _SYSTEM}]
    messages += history
    messages.append({"role": "user", "content": user_msg})

    url = f"{_OLLAMA_BASE_URL}/api/chat"

    with httpx.Client(timeout=_TIMEOUT) as client:
        for _ in range(10):  # cap tool-call rounds
            resp = client.post(
                url,
                json={
                    "model": _MODEL,
                    "messages": messages,
                    "tools": _openai_tools(),
                    "stream": False,
                    # Low temperature: this agent reports facts, it doesn't write prose.
                    "options": {"temperature": 0.1},
                },
            )
            if resp.status_code == 404:
                # Ollama 404s when the model isn't pulled yet — the common case
                # right after setup, while pull-models.sh is still running.
                raise RuntimeError(
                    f"model '{_MODEL}' is not available in Ollama yet "
                    "(still downloading? tail /tmp/tak-ollama-pull.log)"
                )
            resp.raise_for_status()
            message = resp.json().get("message", {}) or {}

            tool_calls = message.get("tool_calls") or []
            if not tool_calls:
                return (message.get("content") or "").strip() or "(No response)"

            # Echo the assistant's tool-call turn back before the results, so
            # the model can correlate them.
            messages.append(message)

            for call in tool_calls:
                fn = call.get("function", {}) or {}
                name = fn.get("name", "")
                raw_args = fn.get("arguments", {})
                # Ollama usually returns a dict; some models emit a JSON string.
                if isinstance(raw_args, str):
                    try:
                        args = json.loads(raw_args) if raw_args.strip() else {}
                    except json.JSONDecodeError:
                        args = {}
                else:
                    args = raw_args or {}

                messages.append(
                    {
                        "role": "tool",
                        "name": name,
                        "content": _execute_tool(name, args),
                    }
                )

    return "(Agent did not complete)"


def _run_agent(history: list[dict], user_msg: str) -> str:
    if _PROVIDER == "ollama":
        return _run_agent_ollama(history, user_msg)
    return _run_agent_anthropic(history, user_msg)


class AskRequest(BaseModel):
    msg: str
    session_id: str | None = None


def _model_present(models: list[str], wanted: str) -> bool:
    """Return True when the exact configured model is available in Ollama.

    Matching on the base name alone is wrong: `qwen2.5:3b` being present does
    not make `qwen2.5:7b` usable, and inference would still 404. Ollama stores
    an untagged pull as `<name>:latest`, so an untagged name is normalised to
    that before comparing.
    """
    wanted = wanted.strip()
    if ":" not in wanted:
        wanted = f"{wanted}:latest"
    return wanted in models


@router.get("/systemai/status")
async def systemai_status():
    """Report whether the AI panel has a usable backend.

    The frontend calls this on mount and hides the panel when `enabled` is
    false, so a clone with no LLM configured shows a clean dashboard rather than
    a panel that errors on every question.
    """
    if _PROVIDER in ("none", ""):
        return {
            "enabled": False,
            "provider": None,
            "model": None,
            "detail": "No LLM backend configured (set OLLAMA_BASE_URL or LLM_API_KEY)",
        }

    status: dict = {"enabled": True, "provider": _PROVIDER, "model": _MODEL}

    # For Ollama, "configured" isn't the same as "ready" — the model is pulled
    # in the background during setup. Report that distinction so the UI can say
    # something useful instead of just failing.
    if _PROVIDER == "ollama":
        try:
            import httpx

            with httpx.Client(timeout=5.0) as client:
                resp = client.get(f"{_OLLAMA_BASE_URL}/api/tags")
                resp.raise_for_status()
                models = [m.get("name", "") for m in resp.json().get("models", [])]
            ready = _model_present(models, _MODEL)
            status["ready"] = ready
            if not ready:
                status["detail"] = f"model '{_MODEL}' is still downloading"
        except Exception as exc:  # noqa: BLE001 — status must never raise
            status["ready"] = False
            status["detail"] = f"Ollama unreachable: {exc}"
    else:
        status["ready"] = True

    return status


@router.post("/systemai")
async def ask_atlas(body: AskRequest):
    if _PROVIDER in ("none", ""):
        raise HTTPException(
            status_code=503,
            detail="No LLM backend configured (set OLLAMA_BASE_URL or LLM_API_KEY)",
        )

    msg = body.msg.strip()
    if not msg:
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    session_id = body.session_id or str(uuid.uuid4())
    history = _load_history(session_id)

    try:
        reply = _run_agent(history, msg)
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"AI agent error: {exc}") from exc

    _save_exchange(session_id, msg, reply)
    return {"reply": reply, "session_id": session_id}
