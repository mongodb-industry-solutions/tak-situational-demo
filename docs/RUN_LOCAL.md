# Running the demo locally

The whole stack runs in a **kind** (Kubernetes-in-Docker) cluster on your
machine. **No external accounts are required** — not MongoDB Atlas, not Ditto
Cloud, not AWS:

- **MongoDB Enterprise Advanced** is provisioned by the MongoDB Kubernetes
  operator (MCK) through a **self-hosted Ops Manager** running in the same
  cluster.
- The **Ditto Big Peer** is provisioned by the **Ditto Operator**, with the
  **MongoDB Connector** declared as a Kubernetes resource.

After the images are pulled, the only thing that leaves your machine is
OpenStreetMap basemap tiles.

---

## Prerequisites

### Tools

| Tool                            | Install                                          |
| ------------------------------- | ------------------------------------------------ |
| Docker Desktop ≥ 24 (or Engine) | <https://docs.docker.com/get-docker/>            |
| `kind`                          | `brew install kind` · <https://kind.sigs.k8s.io> |
| `kubectl`                       | `brew install kubectl`                           |
| `helm`                          | `brew install helm`                              |
| `openssl`, `curl`, `python3`    | ship with macOS                                  |

### Hardware

- **32 GB RAM recommended.** The budget: Ops Manager (~4 GB) + its 3-member
  application database + the MCK operator + the Enterprise `mongod` + Kafka
  (Strimzi, backing the Big Peer transaction log) + three Big Peer components +
  Ollama (up to 8 GB) + backend + frontend. 24 GB works if you close other
  things; 16 GB will OOM-kill pods.
  - Tight on memory? `OLLAMA_SKIP=1 make setup` drops the AI panel and frees
    ~8 GB. Everything else still works.
- **~30 GB free disk** for images and volumes (the Ops Manager image is large,
  and the LLM is ~4.7 GB).
- Give Docker Desktop a generous memory allocation:
  **Settings → Resources → Memory**.

### Host ports

kind publishes these, fixed at cluster creation:

| Host port | Goes to              | Used for                                |
| --------- | -------------------- | --------------------------------------- |
| 80, 443   | ingress-nginx        | the dashboard, and the Big Peer ingress |
| 27017     | MongoDB NodePort     | Compass / `mongosh`                     |
| 8080      | Ops Manager NodePort | Ops Manager web UI                      |

**80 and 443 must be free** before the cluster is created or creation fails:

```bash
sudo lsof -iTCP:80  -P -sTCP:LISTEN
sudo lsof -iTCP:443 -P -sTCP:LISTEN
```

Usual culprits: a local nginx/Apache/Caddy, or another container bound to `:80`.
Outbound UDP/443 from browsers, Slack or Cloudflare WARP shows up in `lsof` but
does **not** bind the local port — harmless. (`preflight.sh` filters correctly;
use the same flags if checking by hand.)

If 27017 or 8080 are taken, the cluster still comes up — you just lose that one
host mapping. Free the port or edit `infra/k8s/kind-cluster.yaml`, then
`make reset && make setup`.

---

## First run

### 1. (Optional) create a `.env`

Not required — every value has a working default and no credentials are needed.

```bash
cp .env.example .env
```

The two worth knowing about:

- **`BIG_PEER_HOST`** — the hostname ATAK devices use to reach the Big Peer.
  Left unset, `setup.sh` derives it from your LAN IP via `nip.io`
  (e.g. `ditto.192.168.1.23.nip.io`). Set it explicitly if auto-detection picks
  the wrong interface (VPN, Docker bridge, several NICs).
- **`BIG_PEER_VERSION`** — the Big Peer release (default `1.63.2`). If that tag
  isn't available to your Ditto account, `setup.sh` fails fast with a clear
  message; set another version here and re-run.

### 2. Run setup

```bash
make setup      # or ./scripts/setup.sh
```

**Idempotent** — re-running after a partial failure resumes. Secrets and tokens
are never rotated on a re-run, so a paired device stays paired.

