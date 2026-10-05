# infra/k8s — the local, fully self-hosted stack

Kubernetes manifests for running the demo on a **kind** cluster with no external
accounts: MongoDB **Enterprise Advanced** managed by the MCK operator through a
**self-hosted Ops Manager**, and a **Ditto Big Peer** managed by the **Ditto
Operator**, with the **MongoDB Connector** declared as a custom resource.

`scripts/setup.sh` applies all of this in the right order. This README explains
what each piece is for; see [`../../docs/RUN_LOCAL.md`](../../docs/RUN_LOCAL.md)
for timings and operations, and
[`../../docs/architecture.md`](../../docs/architecture.md) for the reasoning.

## Layout

```
infra/k8s/
  kind-cluster.yaml             kind config: host port mappings + ingress-ready node
  00-namespaces.yaml            namespaces: mongodb · ditto · tak
  mongodb/
    05-ops-manager.yaml           MongoDBOpsManager — in-cluster EA control plane (+ app DB)
    10-mongodb-enterprise.yaml    MongoDB — EA 8.0.9-ent single-member replica set
    20-mongodbusers.yaml          MongoDBUser CRs: admin · dashboard · ditto-connector
    40-postinit-job.yaml          creates the 5 collections WITH changeStreamPreAndPostImages
  ditto/
    10-bigpeer.yaml               BigPeer — self-hosted Ditto Server (templated by setup.sh)
    20-bigpeerapp.yaml            BigPeerApp — fixed App ID so pairing survives teardown
    30-mongo-connector.yaml       BigPeerDataBridge — the MongoDB Connector
  ollama/ollama.yaml            in-cluster LLM for the AI panel (Deployment + PVC + Service)
  access/
    mongodb-nodeport.yaml         NodePort 30017 -> host :27017 (Compass / mongosh)
    opsmanager-nodeport.yaml      NodePort 30080 -> host :8080  (Ops Manager UI)
  ingress/ingress.yaml          localhost + tak.localtest.me -> frontend; backend Swagger (dev)
```

The app itself (backend + frontend) is **not** here — `setup.sh` deploys it with
the `mongodb/web-app` Helm chart using values in [`../local/`](../local), the
same chart Kanopy uses.

## Bring-up

```bash
make setup    # ./scripts/setup.sh — no cloud credentials required
make verify   # ./scripts/verify.sh — includes a MongoDB -> Ditto round-trip
```

Apply order matters and is enforced by `setup.sh`:

1. ingress-nginx, **cert-manager**, **Strimzi** — the last two are hard Ditto
   Operator prerequisites (auth certificates; the Kafka transaction log).
2. MCK operator → Ops Manager → (operator publishes an API key Secret) →
   project ConfigMap → MongoDB EA replica set → users.
3. **Post-init Job** — must succeed before the connector, which refuses to start
   unless every synced collection already has pre/post images enabled.
4. Ditto Operator → `BigPeer` → `BigPeerApp` → `BigPeerDataBridge`.
5. App images, Helm releases, ingress, NodePorts.

## Always-on host access

kind `extraPortMappings` (in `kind-cluster.yaml`) publish these to the host —
**fixed at cluster creation**, so changing them needs `make reset && make setup`:

| Host port | NodePort | Service                        | Use                                         |
| --------- | -------- | ------------------------------ | ------------------------------------------- |
| 80 / 443  | —        | ingress-nginx                  | dashboard + the Big Peer ingress            |
| 27017     | 30017    | `tak-mongodb-ext` (ns mongodb) | Compass / mongosh (`directConnection=true`) |
| 8080      | 30080    | `ops-manager-ext` (ns mongodb) | Ops Manager web UI                          |

The MongoDB and Ops Manager NodePorts are **separate** Services selecting the
operator-owned pods — we never modify the operator's own headless Services. The
MongoDB one pins to `tak-mongodb-0` for a stable single-node endpoint.

The Ditto **Operator management API is deliberately not published**: it has no
authentication. `setup.sh` reaches it over a short-lived `kubectl port-forward`
on 18081 to create the app and mint an API key.

## Key facts and gotchas

- **The Big Peer ingress host must be reachable from an Android phone.**
  `setup.sh` substitutes `__BIG_PEER_HOST__` in `ditto/10-bigpeer.yaml` with
  `ditto.<your-LAN-IP>.nip.io`, because `localhost` would resolve to the phone
  itself. Override with `BIG_PEER_HOST` in `.env`.
- **`ditto/10-bigpeer.yaml` is a template**, not directly appliable: it contains
  `__BIG_PEER_HOST__`, `__BIG_PEER_VERSION__` and `__DITTO_PLAYGROUND_TOKEN__`.
  `setup.sh` fills them via `sed` and pipes the result to `kubectl apply`.
- **`BigPeer.spec.version` is required and has no default.** Pinned to 1.63.2
  (Operator supports ≥ 1.49.0; 1.63.2 carries the connector crash-recovery fix).
  `setup.sh` fails fast on `ImagePullBackOff` and tells you to change it.
- **Strimzi 0.49.0 is the ceiling.** Newer releases (including 1.x) break the
  Big Peer controller when it applies `Kafka` resources.
- **`BigPeerDataBridge` needs both labels** — `ditto.live/app` _and_
  `ditto.live/big-peer` (mandatory since Operator 0.14.7).
- **The connector `mode` enum is `native | ejson`** (default `native`), verified
  against the CRD in the chart. Ditto's prose docs say the default is `"json"`,
  which is wrong.
- **Ops Manager is the heaviest component** (~4 GB JVM + a 3-member app DB) and
  the reason first bring-up takes ~25–35 minutes. It is also what makes this
  genuinely Enterprise Advanced: EA under MCK needs Ops Manager or Cloud
  Manager, and in-cluster OM keeps the stack self-contained.
- **Attachments are ephemeral.** `BigPeer` uses the Operator's default in-memory
  attachment backend, so ATAK photo thumbnails die with the API pod. Durable
  storage means S3/Azure (EKS/AKS).
- **Preview / version-sensitive CRDs.** The Ditto Operator is Private Preview and
  the `MongoDBOpsManager` field names track MCK ~1.8.x. If a resource is
  rejected after a version bump:
  ```bash
  kubectl explain bigpeer.spec
  kubectl explain bigpeerdatabridge.spec.bridge.mongoConnector
  kubectl explain mongodbopsmanager.spec
  ```
- **The `mongodb/web-app` chart names Services `<release>-web-app-80`** — the
  ingress and `BACKEND_URL` depend on that, and the suffix is chart-version
  dependent. Confirm with `kubectl -n tak get svc`.

## Cloud counterpart

The same images and the same `mongodb/web-app` chart deploy to Kanopy via
`.drone.yml`, with MongoDB → Atlas and the Big Peer → Ditto Cloud. That path is
**MongoDB-internal maintenance only** — see
[`../../docs/INTERNAL_DEPLOY_MAINTENANCE.md`](../../docs/INTERNAL_DEPLOY_MAINTENANCE.md).
