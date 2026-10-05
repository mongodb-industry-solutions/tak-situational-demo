# Cloud deployment — Kanopy (MongoDB internal)

Reference for deploying and maintaining the hosted instance on the Industry
Solutions Kanopy cluster. **Not intended for demo participants or external
users** — it depends on MongoDB-internal infrastructure that cannot be
provisioned from outside the company:

- **Kanopy** (internal Kubernetes platform) and **Drone CI**
- **MongoDB Atlas** + a **Ditto Cloud** Big Peer with the MongoDB Connector
- the internal **LLM gateway** for the AI panel
- a private **S3** object holding the Ditto mesh-join QR
- **Genymotion PaaS** instances for the Simulate view

If you just want to run the demo, use the self-hosted path instead —
[`RUN_LOCAL.md`](RUN_LOCAL.md) — which needs no accounts at all.

---

## Overview

One `mongodb/web-app` (chart **4.30.0**) Helm release deploying a **single pod
with two containers**: the Next.js frontend plus the FastAPI backend as a
sidecar. They talk over `localhost`, which is why `BACKEND_URL` is
`http://localhost:8000` here but a Service DNS name locally.

|           |                                                                  |
| --------- | ---------------------------------------------------------------- |
| Release   | `tak-situational-demo`                                           |
| Namespace | `industrysolutions`                                              |
| Images    | ECR `industrysolutions/tak-situational-demo-{backend,frontend}`  |
| Chart     | `mongodb/web-app` 4.30.0 (`https://10gen.github.io/helm-charts`) |

### Environments

| Branch    | Drone pipeline          | Kanopy API server              | Values                        |
| --------- | ----------------------- | ------------------------------ | ----------------------------- |
| `staging` | `staging-combined`      | `api.staging.corp.mongodb.com` | `environment/staging.yaml`    |
| `main`    | — (**no pipeline yet**) | `api.prod.corp.mongodb.com`    | `environment/production.yaml` |

> `production.yaml` exists but **no Drone pipeline references it** — production
> is not continuously deployed today. Deploy it by hand, or add a pipeline
> mirroring the staging one.

Staging URL: `https://tak-situational-demo.industrysolutions.staging.corp.mongodb.com`

---

## How deployment works

On every push to `staging`, Drone (`.drone.yml`):

1. `publish-backend` — kaniko build of `Dockerfile.backend` → ECR, tagged
   `git-<sha7>` and `latest`
2. `publish-frontend` — same for `Dockerfile.frontend`
3. `deploy-combined-staging` — `helm upgrade --install` with
   `environment/staging.yaml`, overriding the image tags, ingress host,
   `mesh.enabled=true`, and resource requests/limits for both containers

No manual `helm` commands needed for a normal change.

---

## First-time setup (per environment)

### 1. Atlas cluster

- M10+ (change streams are required by the Ditto connector; the connector needs
  MongoDB ≥ 7.0.13 / 8.0.0).
- Database: `tak_demo` (whatever you set as `DATABASE_NAME`).
- Two users, least privilege:

  | User              | Role                        | Used by                                              |
  | ----------------- | --------------------------- | ---------------------------------------------------- |
  | `ditto-connector` | `readWrite` on the database | the Ditto MongoDB Connector                          |
  | `dashboard`       | `readWrite` on the database | this app (it writes command actions and AI sessions) |

  > The old `dashboard-reader` / `read`-only user is **not sufficient**: the
  > backend writes chat messages, map markers, file tombstones and
  > `ai_sessions`.

- **Collections must exist with `changeStreamPreAndPostImages` enabled before
  the connector will start:**

  ```js
  use tak_demo
  ["track","mapitem","chat","file","alert"].forEach(n =>
    db.createCollection(n, { changeStreamPreAndPostImages: { enabled: true } }));
  // already exists?
  db.runCommand({ collMod: "track", changeStreamPreAndPostImages: { enabled: true } })
  ```

- **Network Access:** allowlist the three Ditto Big Peer egress IPs (shown in
  the Ditto Portal under Settings → MongoDB Connector) **and** the Kanopy egress
  range.

### 2. Ditto Cloud Big Peer + MongoDB Connector

