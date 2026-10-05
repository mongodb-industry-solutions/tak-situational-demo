# CLAUDE.md — TAK Situational Demo

## Project Overview

Command vehicle web dashboard for a MongoDB + Ditto tactical edge demo.
Android devices running ATAK CIV with the Ditto ATAK Plugin form an offline P2P
mesh; their data syncs through a Ditto Big Peer and the Ditto MongoDB Connector
into MongoDB, which this dashboard reads to present a situational awareness
picture — and writes to for command actions.

**There are two deployment targets, one codebase:**

|           | Local (**the supported path**)                                          | Cloud (MongoDB internal only) |
| --------- | ----------------------------------------------------------------------- | ----------------------------- |
| Database  | MongoDB **Enterprise Advanced**, MCK operator + self-hosted Ops Manager | MongoDB Atlas                 |
| Edge sync | **Self-hosted Ditto Big Peer** via the Ditto Operator                   | Ditto Cloud Big Peer          |
| Connector | `BigPeerDataBridge` CR (declarative)                                    | Ditto Portal UI               |
| AI panel  | Ollama in-cluster                                                       | MongoDB internal LLM gateway  |
| Platform  | `kind` + `mongodb/web-app` chart                                        | Kanopy + same chart           |

Both run in a `kind` cluster locally with **no external accounts**. Start with
`docs/RUN_LOCAL.md`.

## What This Repo Is NOT

- **NOT** a Ditto SDK integration — there is no Ditto client code here. The
  backend talks to MongoDB, plus the Big Peer HTTP API for photo attachments.
- **NOT** an Android app — the ATAK plugin is a third-party APK from Ditto.
- **NOT** Atlas-only. Atlas is the internal deployment; local is self-managed EA.

## Architecture

```
Android ATAK CIV (Ditto Edge Sync plugin)  — P2P mesh, works fully offline
  → Ditto Big Peer          (self-hosted via Ditto Operator | Ditto Cloud)
  → Ditto MongoDB Connector (BigPeerDataBridge CR | Portal config)
  → MongoDB                 (EA 8.0 via MCK + Ops Manager | Atlas)  ← read by this app
  → FastAPI backend (backend/)
  → Next.js dashboard (frontend/)
```

The backend **reads and writes**. Writes: chat messages, map markers,
file/mapitem tombstones, and `ai_sessions`. They propagate back to devices
through the connector. (Older docs called the backend "read-only" — that is
wrong.)

## Tech Stack

| Layer        | Technology                                                      |
| ------------ | --------------------------------------------------------------- |
| Backend      | Python 3.13, FastAPI, uvicorn, pymongo, httpx, python-dotenv    |
| Frontend     | Next.js 15 (App Router), React 18.2, JavaScript (no TypeScript) |
| UI           | LeafyGreen UI (`@leafygreen-ui/*`), Tailwind CSS 4              |
| Map          | Leaflet via react-leaflet v4.2.1 (dynamic import, SSR disabled) |
| Package mgmt | uv (backend), npm (frontend)                                    |
| Local infra  | kind, Helm, MCK operator, Ditto Operator, cert-manager, Strimzi |
| Deploy       | Docker, Kanopy (Kubernetes, Drone CI/CD) — internal             |

## Ditto ATAK v2 Schema

All collections use short single-char field names. Full spec in
`not-to-be-uploaded/document_schema.md` (private, not committed).

| Field       | Meaning                                                    |
| ----------- | ---------------------------------------------------------- |
| `j` / `l`   | Latitude / Longitude                                       |
| `c` / `e`   | Callsign                                                   |
| `d`         | Device UID                                                 |
| `w`         | CoT type (e.g. `a-f-G-U-C` = friendly ground unit)         |
| `b`         | Last update (millis since epoch)                           |
| `o`         | Stale time (millis since epoch) — `Date.now() > o` ⇒ STALE |
| `_r`        | Soft-delete flag — **always** filter `{ _r: false }`       |
| `r1` / `r2` | Track speed / course                                       |
| `i` / `h`   | Altitude / circular error                                  |

**Every `_id` is a String** (CoT UID, file hash, message id) — which is why the
connector uses 1:1 ID mapping (`fields: [_id]`).

## Collections

| Collection    | Content                                                                                                             | Status                               |
| ------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `track`       | PLI — transient device positions                                                                                    | ✅ used                              |
| `mapitem`     | Persistent map graphics                                                                                             | ✅ used (read + write)               |
| `chat`        | Chat messages — **real fields are `msg`, `e`, `b`**, not `message`/`authorCallsign`/`time` as the schema doc claims | ✅ used (read + write)               |
| `file`        | Attached files/photos; `thumb._id` is BSON Binary                                                                   | ✅ used (metadata + thumbnail proxy) |
| `alert`       | Alerts; cancelled ones have `w == "b-a-o-can"`                                                                      | ✅ used                              |
| `ai_sessions` | AI chat history — backend-only, **never synced to Ditto**                                                           | ✅ used                              |

