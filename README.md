# TAK Situational Demo — Command Vehicle Dashboard

Browser-based situational awareness dashboard for the MongoDB + Ditto tactical
edge demo. Visualises real-time data from Android ATAK devices synced via the
Ditto P2P mesh and the Ditto MongoDB Connector into MongoDB Atlas.

## Where MongoDB Shines

- **Flexible Document Model** — heterogeneous CoT events, sensor data, and chat
  messages stored side-by-side without schema rigidity
- **Queryable Encryption** — operational data on field devices is cryptographically
  protected; encryption keys stay at Command even if a device is captured
- **Real-time** — live operational picture the moment connectivity is restored
  to the field

## High Level Architecture

```
[Android ATAK CIV + Ditto Edge Sync Plugin]
         │  CoT events over Ditto P2P mesh (works fully offline)
         ▼
[Ditto Cloud Big Peer]
         │  Ditto MongoDB Connector
         ▼
[MongoDB Atlas]  ← live data in Ditto ATAK v2 schema
         │  pymongo (read-only)
         ▼
[FastAPI Backend]
         │  REST API (polled every 2s)
         ▼
[This Dashboard — Command Vehicle View]
  Map · Node Status · Comms Feed
```

## Tech Stack

- **FastAPI** (Python 3.13) — read-only backend API
- **Next.js 15** (App Router) — dashboard frontend
- **MongoDB Atlas** — primary data store (populated by Ditto connector)
- **LeafyGreen UI** + **Tailwind CSS 4** — UI components and styling
- **Leaflet.js** (react-leaflet v5) — interactive tactical map

## Prerequisites

- Python >=3.13,<3.14
- Node.js 22+
- uv
- MongoDB Atlas cluster URI (Ditto connector must be configured and syncing)

## Run Locally

### Backend

```bash
cp backend/.env.example backend/.env
# Edit backend/.env and set MONGODB_URI and DATABASE_NAME
make uv_init && make uv_sync
cd backend && uv run uvicorn main:app --host 0.0.0.0 --port 8000
```

Backend available at http://localhost:8000

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Dashboard available at http://localhost:3000

### Environment variables

| Variable | Where | Description |
|---|---|---|
| `MONGODB_URI` | `backend/.env` | MongoDB Atlas connection string |
| `DATABASE_NAME` | `backend/.env` | Atlas database name |
| `APP_NAME` | `backend/.env` (optional) | App name for Atlas monitoring |
| `BACKEND_URL` | frontend env / Kanopy | FastAPI backend base URL (default: `http://localhost:8000`) |

## Run with Docker

```bash
make build   # build and start both containers
make clean   # teardown containers and images
```

## Deployment (Kanopy)

See [KANOPY_DEPLOYMENT_README.md](KANOPY_DEPLOYMENT_README.md) for full instructions.

Deployment name: `defence-tak-ditto-sync`

## Common Errors

### Backend

- Ensure `backend/.env` exists with a valid `MONGODB_URI` and `DATABASE_NAME`.
- Ensure the Atlas cluster IP allowlist includes your machine (or Kanopy egress range).

### Frontend

- If the map does not render, check that `BACKEND_URL` is reachable and `/api/tracks` returns data.
- Leaflet requires browser APIs — the map component uses `dynamic` import with `ssr: false`.