Managed through the [Ditto Portal](https://portal.ditto.live) — the cloud
connector is **not** declarative (unlike the self-hosted `BigPeerDataBridge`).

1. Create an Organization and an Application; note the **App ID** and **App
   Token** (these go into the mesh-join QR, step 4).
2. Settings → **MongoDB Connector** → Configure:
   - connection string, SRV form only:
     `mongodb+srv://ditto-connector:<pw>@<cluster>.mongodb.net/`
   - database: `tak_demo`
   - collections: `track`, `mapitem`, `chat`, `file`, `alert`
   - ID mapping: **Match IDs** (every ATAK `_id` is a plain string)
   - enable **Initial Sync** per collection if you want pre-existing documents
     pulled into Ditto
3. Save, confirm the status goes `Pending` → `Running`.

> Access to the connector UI is gated — your Ditto org has to be enrolled.
> **Request it well in advance of a demo**, it is not self-serve on all tiers.
>
> Reconfiguring a running connector is supported now (add/remove collections,
> change ID mapping or credentials) via **Edit** in the Portal.

### 3. Android devices

Identical to the local path except the devices point at Ditto Cloud instead of
your Big Peer, so cloud sync stays **on**. See
[`RUN_LOCAL.md`](RUN_LOCAL.md#pairing-an-atak-device) for ATAK CIV install, the
plugin APK, and permissions.

### 4. Mesh-join QR in S3

The QR encodes a real Ditto Cloud credential, so it is **never committed**. Upload
it to the shared bucket and let the backend stream it via `/api/ditto/qr`:

```
s3://industry-solutions-demos/industry/mobile/ditto_identity_qr.png
```

The IRSA role (`kanopy-staging-cicd-irsa` / `kanopy-prod-cicd-irsa`, account
`275662791714`) needs `s3:GetObject` on
`arn:aws:s3:::industry-solutions-demos/industry/mobile/*`.

> Self-hosted runs don't need this at all — the backend generates the QR
> in-process from the Big Peer values. The S3 path is only taken when
> `DITTO_APP_ID`/`DITTO_PLAYGROUND_TOKEN` are unset.

### 5. LLM gateway (AI panel)

The AI panel uses MongoDB's internal Anthropic-compatible gateway:
`LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`. Authentication is an `api-key`
header, not Anthropic's native scheme — `routers/systemai.py` handles that.

Leave `LLM_PROVIDER` unset: with `LLM_API_KEY` present and no
`OLLAMA_BASE_URL`, the backend auto-selects the `anthropic` path. (Local uses
in-cluster Ollama instead.)

### 6. Kubernetes secret

Helm only _references_ the secret, it never creates it. Create it once per
cluster **before** the first Drone deploy or the pod crash-loops:

```bash
helm ksec set tak-situational-demo \
  MONGODB_URI="mongodb+srv://dashboard:<pw>@<cluster>.mongodb.net/" \
  DATABASE_NAME="tak_demo" \
  DITTO_URL_EP="<big-peer-host>" \
  DITTO_API_KEY="<ditto-api-key>" \
  LLM_API_KEY="<gateway-key>" \
  LLM_BASE_URL="<gateway-base-url>" \
  LLM_MODEL="claude-opus-4-7" \
  CARTO_API_KEY="<carto-key>" \
  GENYMOTION_PAAS_HOST_ALPHA="<host>" \
  GENYMOTION_PAAS_TOKEN_ALPHA="<instance-id>"
```

Verify: `helm ksec list tak-situational-demo`

> **`DITTO_URL_EP` format.** Cloud takes a **bare hostname** (no scheme, no
> path) — the backend assumes HTTPS and the non-app-scoped attachment route.
> Self-hosted passes a full URL including the App ID path segment. See
> `_ditto_api_base()` in `backend/routers/files.py`.

### 7. Drone secrets

At drone.corp.mongodb.com, on the repo:

| Secret                     | Value                                                         |
| -------------------------- | ------------------------------------------------------------- |
| `ecr_access_key`           | AWS key with ECR push rights                                  |
| `ecr_secret_key`           | matching secret                                               |
| `staging_kubernetes_token` | Kanopy staging service-account token                          |
| `prod_kubernetes_token`    | Kanopy production token (unused until a prod pipeline exists) |

### 8. Trigger the first deploy

Push to `staging`.

---

## Configuration reference

### Frontend container

| Key             | Value                    | Notes                                                                                       |
| --------------- | ------------------------ | ------------------------------------------------------------------------------------------- |
| `BACKEND_URL`   | `http://localhost:8000`  | Same pod as the backend sidecar                                                             |
| `NODE_ENV`      | `staging` / `production` |                                                                                             |
| `CARTO_API_KEY` | from secret              | Served to the browser at runtime by `/api/maptiles/config`. Unset ⇒ OpenStreetMap fallback. |

### Backend sidecar

| Key                                          | Source       | Notes                                                                    |
| -------------------------------------------- | ------------ | ------------------------------------------------------------------------ |
| `MONGODB_URI`, `DATABASE_NAME`               | secret       | Atlas                                                                    |
| `DITTO_URL_EP`, `DITTO_API_KEY`              | secret       | Big Peer attachment proxy                                                |
| `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`   | secret       | AI panel                                                                 |
| `S3_ASSET_BUCKET` / `_KEY` / `_REGION`       | plain values | Mesh-join QR; creds via IRSA                                             |
| `GENYMOTION_PAAS_{HOST,TOKEN}_{ALPHA,BRAVO}` | secret       | BRAVO marked `optional: true`                                            |
| `ENABLE_SIMULATE`                            | `"true"`     | Shows the Simulate view. Reported to the browser by `GET /api/features`. |

### Kanopy metadata

`serviceAccount.irsa` (account `275662791714`), `security.dataClassification:
Internal`, `dataDesignation: [MI]`, `ownership.driEmail`.

---

## Maintenance

### Updating the app

Push to `staging`. Drone builds and deploys.

### Rotating Atlas credentials

1. Change the password in Atlas.
2. `helm ksec set tak-situational-demo MONGODB_URI="…"`
3. `kubectl -n industrysolutions rollout restart deploy/tak-situational-demo-web-app`
4. If the `ditto-connector` user changed, update the connection string in the
   Ditto Portal too (connector credential rotation is live — no documents are
   missed).

### Known limitations

- **No production pipeline.** Only `staging` auto-deploys.
- **Connector config is not in version control.** The cloud connector lives in
  the Ditto Portal, so it can drift from
  `infra/k8s/ditto/30-mongo-connector.yaml` (which describes the self-hosted
  equivalent). Keep them conceptually in step.
- **Atlas allowlist is a recurring chore.** The cloud connector reaches Atlas
  over the public internet from fixed Ditto egress IPs. The self-hosted path
  avoids this entirely.
- **Connector can wedge silently.** It may report `Running` while the change
  stream has stopped (after a pod restart, cert rotation or an Atlas resize).
  Cloud needs a Ditto support request to restart the pod; self-hosted you can
  delete it yourself. Monitor change-stream event rates and the
  `__ditto_unsynced_documents` collection.
- **Genymotion is parked.** The Simulate view's EC2 instances are stopped and the
  subscription was being cancelled, so `/simulate` will not stream a device even
  with `ENABLE_SIMULATE=true`. Treat it as paused work, not a feature.

---

## Troubleshooting (cloud-specific)

### Pod `CrashLoopBackOff`

```bash
kubectl -n industrysolutions logs deploy/tak-situational-demo-web-app -c backend --previous
```

Usually: the `tak-situational-demo` secret is missing or a key is misnamed; the
Atlas SRV string has an unencoded special character in the password; or the
Kanopy egress range isn't allowlisted in Atlas.

### Drone deploy fails with "release not found"

Stale Kanopy token — regenerate and update the Drone secret.

### Dashboard loads, no data

1. Ditto Portal → connector status `Running`?
2. Atlas → does `track` have recent documents with `_r: false`?
3. `curl <url>/api/tracks` — empty array means the problem is upstream of the app.
4. Ditto Portal → Data Browser — if documents are in Ditto but not Atlas, the
   connector is the broken link.

### Deleted markers come back

Expected. Ditto treats MongoDB deletes as final and the plugin uses soft deletes
— always tombstone (`_r: true`) rather than removing documents. See
[`architecture.md`](architecture.md#soft-deletes-everywhere).
