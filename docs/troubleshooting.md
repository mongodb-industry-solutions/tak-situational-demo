# Troubleshooting

Symptom-first. For the cloud/Kanopy deployment see
[`INTERNAL_DEPLOY_MAINTENANCE.md`](INTERNAL_DEPLOY_MAINTENANCE.md).

Start with:

```bash
make verify     # checks each layer in data-flow order; first failure localises the problem
make status     # pods/services across tak, ditto, mongodb
```

---

## Setup

### `setup.sh` hangs at "waiting for Ops Manager"

The longest step by design (10–15 min). If it stalls past ~15 minutes:

```bash
kubectl -n mongodb describe mongodbopsmanager ops-manager
kubectl -n mongodb get events --sort-by='.lastTimestamp' | tail -20
kubectl -n mongodb logs deploy/mongodb-kubernetes-operator
```

Common causes:

- **Not enough memory for Docker.** The usual one. Raise Docker Desktop's
  allocation (Settings → Resources → Memory) and re-run `make setup`.
- The Ops Manager version in `infra/k8s/mongodb/05-ops-manager.yaml` isn't
  available in the MCK image registry — try another 8.x.
- The application database is stuck — check its phase separately:
  `kubectl -n mongodb get opsmanager ops-manager -o jsonpath='{.status}'`

### `setup.sh` hangs waiting for `mongodb-ops-manager-admin-key`

The MCK operator creates this Secret once Ops Manager reaches Running. If it
never appears, the name may differ in your MCK version:

```bash
kubectl -n mongodb get secrets | grep ops-manager
```

If it's named differently, update both the poll in `scripts/setup.sh` and
`credentials:` in `infra/k8s/mongodb/10-mongodb-enterprise.yaml`.

### `setup.sh` hangs at "waiting for the replica set"

Provisioning runs through the Ops Manager automation agent:

```bash
kubectl -n mongodb describe mongodb tak-mongodb
kubectl -n mongodb logs deploy/mongodb-kubernetes-operator
# Ops Manager UI is already on the host: http://localhost:8080 -> Deployment
```

If you changed `version:`, delete and re-apply:

```bash
kubectl -n mongodb delete mongodb tak-mongodb
kubectl apply -f infra/k8s/mongodb/10-mongodb-enterprise.yaml
```

### Big Peer pods stuck in `ImagePullBackOff`

`setup.sh` fails fast on this. It means `BIG_PEER_VERSION` doesn't exist or isn't
available to your Ditto account.

```bash
kubectl -n ditto get pods -l ditto.live/big-peer=tak
kubectl -n ditto describe pod -l ditto.live/big-peer=tak | grep -A 5 Events
```

Set a different version and re-run:

```bash
echo 'BIG_PEER_VERSION=1.63.1' >> .env
make setup
```

The Operator supports Big Peer ≥ 1.49.0. If no tag works, you likely need image
pull credentials from Ditto for `quay.io/ditto-external`.

### A Ditto resource is rejected (`unknown field`, validation error)

The Ditto Operator is **Private Preview** — CRD fields move between releases.
Check the live schema and adjust the manifest:

```bash
kubectl explain bigpeer.spec
kubectl explain bigpeerdatabridge.spec.bridge.mongoConnector
```

Pin a known-good operator in `.env`: `DITTO_OPERATOR_VERSION=0.18.1`.

### Big Peer controller fails applying `Kafka` resources

Strimzi is too new. The Ditto Operator supports **0.49.0 maximum**; 1.x is not
compatible.

```bash
helm -n kafka list      # confirm the installed version
```

Fix: `STRIMZI_VERSION=0.49.0` in `.env`, then `make reset && make setup`.

### Preflight or `kind create cluster` fails on a port

kind publishes 80, 443, 27017 and 8080, and a conflict on any one of them stops
the node container from starting. `preflight.sh` names the process holding the
port; to check by hand:

```bash
for p in 80 443 27017 8080; do sudo lsof -iTCP:$p -P -sTCP:LISTEN; done
```

A local `mongod` on 27017 is a common one.

Stop it, or edit `infra/k8s/kind-cluster.yaml`. Port mappings are fixed at
creation, so changing them needs `make reset && make setup`.

---

## Sync

### No documents reaching MongoDB from devices