| Step                  | What happens                                        | Typical wait   |
| --------------------- | --------------------------------------------------- | -------------- |
| Preflight             | Tools, ports, RAM, disk, LAN IP                     | instant        |
| kind cluster          | One control-plane node + host port mappings         | ~30 s          |
| ingress-nginx         | kind-flavoured ingress controller                   | ~60 s          |
| cert-manager          | Ditto Operator prerequisite (issues auth certs)     | ~60 s          |
| Strimzi               | Kafka operator — backs the Big Peer transaction log | ~60 s          |
| MCK operator          | MongoDB Kubernetes operator, via Helm               | ~60 s          |
| Ops Manager secret    | Random admin password, complexity-compliant         | instant        |
| **Ops Manager**       | Provisions OM + its application DB in-cluster       | **~10–15 min** |
| OM API key            | Operator publishes it once OM is Running            | ~30 s          |
| OM project ConfigMap  | Reads the orgId from the OM API                     | instant        |
| MongoDB passwords     | Random SCRAM passwords as Secrets                   | instant        |
| **MongoDB EA RS**     | Ops Manager provisions the replica set              | **~5–10 min**  |
| Post-init Job         | Creates the 5 collections **with pre/post images**  | ~30 s          |
| Connection secrets    | Builds URIs from operator-published passwords       | instant        |
| Ditto Operator        | Helm chart from `oci://quay.io/ditto-external`      | ~60 s          |
| Playground token      | Stable shared token (reused across re-runs)         | instant        |
| **Big Peer**          | Store + subscription + API + Kafka topic            | **~3–6 min**   |
| Ditto App             | `BigPeerApp` with a fixed App ID                    | instant        |
| **MongoDB Connector** | `BigPeerDataBridge` — starts syncing                | ~1–2 min       |
| Big Peer API key      | Minted via the Operator API, then persisted         | ~15 s          |
| Ollama                | Deployment + PVC + Service                          | ~60 s          |
| Docker builds         | Backend + frontend images, loaded into kind         | ~2–4 min       |
| Helm releases         | Backend + frontend via `mongodb/web-app`            | ~60 s          |
| Model pull (bg)       | `qwen2.5:7b` → `/tmp/tak-ollama-pull.log`           | ~5–10 min      |

Total: **~25–35 minutes** on a first run; Ops Manager dominates.

### 3. Smoke test

```bash
make verify
```

Checks each layer in the order data actually flows, so the first failure tells
you where the pipeline broke: workloads → MongoDB EA (including that all five
collections really have `changeStreamPreAndPostImages` enabled) → Big Peer →
connector → HTTP surface → **a live MongoDB → Ditto round-trip** (writes a probe
document into MongoDB and reads it back through the Big Peer HTTP API with DQL,
then cleans up) → the AI panel.

Optional pieces (the Ollama model, attachments) report `WARN`, not failure.

### 4. Open the dashboard

```
http://localhost
```

| URL                                | What                                         |
| ---------------------------------- | -------------------------------------------- |
| <http://localhost>                 | The dashboard                                |
| <http://tak.localtest.me>          | Same app — alias for curl/devtools           |
| <http://localhost/api/health>      | Backend health, through the frontend proxy   |
| <http://localhost:8080>            | Ops Manager UI (login printed by `setup.sh`) |
| <http://backend.localtest.me/docs> | FastAPI Swagger — **local dev only**         |

`*.localtest.me` resolves to `127.0.0.1` via public DNS, so no `/etc/hosts`
edits. The backend has **no** production ingress — the browser reaches it only
through the frontend's same-origin `/api/*` proxy; the Swagger route is local
convenience with no cloud equivalent.

### 5. Connect to MongoDB and Ops Manager

Both are on host ports already — no `kubectl port-forward`. `setup.sh` prints
these with live credentials; to rebuild them yourself:

**MongoDB (Compass / mongosh)** — `directConnection=true` is required, because
the replica-set member advertises an in-cluster DNS name your laptop can't
resolve:

```bash
ADMIN_PW=$(kubectl -n mongodb get secret tak-mongodb-tak-admin-admin \
  -o jsonpath='{.data.password}' | base64 -d)
echo "mongodb://admin:${ADMIN_PW}@localhost:27017/?authSource=admin&directConnection=true"
# data lives in db `tak_demo`: track · mapitem · chat · file · alert
```

**Ops Manager** — <http://localhost:8080>:

```bash
kubectl -n mongodb get secret ops-manager-admin-secret -o jsonpath='{.data.Username}' | base64 -d; echo
kubectl -n mongodb get secret ops-manager-admin-secret -o jsonpath='{.data.Password}' | base64 -d; echo
```

Worth opening at least once: it is the same control plane a customer running EA
on-prem uses, showing the automation agent and deployment topology.

---

## Pairing an ATAK device

> ⚠️ **Not yet verified end to end.** The Big Peer, the App and the connector
> are all confirmed working, and the dashboard produces the identity values. What
> has **not** been confirmed on a physical device is the exact payload the ATAK
> Ditto Edge Sync plugin expects from a scanned QR code. Treat the QR as
> best-effort and the typed values as the dependable path. Please update this
> section once validated on hardware.

### What you need

- At least two **physical** Android devices running **Android 13 or later** with
  at least 4 GB of RAM (the mesh uses BLE / Wi-Fi Direct; emulators can't do
  that — which is what the paused Genymotion work was about).
