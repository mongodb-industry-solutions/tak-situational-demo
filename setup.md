# Setup Guide — MongoDB + Ditto TAK Situational Demo

This guide walks through setting up the entire system from scratch: one or more Android devices
running ATAK CIV with the Ditto ATAK Plugin, through the Ditto Cloud Big Peer and MongoDB Connector,
into a MongoDB Atlas cluster, and finally the command vehicle dashboard in this repository.
Data flows one way — from field devices down to the dashboard — and the dashboard is
**read-only** from Atlas.

> **Demo shortcut:** For this demo, the Ditto Big Peer, MongoDB Connector, and Atlas cluster
> are **already configured and can be provided by the MongoDB Industry Solutions team.**
> Parts 2, 3, and 4 describe the full setup process for reference; if you are running the
> demo with the provided credentials you can skip directly to Part 5.

```text
[Android Devices — 1 or more]
  ATAK CIV + Ditto ATAK Plugin
  │  CoT events over Ditto P2P mesh (works fully offline)
  ▼
[Ditto Cloud]
  Big Peer (managed cloud or self-hosted)
  │  Ditto MongoDB Connector (bidirectional sync)
  ▼
[MongoDB Atlas]
  Collections: track · mapitem · chat
  │  pymongo (read-only)
  ▼
[FastAPI Backend]  ←  this repo
  │  REST API polled every 2 s
  ▼
[Next.js Frontend]  ←  this repo
  Command Vehicle Dashboard
  Map · Node Status · Comms Feed
```

---

## Prerequisites

- One or more Android **physical** devices running **Android 10+**
  (tested on Pixel 8A, Android 14 — virtual/emulated devices are not recommended;
  GPS simulation and sideloading are unreliable on emulators)
