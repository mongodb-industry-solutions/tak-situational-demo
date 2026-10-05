# TAK Situational Demo — Command Vehicle Dashboard

A situational awareness dashboard for the MongoDB + Ditto tactical edge demo.
Android devices running **ATAK CIV** with the **Ditto ATAK Plugin** form a
peer-to-peer mesh that keeps working with no network at all; when connectivity
returns, their position, chat, markers and photos sync through a **Ditto Big
Peer** and the **Ditto MongoDB Connector** into **MongoDB**, where this
dashboard renders the live operational picture — and writes commands back.

Everything runs **on your own machine**: MongoDB **Enterprise Advanced** managed
by the MongoDB Kubernetes operator, and a **self-hosted Ditto Big Peer** managed
by the **Ditto Operator**, both in a local `kind` cluster. No MongoDB Atlas
account, no Ditto Cloud account, no cloud provider.

```
┌─ Android ATAK CIV + Ditto Edge Sync plugin ──┐   ┌─ Android ATAK CIV ─┐
│  CoT events over a Ditto P2P mesh (offline)  │◀──▶                    │
└──────────────────────┬───────────────────────┘   └────────────────────┘
                       │ wss (when a network exists)
                       ▼
       Ditto Big Peer  ·  self-hosted via the Ditto Operator
                       │ Ditto MongoDB Connector (BigPeerDataBridge)
                       ▼  bidirectional, CRDT conflict resolution
       MongoDB Enterprise Advanced  ·  MCK operator + self-hosted Ops Manager
                       │  track · mapitem · chat · file · alert
                       ▼  pymongo — reads, plus command writes
       FastAPI backend ──▶ Next.js dashboard  ·  http://localhost
                           Map · Node Status · Comms · AI panel
```

## What it demonstrates

- **Offline-first edge sync.** The mesh is the system of record in the field;
  MongoDB is the system of record at command. Ditto's CRDTs merge concurrent
  edits from both sides without custom conflict code.
- **Bidirectional, declarative integration.** The MongoDB Connector is a
  Kubernetes resource (`BigPeerDataBridge`), so the edge↔cloud contract is
  version controlled rather than clicked together in a web console.
- **The document model doing real work.** Heterogeneous CoT events, chat, file
  metadata and alerts live side by side in their native shape — the dashboard
  reads the same single-character Ditto ATAK v2 fields the plugin writes.
- **Commands flowing back out.** Placing a marker or sending chat from the
  dashboard writes to MongoDB and lands on the devices through the same
  connector.
- **Deploy-anywhere MongoDB.** The identical application image runs against
  self-managed Enterprise Advanced locally and Atlas in the cloud; only
  configuration differs.

## Quick start

**No accounts and no credentials required.** Full detail, timings and caveats
are in **[`docs/RUN_LOCAL.md`](docs/RUN_LOCAL.md)** — read it before the first
run, the Ops Manager step is slow and that is expected.

```bash
make setup     # ~25-35 min on a first run (Ops Manager dominates)
make verify    # end-to-end smoke test, incl. a MongoDB -> Ditto round-trip
open http://localhost
```

`make setup` is idempotent — re-run it after a failure and it resumes. When it
finishes it prints everything you need: the dashboard URL, a Compass connection
string, the Ops Manager login, and the values for pairing an ATAK device.

### Requirements

|       |                                                                                  |
| ----- | -------------------------------------------------------------------------------- |
| Tools | Docker, `kind`, `kubectl`, `helm`, `openssl`, `curl`, `python3`                  |
| RAM   | **32 GB recommended.** 24 GB works if little else is running; 16 GB will thrash. |
| Disk  | ~30 GB for images and volumes                                                    |
| Ports | 80, 443 free (ingress); 27017 and 8080 ideally free                              |

`scripts/preflight.sh` checks all of this and runs automatically.