All five synced collections **must** have `changeStreamPreAndPostImages`
enabled or the Ditto connector refuses to start. Handled by
`infra/k8s/mongodb/40-postinit-job.yaml` — if you add a collection to the data
bridge, add it there too.

## Staleness Logic

```js
Date.now() > doc.o; // doc.o is set by the Ditto ATAK plugin
```

- Stale nodes render **greyed out** with a `⚠ STALE` tooltip on the map, and a
  red border in NodeStatus.
- **Never remove stale nodes** — the last known position is the point.

## Backend Conventions

- Routes in `backend/routers/`, registered with `app.include_router(..., prefix="/api")`.
- Use the existing `MongoDBConnector` singleton: `from db.mdb import db as _db`.
  Don't instantiate it again.
- Always filter `{ "_r": False }`.
- Serialise `ObjectId` → `str(doc["_id"])` before returning JSON.
- **Import optional deps lazily** inside the function that needs them
  (`boto3`, `anthropic`, `qrcode`, `httpx`). The same image runs in environments
  where a given provider isn't configured; a missing/unconfigured dependency
  must disable one feature, never break startup.
- **Deletes are tombstones**, not `deleteOne()`. See `routers/mapitems.py` — it
  hard-deletes then re-inserts with `_r: true` and a bumped `_c` so the connector
  actually propagates the change instead of treating it as a loop.
- `GET /api/health` is the probe target; `GET /api/features` advertises optional
  capabilities to the frontend.
- Env vars: see `backend/.env.example` (organised into local vs cloud blocks).

## Frontend Conventions

- `@/` maps to `frontend/` (see `jsconfig.json`).
- **Components**: `frontend/components/<Name>/<Name>.js` + `use<Name>.js`.
- **API calls** go through `frontend/app/api/<resource>/route.js` proxy routes —
  never call the backend directly from a client component.
- **No `NEXT_PUBLIC_*`.** Read config at request time in a Route Handler so one
  image works everywhere and nothing is baked into the client bundle.
- **Capability flags**: `useFeatures()` (`lib/hooks/useFeatures.js`) reads
  `/api/features`. Hide UI whose backing service isn't configured rather than
  rendering something that 503s.
- **Polling**: `usePolling(fn, ms)` from `lib/hooks/usePolling.js` (2 s default).
- **react-leaflet** needs `dynamic(() => import(...), { ssr: false })`;
  `reactStrictMode` is off because react-leaflet 4.x double-mounts under it.
- Palette from `@leafygreen-ui/palette`. JavaScript only — no TypeScript.

## Local Development

```bash
make setup        # full stack in kind (~25-35 min first run)
make verify       # smoke test incl. MongoDB -> Ditto round-trip
make rebuild      # rebuild images + restart after a code change
make soft-reset   # rebuild Ditto + app only (keeps Ops Manager)
make pair         # print ATAK pairing values
make lint         # ruff, as CI runs it
```

Key gotchas when editing infra:

- `infra/k8s/ditto/10-bigpeer.yaml` is a **template** (`__BIG_PEER_HOST__`,
  `__BIG_PEER_VERSION__`, `__DITTO_PLAYGROUND_TOKEN__`), substituted by
  `scripts/setup.sh`. Don't `kubectl apply` it directly.
- The Ditto Operator is **Private Preview** — verify CRD fields with
  `kubectl explain bigpeer.spec` after any version bump.
- Strimzi must stay at **0.49.0** (newer breaks the Big Peer controller).

## Deployment

- Local: `kind`, via `scripts/setup.sh`.
- Cloud (internal): Kanopy release `tak-situational-demo`, deployed from the
  `staging` branch by Drone. See `docs/INTERNAL_DEPLOY_MAINTENANCE.md`. There is
  currently **no production pipeline**.

## Private Material

`not-to-be-uploaded/` and `tak/` are gitignored and must stay that way:
operator notes with plaintext credentials, the Ditto schema spec, ATAK/plugin
APKs, and the ATAK CIV SDK checkout. **Never** move anything from there into
`docs/` (which _is_ tracked) without stripping secrets first.

## Open Items

- **ATAK ↔ self-hosted Big Peer pairing is unverified on hardware.** The QR
  payload format the plugin expects hasn't been confirmed; typed entry is the
  reliable path. See `docs/RUN_LOCAL.md#pairing-an-atak-device`.
- **Attachments are ephemeral locally** (Big Peer in-memory backend) — photo
  thumbnails are lost when the API pod restarts.
- **`/simulate` + `routers/genymotion.py` are paused work** (Genymotion PaaS
  instances parked). Hidden unless `ENABLE_SIMULATE=true`. Don't build on it.
- `FilePanel`, `AlertPanel`, `TelemetryPanel` JSX components are not rendered by
  any page — only their hooks are reused (`useFilePanel` by `ChatPanel`).
- Queryable Encryption: talk-track only, demonstrated live in Compass/Atlas UI.
  No code here.
