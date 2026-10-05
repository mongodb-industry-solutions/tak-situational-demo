# Architecture

## Goal

Show MongoDB and Ditto solving **disconnected tactical operations**. Field teams
carry Android devices running ATAK CIV; they need a shared operational picture
while completely offline, and command needs that picture — plus the ability to
push orders back out — the moment any connectivity exists.

Ditto owns the edge: a peer-to-peer mesh over BLE, Wi-Fi Direct and LAN with no
server in the loop. MongoDB owns the command side: the durable, queryable system
of record the dashboard, analytics and AI read from.

Two deployment targets share one codebase, switched by configuration only:

- **Local** — everything in a `kind` cluster: MongoDB **Enterprise Advanced**
  (MCK operator + self-hosted Ops Manager) and a **self-hosted Ditto Big Peer**
  (Ditto Operator). No external accounts. _This is the supported path._
- **Cloud** — Kanopy via Drone, backed by Atlas and Ditto Cloud. MongoDB
  internal only; see [`INTERNAL_DEPLOY_MAINTENANCE.md`](INTERNAL_DEPLOY_MAINTENANCE.md).

## Data flow

```
Android ATAK CIV + Ditto Edge Sync plugin
   │  (1) CoT events -> local Ditto store -> P2P mesh  [works fully offline]
   ▼
Ditto Big Peer  (ns: ditto — store · subscription · api, Kafka transaction log)
   │  (2) MongoDB Connector = BigPeerDataBridge CR
   │      change streams w/ pre+post images, CRDT conflict resolution
   ▼
MongoDB Enterprise Advanced  (ns: mongodb — single-member RS, SCRAM)
   │      db tak_demo: track · mapitem · chat · file · alert  (+ ai_sessions)
   │  (3) pymongo
   ▼
FastAPI backend  (ns: tak, internal-only Service)
   │  (4) REST, polled every 2 s
   ▼
Next.js dashboard  ──  http://localhost  (ingress-nginx)
        Map · Node Status · Comms feed · AI panel
```

Command actions reverse the flow: the dashboard writes to MongoDB (4→3), the
connector picks the change up from the change stream (2), and it reaches every
device through the Big Peer and the mesh (1).

### Which way is each collection driven?

| Collection    | Primary writer            | Dashboard does                               |
| ------------- | ------------------------- | -------------------------------------------- |
| `track`       | devices (PLI, high churn) | read only                                    |
| `mapitem`     | both                      | read · place marker · tombstone              |
| `chat`        | both                      | read · send message                          |
| `file`        | devices                   | read metadata · proxy thumbnails · tombstone |
| `alert`       | devices                   | read                                         |
| `ai_sessions` | backend                   | read/write — **never synced to Ditto**       |

## Components

| Component         | Source                                               | Role                                                                                                               |
| ----------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| MCK operator      | `mck/mongodb-kubernetes` ~1.8.1                      | Manages the `MongoDBOpsManager`, `MongoDB` and `MongoDBUser` CRs                                                   |
| Ops Manager       | `MongoDBOpsManager` CR                               | In-cluster EA control plane (automation agent). ~4 GB JVM + its own 3-member app DB                                |
| MongoDB           | EA 8.0.9-ent, `MongoDB` CR                           | Single-member replica set: oplog + change streams, which the connector needs                                       |
| Ditto Operator    | `oci://quay.io/ditto-external/ditto-operator` 0.18.1 | Manages `BigPeer`, `BigPeerApp`, `BigPeerDataBridge`, `BigPeerApiKey` (**Private Preview**)                        |
| Big Peer          | `BigPeer` CR, 1.63.2                                 | Ditto Server: store, subscription (device wss), HTTP API                                                           |
| cert-manager      | Helm, jetstack                                       | Ditto Operator prerequisite — issues auth certificates                                                             |
| Strimzi           | Helm 0.49.0                                          | Kafka operator; backs the Big Peer transaction log. **0.49.0 is the ceiling** — 1.x breaks the Big Peer controller |
| MongoDB Connector | `BigPeerDataBridge` CR                               | Bidirectional Ditto ↔ MongoDB sync                                                                                 |
| Ollama            | `ollama/ollama`                                      | In-cluster LLM for the AI panel (`qwen2.5:7b`, tool calling)                                                       |
| backend           | `Dockerfile.backend`                                 | FastAPI. Internal Service, no ingress                                                                              |
| frontend          | `Dockerfile.frontend`                                | Next.js standalone, `/api/*` runtime proxy                                                                         |