- **ATAK CIV** app (free from [TAK.gov](https://tak.gov) — requires a free account)
- **Ditto ATAK Plugin** APK — see Part 1 for how to obtain it
- A [Ditto Portal](https://portal.ditto.live) account (Parts 2 & 3)
- A [MongoDB Atlas](https://cloud.mongodb.com) account (Part 4)
- For running the dashboard locally:
  - Python **≥ 3.13, < 3.14** and [`uv`](https://docs.astral.sh/uv/)
  - Node.js **22+** and npm
  - Docker Desktop (optional, for the containerised path)

---

## Part 1 — Android Devices: ATAK CIV + Ditto ATAK Plugin

The demo supports **one or more physical Android devices**. Each device runs ATAK CIV with the
Ditto ATAK Plugin, forming a P2P mesh. All devices sync their position and chat data through
the Ditto Big Peer into Atlas, where the dashboard shows the combined operational picture.

### 1.1 Install ATAK CIV

1. Register a free account at [tak.gov](https://tak.gov).
2. Download the latest **ATAK CIV** APK from the TAK.gov product page.
3. Sideload the APK onto each Android device:
   - Enable **Install from unknown sources** in Android Settings → Security.
   - Transfer the APK to the device (USB, email, etc.) and tap to install.

### 1.2 Obtain the Ditto ATAK Plugin

The plugin used in this demo is the **[Ditto ATAK Plugin](https://www.ditto.com/products/ditto-atak-plugin)**
— a purpose-built ATAK integration from Ditto, not the general-purpose Ditto Edge SDK.

> **The APK is not publicly distributed as a direct download.**
> To obtain it:
>
> - Contact the Ditto team directly.
> - Or ask the MongoDB Industry Solutions team — **a copy is already available for this demo**.

Once you have the APK, sideload it onto each device the same way as ATAK CIV above.

### 1.3 Configure the Ditto ATAK Plugin on Each Device

After ATAK is running and the plugin is installed:

1. Open ATAK → tap the **Ditto** icon in the toolbar (or **Tools → Ditto ATAK Plugin**).
2. Tap **Connect**. Scan the QR code in the demo.
3. Ensure GPS is active and the device is moving — ATAK will begin emitting CoT events
   that the plugin captures and syncs to the mesh.

> **Schema note:** The plugin writes **Ditto ATAK v2 schema** — all document fields use
> single-character names (`j` = latitude, `l` = longitude, `o` = stale time, etc.).
> See `docs/document_schema.md` for the full field reference.

---

## Part 2 — Ditto Cloud: Big Peer

> **For this demo, a Big Peer is already deployed and configured.**
> The App ID, App Token, and Big Peer URL are provided by the MongoDB IS team.
> This section documents the process for setting up a new deployment from scratch.

[Ditto Portal](https://portal.ditto.live) is where you manage your Big Peer deployment and
obtain the credentials the ATAK plugin needs.

### 2.1 Create an Organization and Application

1. Sign up / log in at <https://portal.ditto.live>.
2. Create an **Organization** (e.g. `mongodb-tak-demo`).
3. Inside the organization, create an **Application**.
4. From the application overview, note:
   - **App ID**
   - **App Token**

   These are what you need to create the qr code used in Part 1.3.

> For this demo the **managed Ditto Cloud** option was the first step.
> A self-hosted deployment is work in progress and will be available in the future.

---

## Part 3 — Ditto MongoDB Connector

> **For this demo, the MongoDB Connector is already configured and syncing.**
> The connector setup was completed in advance; the collections (`track`, `mapitem`, `chat`)
> are already being synced to the provided Atlas cluster.
> This section documents the process for configuring it from scratch on a new deployment.
>
> **Note for new setups:** Provisioning the MongoDB Connector requires coordination with the
> Ditto team and should be requested **well in advance** of the demo date, as it is not
> self-serve for all account tiers.

The Ditto MongoDB Connector runs alongside the Big Peer and continuously syncs documents
between Ditto and your Atlas cluster. It became **Generally Available on 14 April 2025**.

Full connector documentation: [Ditto MongoDB Connector — Create MongoDB Collections](https://docs.ditto.live/cloud/mongodb-connector#create-mongodb-collections)

### 3.1 Configure the Connector

> **Complete Part 4 (Atlas cluster setup) first** — you need a connection string before
> configuring the connector.

1. In the Ditto Portal, go to your application → **Settings** → **MongoDB Connector**.
2. Click **Configure**.
3. Enter your Atlas **connection string** (using the `readWrite` user — see Part 4.3).
4. Select the collections to sync:
   - `track` — PLI / position data (transient)
   - `mapitem` — persistent map graphics
   - `chat` — messages from field devices
   - `file` and `alert` are also created by the plugin but are not used by this dashboard
5. Save and **enable** the connector.

### 3.2 Allowlist Ditto Big Peer IPs in Atlas

The connector originates connections from the Ditto Big Peer egress IPs.
You must add these to your Atlas cluster's Network Access list:

1. In the Ditto Portal → **Settings** → **MongoDB Connector**, find the listed **egress IP addresses**
   (three IPs for Ditto Cloud-managed deployments).
2. In Atlas → **Network Access** → **Add IP Address**, add each of these IPs.

---

## Part 4 — MongoDB Atlas Cluster

> **For this demo, the Atlas cluster is already set up and the connection string is provided.**
> This section documents the process for configuring a cluster from scratch.

### 4.1 Create a Cluster

1. Log in to [cloud.mongodb.com](https://cloud.mongodb.com).
2. Create a new cluster:
   - **MongoDB version:** 5.0 or higher (required by the Ditto connector; current Atlas defaults satisfy this)
   - **Cloud / Region:** Match the region of your Ditto Big Peer deployment where possible

### 4.2 Create the Database and Collections

The Ditto connector creates collections automatically on first sync, but you can create the
database in advance:

1. Atlas → **Browse Collections** → **Create Database**.
2. Database name — this becomes your `DATABASE_NAME` environment variable (e.g. `tak_demo`).
3. Create an initial collection (e.g. `track`) — Atlas requires at least one to create the database.

### 4.3 Create Database Users

Create **two users** with the principle of least privilege:

| User | Role | Used by |
| --- | --- | --- |
| `ditto-connector` | `readWrite` on your database | Ditto MongoDB Connector (For Part 3.1) |
| `dashboard-reader` | `read` on your database | This dashboard's backend |

Atlas → **Database Access** → **Add New Database User** for each.

### 4.4 Verify Data is Flowing

After the connector is enabled and at least one device has the ATAK plugin active:

1. Atlas → **Browse Collections** → select `track`.
2. Documents should appear within seconds of the device moving.

> **Chat field note:** The Ditto ATAK Plugin writes `msg` (message text), `e` (callsign),
> and `b` (timestamp ms) in the `chat` collection — not `message`/`authorCallsign`/`time`
> as the schema spec document states. The dashboard backend reads the actual field names.

---

## Part 5 — Command Vehicle Dashboard (this repo)

### 5.1 Environment Setup

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env` with your Atlas details (use the provided demo credentials, or your own from Part 4.5):

```env
MONGODB_URI=mongodb+srv://dashboard-reader:<password>@<cluster>.mongodb.net/?retryWrites=true&w=majority
DATABASE_NAME=tak_demo        # must match the database name from Part 4.2
APP_NAME=tak-situational-demo # optional — shown in Atlas monitoring
```

### 5.2 Run Locally (development mode)

Open two terminals:

```bash
# Terminal 1 — Backend (http://localhost:8000)
make uv_init && make uv_sync
cd backend && uv run uvicorn main:app --host 0.0.0.0 --port 8000
```

```bash
# Terminal 2 — Frontend (http://localhost:3000)
cd frontend && npm install && npm run dev
```

- Dashboard: <http://localhost:3000>
- API docs (Swagger UI): <http://localhost:8000/docs>

### 5.3 Run with Docker (Optional)

```bash
make build   # build images and start both containers
make stop    # stop without removing containers
make clean   # teardown containers and images
```

Requires `backend/.env` to exist **before** running `make build`.

### 5.4 Port Reference

| Service | Local dev | Docker (host) | Docker (container) |
| --- | --- | --- | --- |
| FastAPI backend | 8000 | 8000 | 8080 |
| Next.js frontend | 3000 | 3000 | 8080 |

---

## Verifying the Full Stack

Work through these checks top-to-bottom:

1. **ATAK devices** — Ditto plugin icon is green / connected on each device; GPS is active.
2. **Ditto Portal** → your app → **Data Browser** — documents appear in `track` and `chat` collections.
3. **MongoDB Atlas** → **Browse Collections** → `track` — same documents appear within a few seconds.
4. **Backend API** — `GET http://localhost:8000/api/tracks` returns a JSON array with `j` (lat) and `l` (lon) fields.
5. **Dashboard** — <http://localhost:3000> — the map shows device markers and the Node Status panel lists callsigns.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| No documents in Atlas | Connector not reaching Atlas | Add Ditto Big Peer egress IPs to Atlas Network Access (Part 3.2) |
| Connector configuration fails | Wrong connection string or user | Use the `ditto-connector` readWrite user string (Part 4.5) |
| Backend fails to start | Missing or invalid `MONGODB_URI` | Check `backend/.env`; verify Atlas Network Access includes your machine IP |
| Map shows no markers | Backend returns empty `track` array | Confirm documents exist in Atlas with `_r: false`; check `GET /api/tracks` directly |
| Markers are grey with ⚠ STALE | Normal — device not recently updated | Last-known position is always displayed; stale means `Date.now() > doc.o` |
| Chat panel is empty | Field name mismatch | Confirm Atlas `chat` documents use `msg`/`e`/`b` (not `message`/`authorCallsign`/`time`) |
| `localhost:3000` unreachable (Docker) | `backend/.env` missing before build | Create `backend/.env` first, then `make clean && make build` |
| Docker container starts but API errors | `BACKEND_URL` misconfigured | Should be `http://tak-situational-backend:8080` (set automatically by `docker-compose.yml`) |
