# Backend — FastAPI

Reads the Ditto-synced ATAK collections out of MongoDB and serves them to the
dashboard, plus writes command actions (chat, map markers, tombstones) that
propagate back to devices through the Ditto MongoDB Connector.

> Most of the time you do **not** run this directly. `make setup` from the repo
> root builds it into the local kind cluster alongside MongoDB Enterprise
> Advanced and a self-hosted Ditto Big Peer. See
> [`../docs/RUN_LOCAL.md`](../docs/RUN_LOCAL.md).

## Running on its own

Requires Python ≥3.13,<3.14 and [`uv`](https://docs.astral.sh/uv/), plus a
reachable MongoDB. Run these from the **repository root**:

```bash
cp backend/.env.example backend/.env   # then fill in MONGODB_URI + DATABASE_NAME
make uv_sync                           # wraps `cd backend && uv sync`
cd backend && uv run uvicorn main:app --host 0.0.0.0 --port 8000
```

- API: <http://localhost:8000>
- Swagger: <http://localhost:8000/docs>

If port 8000 is taken, pass a different `--port` (and set `BACKEND_URL` to match
when running the frontend).

## Configuration

See [`.env.example`](.env.example) — it is organised into **required**, **Ditto
(self-hosted vs cloud)**, **AI panel (Ollama vs gateway)** and **feature flags**.
Only `MONGODB_URI` and `DATABASE_NAME` are mandatory; every optional block
degrades to a disabled feature rather than a startup failure.

## Layout

```
main.py              app wiring, /api/health, /api/features
db/mdb.py            MongoDBConnector + the shared `db` singleton
routers/
  tracks.py          GET  /api/tracks       PLI positions
  mapitems.py        GET  POST  DELETE      map graphics (tombstoning delete)
  chat.py            GET  POST              comms feed
  files.py           GET  DELETE            file metadata + attachment thumbnail proxy
  alerts.py          GET  /api/alerts       emergency alerts
  telemetry.py       GET  /api/telemetry    speed/course/altitude derived from `track`
  systemai.py        POST /api/systemai     LEAFY-AI agent (Ollama | Anthropic gateway)
  ditto.py           GET  /api/ditto/qr     ATAK mesh-join QR + /identity
  genymotion.py      paused — Simulate view device lifecycle
```

## Conventions

- Register routers in `main.py` with `prefix="/api"`.
- Import the singleton — `from db.mdb import db as _db` — never construct
  `MongoDBConnector()` again.
- **Always filter `{"_r": False}`.** `_r` is the Ditto ATAK soft-delete flag.
- Serialise `_id` with `str(...)` before returning JSON.
- **Import optional dependencies lazily**, inside the function that needs them
  (`boto3`, `anthropic`, `qrcode`, `httpx`). The same image runs where a given
  provider isn't configured; an unconfigured dependency must disable one feature,
  never break startup.
- **Delete by tombstoning**, not `deleteOne()` — see `routers/mapitems.py`. It
  hard-deletes then re-inserts with `_r: true` and a bumped `_c`, which is what
  makes the connector propagate the change instead of treating it as a sync loop.

## Lint

```bash
make lint     # from the repo root — same as CI
```