backend and frontend deploy through the **same `mongodb/web-app` Helm chart**
used on Kanopy — local (`infra/local/*.yaml`) and cloud (`environment/*.yaml`)
differ only in values and secrets, never in image or code.

## Key design decisions

### The connector is a Kubernetes resource, not a console setting

In Ditto Cloud the MongoDB Connector is configured by hand in the Portal UI
against an Atlas SRV string. Self-hosted, it is a `BigPeerDataBridge` CR
(`infra/k8s/ditto/30-mongo-connector.yaml`): version controlled, reviewable, and
reproducible with `kubectl apply`. It also talks to MongoDB over a plain
in-cluster `mongodb://` URI — no SRV requirement, no public internet hop, and no
Atlas IP allowlist to maintain.

That last point is the main operational difference between the two deployments.
The cloud path requires allowlisting three Ditto Big Peer egress IPs in Atlas;
the self-hosted path has no such coupling because both halves are in the same
cluster.

### ID mapping is 1:1

Every Ditto ATAK v2 collection uses a plain **String** `_id` (a CoT UID, a file
hash, a message id), so the bridge uses `fields: [_id]` and IDs stay identical on
both sides. That matters because the dashboard addresses documents by the same id
it read from MongoDB (`DELETE /api/mapitems/{id}`). Ditto's more elaborate
ID-mapping modes exist for cases where Ditto needs a compound `_id` for
permission scoping — not needed here, since the demo uses a single playground
identity with full access.

### `native` mode, strict mode off

`mode: native` stores documents as CBOR with lossy BSON conversion — efficient,
and sufficient because the ATAK schema is scalars plus a little nesting.
`dqlStrictMode: false` syncs objects as Ditto **maps**, so changing one field
doesn't re-sync the whole document; it is Ditto's documented recommendation and
matches the SDK 5.x default. `ejson` mode is the escape hatch if full BSON
fidelity is ever needed — at the cost of a much more verbose representation.

> The CRD enum is `native | ejson`. Ditto's prose documentation says the default
> is `"json"`, which is wrong — verified against
> `bigpeerdatabridges.yaml` in the chart.

### Soft deletes everywhere

Ditto treats a delete arriving from MongoDB as terminal: it wins over concurrent
edits and even over later recreation on a device. So the ATAK schema carries an
`_r` soft-delete flag, and the dashboard **tombstones** rather than deletes.
`routers/mapitems.py` goes further and does a hard-delete-then-reinsert to get a
new document version, which is what forces the connector to propagate the
tombstone rather than treating it as a no-op loop. Every read filters
`{ _r: false }`.

### Staleness is displayed, never hidden

`doc.o` is a stale-time in epoch millis set by the plugin. `Date.now() > doc.o`
means stale — rendered greyed out with a `⚠ STALE` tooltip, and red-bordered in
the node panel. Stale nodes are **never removed**: a last known position is
operationally valuable, and silently dropping a unit from the map would be worse
than showing it as old.

### One image, runtime configuration, no `NEXT_PUBLIC_*`

Every frontend value is read at **request time** in a Route Handler, so the same
build runs locally and on Kanopy, and no key is baked into the client bundle.
`/api/features` and `/api/systemai/status` let the UI hide capabilities whose
backing service isn't configured — which is why a fresh clone with no LLM and no
CARTO key shows a coherent dashboard (OSM tiles, no AI panel) instead of panels
that error on every call.

### Two LLM providers behind one agent

`routers/systemai.py` keeps one set of four tools and one system prompt, with two
transports: Ollama's native `/api/chat` (local) and the Anthropic SDK against
MongoDB's gateway (cloud). Tool definitions live once in Anthropic shape and are
translated for Ollama. Both clients are constructed **lazily** — an unconfigured
provider must not break the whole backend at import time, it should just disable
one panel.

### Why kind, and why Ops Manager in-cluster