Work outwards from the device:

1. **Plugin connected?** The Ditto plugin should show connected in ATAK, with
   GPS active.
2. **Pointing at your Big Peer?** The most common mistake: the plugin still
   syncing to Ditto Cloud. It needs the custom auth URL, the websocket URL
   **and** "sync to Ditto Cloud" switched **off**.
3. **Big Peer reachable from the phone?**
   ```bash
   curl -sI "http://$(kubectl -n ditto get ingress -o jsonpath='{.items[0].spec.rules[0].host}')" | head -1
   ```
   Phone on the same Wi-Fi (not cellular)? Router client-isolation off?
4. **Connector running?**
   ```bash
   kubectl -n ditto get bigpeerdatabridge tak-mongo-connector
   kubectl -n ditto logs -l ditto.live/app=tak-situational
   ```

### Connector won't start: "must be configured with changeStreamPreAndPostImages enabled"

The connector refuses to run unless every synced collection has pre/post images.
Re-run the post-init Job:

```bash
kubectl -n mongodb delete job tak-mongodb-postinit
kubectl apply -f infra/k8s/mongodb/40-postinit-job.yaml
kubectl -n mongodb logs -f job/tak-mongodb-postinit
```

To check or fix by hand:

```js
db.getCollectionInfos({ name: "track" }); // look for options.changeStreamPreAndPostImages.enabled
db.runCommand({
  collMod: "track",
  changeStreamPreAndPostImages: { enabled: true },
});
```

**If you add a collection to the data bridge, add it to the post-init Job too.**
The connector will not start otherwise.

### Connector reports Running but nothing syncs

Documented Ditto behaviour: the change-stream listener can hang after
infrastructure changes (pod restarts, certificate rotation, a MongoDB resize)
while still passing health checks.

```bash
kubectl -n ditto delete pod -l ditto.live/app=tak-situational   # it is recreated
```

No data is lost — the connector resumes from its last recorded change-stream
position. In Ditto Cloud this requires a support request; self-hosted you can
just restart the pod.

### Dashboard writes don't reach devices

Check `__ditto_unsynced_documents` — the connector parks documents it couldn't
write:

```js
use tak_demo
db.__ditto_unsynced_documents.find().limit(5)
```

Anything in there means sync is dropping data silently. The usual cause is a
schema validator rejecting `null` on a field Ditto hasn't populated yet; define
validators permissively (`bsonType: ["string", "null"]`). `verify.sh` warns when
this collection is non-empty.

### Deleted markers reappear, or deletes don't propagate

Expected, and why the code tombstones instead of deleting. Ditto treats a
MongoDB delete as final — it wins over concurrent edits and over later
recreation on a device. Use the dashboard's delete (which tombstones with
`_r: true` and bumps the version); don't `deleteOne()` by hand and expect it to
reach the devices.

---

## Dashboard

### Map renders but has no markers

```bash
curl -s http://localhost/api/tracks | head -c 300
```

- `[]` → nothing in `track` yet; see "No documents reaching MongoDB".
- Documents exist but nothing on the map → check they have `_r: false` and
  non-null `j`/`l`.
- All markers grey with `⚠ STALE` → **normal.** `Date.now() > doc.o`; the last
  known position is shown deliberately.

### Map tiles are blank

With no `CARTO_API_KEY` the map falls back to OpenStreetMap, which needs
outbound internet. Fully offline, tiles won't load — markers and all other
panels still work. `/api/maptiles/config` returning `{"key":null}` is correct,
not an error.

### Backend `CrashLoopBackOff`

```bash
kubectl -n tak logs deploy/tak-situational-demo-backend-web-app --previous
```

Usually a missing Secret. Both of these must exist:

```bash
kubectl -n tak get secret tak-mongodb-uri tak-ditto
```

If either is absent, `setup.sh` didn't reach the "connection-string Secrets"
step — re-run `make setup`.

### Dashboard loads but every `/api/*` call fails

`BACKEND_URL` isn't resolving. The chart names Services
`<release>-web-app-80`:

```bash
kubectl -n tak get svc
kubectl -n tak exec deploy/tak-situational-demo-frontend-web-app -- \
  wget -qO- http://tak-situational-demo-backend-web-app-80/api/health
```

