# CLAUDE.md — TAK Situational Demo

## Project Overview

Command vehicle web dashboard for a MongoDB + Ditto tactical edge demo.
Reads live data from MongoDB Atlas (populated by the Ditto MongoDB Connector
from real Android ATAK devices) and presents a situational awareness picture.

## What This Repo Is NOT

- **NOT** a Ditto SDK integration — Ditto Big Peer and MongoDB Connector are running externally
- **NOT** a data simulator — data comes from a real Android device running ATAK CIV
- **NOT** an Android app — this is a web-only command vehicle dashboard

## Architecture

```
Android ATAK CIV (Ditto Edge Sync plugin)
  → Ditto Cloud Big Peer
  → Ditto MongoDB Connector
  → MongoDB Atlas  ← read by this app
  → FastAPI backend (backend/)
  → Next.js dashboard (frontend/)
```

The backend is **READ-ONLY** from MongoDB Atlas. It does not write to Atlas.

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.13, FastAPI, uvicorn, pymongo, python-dotenv |
| Frontend | Next.js 15 (App Router), React 19, JavaScript (no TypeScript) |
| UI | LeafyGreen UI (`@leafygreen-ui/*`), Tailwind CSS 4 |
| Map | Leaflet.js via react-leaflet v5 (dynamic import, SSR disabled) |
| Package mgmt | uv (backend), npm (frontend) |
| Deploy | Docker, Kanopy (Kubernetes, Drone CI/CD) |

## Ditto ATAK v2 Schema

All Atlas collections use short single-char field names. Full spec in `docs/document_schema.md`.

Key fields the dashboard cares about:

| Field | Meaning |
|---|---|
| `j` | Latitude |
| `l` | Longitude |
| `c` / `e` | Callsign |
| `o` | Stale time (millis since epoch) — if `Date.now() > o` → STALE |
| `_r` | Soft-delete flag — always filter `{ _r: false }` |
| `w` | CoT type string (e.g. `a-f-G-U-C` = friendly ground unit) |
| `b` | Last update time (millis since epoch) |

## Collections in Atlas

| Collection | Content | MVP status |
|---|---|---|
| `track` | PLI — transient device positions | ✅ Used |
| `mapitem` | Persistent map graphics | ✅ Used |
| `chat` | Chat messages from ATAK | ✅ Used |
| `file` | Attached files | ⬜ Not used in MVP |
| `alert` | Alerts | ⬜ Not used in MVP |

## Staleness Logic

```js
// A node is STALE when:
Date.now() > doc.o   // doc.o is millis since epoch set by the Ditto ATAK plugin
```

- Show stale nodes **greyed out** on the map with a `⚠ STALE` tooltip.
- Show stale nodes with a red border in the NodeStatus panel.
- **Do NOT remove stale nodes** — they represent the last known position.

## Backend Conventions

- All routes in `backend/routers/`; registered with `app.include_router()` in `main.py`
- Use the existing `MongoDBConnector` from `backend/db/mdb.py` — do not replace or duplicate it
- Always filter `{ "_r": False }` on `track` and `mapitem` queries
- Serialise `ObjectId` to string via `str(doc["_id"])` before returning JSON
- Env vars: `MONGODB_URI`, `DATABASE_NAME`, `APP_NAME` (in `backend/.env`)

## Frontend Conventions

- `@/` alias maps to `frontend/` root (configured in `jsconfig.json`)
- **Component pattern**: `frontend/components/<Name>/<Name>.js` (JSX) + `use<Name>.js` (hook)
- **API calls** go through `frontend/app/api/<resource>/route.js` proxy routes — never call the backend directly from client components
- **Polling**: use `usePolling` from `frontend/lib/hooks/usePolling.js` (2s interval default)
- **react-leaflet** requires `dynamic(() => import(...), { ssr: false })` — see `Map.js`
- MongoDB brand palette: import from `@leafygreen-ui/palette`
- No TypeScript — JavaScript only

## Deployment

- Kanopy deployment name: `defence-tak-ditto-sync`
- Atlas IP allowlist: add Kanopy egress IP range before deploying
- `BACKEND_URL` env var in `environment/staging.yaml` must point to the backend service

## Open Items (Post-MVP)

- Queryable Encryption: demonstrated via MongoDB Compass/Atlas UI in live demo; no code needed here
- Telemetry (heart rate, temp, wind): not in standard Ditto ATAK schema; add a `telemetry` collection + panel if sensor data is added later
- STT/TTS: Android-native features; narrated in the InfoWizard talk track only