MongoDB EA under MCK requires an external management resource — Ops Manager
(self-managed) or Cloud Manager (SaaS). Using Cloud Manager would reintroduce
exactly the cloud dependency this rework removes, so Ops Manager runs in the same
kind cluster. The Ditto Operator is Kubernetes-native too, and needs
cert-manager, an ingress controller and a Kafka operator — so both halves want a
real cluster rather than Compose. kind gives that on a laptop, and lets local use
the same Helm chart as Kanopy.

## Ditto ATAK v2 schema

The plugin writes single-character field names. The ones the dashboard relies on:

| Field       | Meaning                                          |
| ----------- | ------------------------------------------------ |
| `j` / `l`   | latitude / longitude                             |
| `c` / `e`   | callsign                                         |
| `d`         | device UID                                       |
| `w`         | CoT type (`a-f-G-U-C` = friendly ground unit)    |
| `b`         | last update (epoch ms)                           |
| `o`         | stale time (epoch ms) — `Date.now() > o` ⇒ STALE |
| `_r`        | soft-delete flag — always filter `{ _r: false }` |
| `r1` / `r2` | track speed / course                             |
| `i` / `h`   | altitude / circular error                        |

Two field-level gotchas, both confirmed against the plugin APK:

- **`chat` uses `msg` / `e` / `b`**, not `message` / `authorCallsign` / `time`
  as Ditto's schema document claims.
- **`file.thumb._id` is BSON Binary** and must be URL-safe base64 encoded
  (no padding) to address the Big Peer attachment API.

Telemetry (speed, course, altitude) is derived from `track` in
`routers/telemetry.py`; `9999999` is the plugin's "no value" sentinel and maps
to `null`.

## Known gaps

| Gap                                   | Detail                                                                                                                                                                                                                                                                |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Device pairing unverified**         | The Big Peer, App and connector work, and the dashboard emits the identity values, but the QR payload format the ATAK plugin expects has not been confirmed on hardware. Typed entry is the reliable path. See [`RUN_LOCAL.md`](RUN_LOCAL.md#pairing-an-atak-device). |
| **Attachments are ephemeral**         | The Big Peer defaults to an in-memory attachment backend; thumbnails are lost on API pod restart. Durable storage requires S3/Azure, i.e. EKS/AKS. Metadata persists regardless.                                                                                      |
| **Nested-object fidelity**            | `native` + strict-mode-off is the documented recommendation, but `file.thumb` round-tripping through the connector has not been exercised end to end (it needs a real device photo). If it misbehaves, try `dqlStrictMode: true` or `mode: ejson` on `file` alone.    |
| **Ditto Operator is Private Preview** | CRD fields may change between releases; manifests are version-pinned and carry `kubectl explain` hints.                                                                                                                                                               |
| **Single-member replica set**         | Enough for change streams and the demo. Not a resilience story.                                                                                                                                                                                                       |
| **Playground auth**                   | `OnlinePlayground` grants any device holding the shared token full read/write. Fine for a demo; production wants `OnlineWithAuthentication` with a token webhook.                                                                                                     |
| **Queryable Encryption**              | Part of the talk track, demonstrated live in Compass/Atlas UI. No code in this repo.                                                                                                                                                                                  |
| **Simulate view paused**              | `/simulate` + `routers/genymotion.py` depend on Genymotion PaaS instances that are parked. Hidden behind `ENABLE_SIMULATE`.                                                                                                                                           |

## Repo layout

```
backend/      FastAPI — routers/, db/mdb.py (MongoDBConnector singleton)
frontend/     Next.js — app/api/* proxy routes, components/<Name>/<Name>.js + use<Name>.js
infra/k8s/    kind manifests: mongodb/ (OM, EA, users, post-init),
              ditto/ (BigPeer, App, connector), ollama/, ingress/, access/
infra/local/  mongodb/web-app Helm values for kind
environment/  mongodb/web-app Helm values for Kanopy (internal)
scripts/      lib.sh + preflight · setup · verify · reset · pull-models
docs/         this file, RUN_LOCAL, troubleshooting, INTERNAL_DEPLOY_MAINTENANCE
.drone.yml    Kanopy CI/CD (internal)
```