> **Pairing a real device is not yet verified end to end.** The dashboard
> generates the Ditto identity (QR + typed values) for the self-hosted Big Peer,
> but the exact payload the ATAK plugin expects from a scanned QR has not been
> confirmed against a physical device. See
> [`docs/RUN_LOCAL.md`](docs/RUN_LOCAL.md#pairing-an-atak-device).

## Make targets

|                                             |                                                           |
| ------------------------------------------- | --------------------------------------------------------- |
| `make setup`                                | Bring the whole local stack up                            |
| `make verify`                               | End-to-end smoke test                                     |
| `make status`                               | What's running, across all three namespaces               |
| `make pair`                                 | Reprint the ATAK pairing details                          |
| `make rebuild`                              | Rebuild both images and restart — use after a code change |
| `make logs` / `logs-ditto` / `logs-mongodb` | Tail the dashboard / Big Peer / MCK operator              |
| `make models`                               | (Re)pull the Ollama model used by the AI panel            |
| `make soft-reset`                           | Rebuild just the Ditto + app layer (keeps Ops Manager)    |
| `make reset`                                | Delete the kind cluster and all local state               |
| `make lint`                                 | Lint the backend the way CI does                          |

`make soft-reset` is the one to use while iterating: it skips the ~25 minute Ops
Manager rebuild but still gives you a clean Big Peer and database.

## Tech stack

| Layer     | Local (self-hosted)                                                        | Cloud (internal only)           |
| --------- | -------------------------------------------------------------------------- | ------------------------------- |
| Database  | MongoDB **Enterprise Advanced** 8.0, MCK operator + in-cluster Ops Manager | MongoDB Atlas                   |
| Edge sync | **Ditto Big Peer** via the Ditto Operator (Private Preview)                | Ditto Cloud Big Peer            |
| Connector | `BigPeerDataBridge` CR                                                     | Ditto Portal configuration      |
| AI panel  | Ollama in-cluster (`qwen2.5:7b`)                                           | MongoDB internal LLM gateway    |
| Basemap   | OpenStreetMap tiles                                                        | CARTO                           |
| Backend   | FastAPI · Python 3.13 · `uv`                                               | same image                      |
| Frontend  | Next.js 15 (App Router, JS) · LeafyGreen · Tailwind 4 · Leaflet            | same image                      |
| Platform  | `kind`, `mongodb/web-app` Helm chart                                       | Kanopy (Kubernetes), same chart |

## Repo layout

```
backend/     FastAPI — routers/ (tracks, mapitems, chat, files, alerts,
             telemetry, systemai, ditto, genymotion), db/mdb.py
frontend/    Next.js dashboard; /api/* Route Handlers proxy to the backend
infra/k8s/   kind manifests: MongoDB EA + Ops Manager, Ditto Big Peer + App +
             connector, Ollama, ingress, host-access NodePorts
infra/local/ mongodb/web-app Helm values for the local cluster
scripts/     setup · verify · reset · preflight · pull-models (+ lib.sh)
environment/ mongodb/web-app Helm values for Kanopy (internal)
docs/        RUN_LOCAL · architecture · troubleshooting · internal deploy
```

## Documentation

|                                                                              |                                                                                          |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| [`docs/RUN_LOCAL.md`](docs/RUN_LOCAL.md)                                     | **Start here.** Prerequisites, what `setup.sh` does, pairing a device, day-2 operations. |
| [`docs/architecture.md`](docs/architecture.md)                               | How the pieces fit, data flow, schema, design decisions, known gaps.                     |
| [`docs/troubleshooting.md`](docs/troubleshooting.md)                         | Symptom-first fixes.                                                                     |
| [`docs/INTERNAL_DEPLOY_MAINTENANCE.md`](docs/INTERNAL_DEPLOY_MAINTENANCE.md) | The hosted Kanopy/Atlas/Ditto Cloud deployment — **MongoDB internal only**.              |

## A note on the hosted deployment

There is also a continuously deployed internal instance on Kanopy, backed by
Atlas and Ditto Cloud, used for MongoDB-internal demos. It is **not** the
intended way to run this repository: it depends on MongoDB-internal
infrastructure (Kanopy, the LLM gateway, a private S3 asset, Genymotion) that
nobody outside MongoDB can provision. Everything in this README and in
`docs/RUN_LOCAL.md` describes the self-hosted path, which is the supported one.

The `/simulate` view and the `genymotion` router belong to a **paused** effort to
emulate ATAK devices for sales demos. They are kept in-tree but hidden unless
`ENABLE_SIMULATE=true`, so a fresh clone shows no dead buttons.

## License

See [LICENSE](LICENSE).