- **ATAK CIV** — free from [tak.gov](https://tak.gov), or Google Play. Open it
  once and grant **all** permissions, especially location. Don't rush this.
- The **Ditto ATAK Plugin** APK. Not publicly downloadable — ask Ditto, or the
  MongoDB Industry Solutions team. Sideload it, then restart ATAK so the plugin
  appears under Tools.
- The device must be on **the same Wi-Fi as this machine**.

### Pair

1. In the dashboard, click **Add Device** (top right). You'll see a QR plus,
   when running self-hosted, the four values in copyable form.
2. Or print them any time:

   ```bash
   make pair
   ```

   ```
   App ID:           7a9f1c4e-2b6d-4f83-9c15-8e0d3a5b7f42
   Auth URL:         http://ditto.192.168.1.23.nip.io
   Websocket URL:    ws://ditto.192.168.1.23.nip.io
   Playground token: <generated>
   ```

3. In ATAK → the **Ditto** plugin → scan the QR, or enter the values manually.
4. **Disable "sync to Ditto Cloud" in the plugin.** This matters: a Small Peer
   using an `OnlinePlayground` identity targets Ditto Cloud by _default_. It
   needs the custom auth URL, the websocket URL **and** cloud sync off before it
   will talk to your Big Peer.
5. Move around outdoors with GPS active. `track` documents should appear in
   MongoDB within seconds, and markers on the map.

### Why `nip.io`

The Big Peer ingress host has to resolve to **this machine from the phone**, so
`localhost` is useless — the phone would resolve it to itself. `nip.io` is
wildcard DNS that maps any embedded IP back to itself
(`ditto.192.168.1.23.nip.io` → `192.168.1.23`), which gets us a working hostname
with no DNS server and no `/etc/hosts` edit on the device. If your LAN IP
changes (new network, DHCP lease), re-run `make setup` to regenerate the ingress
and the pairing values.

### If a device can't connect

```bash
# Is the Big Peer ingress answering on the LAN address?
curl -sI "http://$(kubectl -n ditto get ingress -o jsonpath='{.items[0].spec.rules[0].host}')" | head -1
```

Then check: phone on the same Wi-Fi (not cellular), client isolation / "guest
network" off on the router, and the macOS firewall not blocking Docker.

---

## Day-2 operations

### Useful commands

```bash
make status        # pods/services across tak, ditto and mongodb
make logs          # backend + frontend
make logs-ditto    # Big Peer + MongoDB Connector
make logs-mongodb  # MCK operator — EA provisioning problems show up here
make verify        # re-run the smoke test
make pair          # reprint ATAK pairing values
```

### After a code change

```bash
make rebuild
```

Rebuilds both images, loads them into kind, and restarts the deployments —
seconds, versus a full `make setup`.

### Inspecting the Ditto layer

```bash
kubectl -n ditto get bigpeer,bigpeerapp,bigpeerdatabridge
kubectl -n ditto describe bigpeer tak
kubectl -n ditto describe bigpeerdatabridge tak-mongo-connector
kubectl -n ditto logs -l ditto.live/app=tak-situational    # connector logs
```

### Inspecting MongoDB provisioning

```bash
kubectl -n mongodb describe mongodbopsmanager ops-manager
kubectl -n mongodb describe mongodb tak-mongodb
kubectl -n mongodb logs deploy/mongodb-kubernetes-operator
```

### Tearing down

```bash
make soft-reset   # keep Ops Manager + EA; rebuild Ditto + app + drop the DB
make reset        # delete the kind cluster and everything in it
```

Use `soft-reset` while iterating — it avoids the ~25 minute Ops Manager rebuild.
Both regenerate the playground token, so a paired device must be re-paired.

---

## Caveats

### Ops Manager is the slow, heavy part

A ~4 GB JVM plus its own 3-member database, and 10–15 minutes to provision. It
is also what makes this genuinely **Enterprise Advanced** rather than Community:
EA under MCK needs an external management resource (Ops Manager or Cloud
Manager), and running it in-cluster keeps the whole thing self-contained.

### The Ditto Operator is Private Preview

CRD fields can move between releases. The manifests are pinned to Operator
`0.18.1` and Big Peer `1.63.2`. If a resource is rejected after a version bump,
check the live schema:

```bash
kubectl explain bigpeer.spec
kubectl explain bigpeerdatabridge.spec
```

### Photo attachments are ephemeral

The Big Peer's default attachment backend is **in-memory**, so ATAK photo
thumbnails are lost when the API pod restarts. Durable storage means S3 or Azure
Blob, which assumes EKS/AKS — out of scope locally. Metadata in the `file`
collection persists either way; only the binaries are affected.

### The AI panel is CPU-only

Docker Desktop on macOS gives containers no Metal/GPU passthrough, so Ollama
runs on CPU — expect several seconds per answer, and a slow first answer while
the model loads into memory. The panel hides itself until the model has
downloaded, and the rest of the dashboard never waits on it.

### `changeStreamPreAndPostImages` is mandatory

The Ditto connector refuses to start unless **every** synced collection already
exists with pre/post images enabled — it needs them to keep the two systems
causally consistent. `infra/k8s/mongodb/40-postinit-job.yaml` handles this, and
`verify.sh` asserts it. If you add a collection to the data bridge, add it to
the post-init Job too.

### Deletes are one-way

Ditto treats a delete arriving from MongoDB as final — it wins even if the
document is later recreated on a device. The ATAK schema therefore uses a
soft-delete flag (`_r`), and the dashboard tombstones rather than hard-deletes.
Always filter `{ _r: false }`.

---

## Troubleshooting

See **[`troubleshooting.md`](troubleshooting.md)** for symptom-first fixes.