If the Service name differs, update `BACKEND_URL` in
`infra/local/frontend.yaml`.

### Ingress returns 404 for everything

```bash
kubectl -n ingress-nginx rollout status deploy/ingress-nginx-controller
kubectl -n tak get ingress
kubectl apply -f infra/k8s/ingress/ingress.yaml
```

### Photo thumbnails 503

Expected in two cases: no Big Peer API key was minted, or the attachment was
lost to the in-memory backend after a pod restart.

```bash
kubectl -n tak get secret tak-ditto -o jsonpath='{.data.DITTO_API_KEY}' | openssl base64 -d -A; echo
```

If it prints `unset`, mint one by hand — the Operator API is unauthenticated, so
reach it only over a port-forward:

```bash
kubectl -n ditto port-forward deployment/ditto-operator 18081:8080 &
curl -H 'Content-Type: application/json' \
  -X POST http://localhost:18081/namespace/ditto/bigPeer/tak/app/tak-situational/apiKey \
  -d '{"name":"tak-dashboard-2","expiresAt":"2100-01-01T00:00:00Z",
       "permissions":{"remoteQuery":true,
         "read":{"everything":true,"queriesByCollection":{}},
         "write":{"everything":true,"queriesByCollection":{}}}}'
```

The raw key is returned **once**. Store it and restart the backend:

```bash
kubectl -n tak patch secret tak-ditto \
  -p "{\"stringData\":{\"DITTO_API_KEY\":\"<key>\"}}"
kubectl -n tak rollout restart deploy/tak-situational-demo-backend-web-app
```

### AI panel missing

By design when no LLM backend is configured. Check what the backend reports:

```bash
curl -s http://localhost/api/systemai/status
```

- `{"enabled": false, ...}` → neither `OLLAMA_BASE_URL` nor `LLM_API_KEY` is set
  (e.g. you ran with `OLLAMA_SKIP=1`).
- `{"enabled": true, "ready": false}` → the model is still downloading:
  ```bash
  tail -f /tmp/tak-ollama-pull.log
  kubectl -n tak exec deploy/ollama -- ollama list
  ```

### AI answers are slow or time out

CPU-only inference (Docker Desktop has no GPU passthrough). The first question
after a restart also pays the model load. If it's unusable, pick a smaller model:

```bash
echo 'OLLAMA_MODEL=qwen2.5:3b' >> .env
make setup
```

`setup.sh` pulls the model and passes it to the backend as `LLM_MODEL`, so
nothing else needs editing. Note smaller models are noticeably worse at tool calling, which
this agent depends on entirely.

### Ollama pod `CrashLoopBackOff` / OOM

Not enough memory. Raise Docker Desktop's allocation, or skip the AI panel:

```bash
OLLAMA_SKIP=1 make setup
```

---

## Reference

### Where things live

|                   |                                                              |
| ----------------- | ------------------------------------------------------------ |
| `mongodb` ns      | MCK operator, Ops Manager (+ app DB), MongoDB EA replica set |
| `ditto` ns        | Ditto Operator, Big Peer (store/subscription/api), connector |
| `tak` ns          | backend, frontend, Ollama                                    |
| `kafka` ns        | Strimzi operator                                             |
| `cert-manager` ns | cert-manager                                                 |

### Secrets `setup.sh` generates

| Secret                     | Namespace | Holds                                   |
| -------------------------- | --------- | --------------------------------------- |
| `ops-manager-admin-secret` | mongodb   | Ops Manager admin login                 |
| `mongodb-*-password`       | mongodb   | SCRAM seeds for the MongoDBUser CRs     |
| `tak-mongodb-tak-*-admin`  | mongodb   | **operator-published** real credentials |
| `tak-mongodb-uri`          | tak       | `MONGODB_URI` for the backend           |
| `tak-mongo-connector`      | ditto     | connection string for the data bridge   |
| `tak-playground-token`     | ditto     | stable Ditto shared token               |
| `tak-ditto`                | tak       | Big Peer URL, API key, pairing values   |

Read the passwords the operator actually set (`tak-mongodb-tak-*-admin`), never
the `mongodb-*-password` seeds.

### Full reset

```bash
make reset && make setup     # ~25-35 min
make soft-reset && make setup  # keeps Ops Manager — minutes
```
