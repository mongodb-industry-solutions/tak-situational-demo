#!/usr/bin/env bash
# One-shot local bring-up of the fully self-hosted TAK situational demo:
#
#   ingress-nginx + cert-manager + Strimzi (Kafka)
#   + MCK operator -> self-hosted Ops Manager -> MongoDB Enterprise Advanced RS
#   + Ditto Operator -> Big Peer -> App -> MongoDB Connector data bridge
#   + Ollama (LLM for the AI panel)
#   + backend & frontend (mongodb/web-app chart, same as Kanopy)
#
# No MongoDB Atlas account. No Ditto Cloud account. No AWS. Everything runs in
# one kind cluster on this machine.
#
# Idempotent: re-running after a partial failure resumes — existing resources
# are reused and secrets/tokens are never rotated, so a paired ATAK device stays
# paired across re-runs.
#
# Finishes by printing ready-to-use access details: the dashboard URL, a Compass
# connection string, the Ops Manager login, and the ATAK pairing values.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# shellcheck source=scripts/lib.sh
. "$ROOT/scripts/lib.sh"

# Load .env if present (optional overrides — no credentials required).
if [ -f .env ]; then
  # shellcheck disable=SC1091
  set -a; . ./.env; set +a
fi

# ---- configuration (override via .env or the environment) -----------------
CLUSTER="${KIND_CLUSTER:-tak-situational-demo}"
NS_DB="mongodb"                  # MCK operator + Ops Manager + MongoDB EA
NS_DITTO="ditto"                 # Ditto Operator + Big Peer + connector
NS_APP="tak"                     # backend / frontend / Ollama

MCK_VERSION="${MCK_VERSION:-1.8.1}"
WEBAPP_CHART_VERSION="${WEBAPP_CHART_VERSION:-4.30.0}"
INGRESS_NGINX_REF="${INGRESS_NGINX_REF:-controller-v1.11.3}"
CERT_MANAGER_VERSION="${CERT_MANAGER_VERSION:-v1.16.2}"
# Strimzi 0.49.0 is the newest version the Ditto Operator supports; 1.x breaks
# the Big Peer controller when it applies Kafka resources.
STRIMZI_VERSION="${STRIMZI_VERSION:-0.49.0}"
DITTO_OPERATOR_VERSION="${DITTO_OPERATOR_VERSION:-0.18.1}"
# Big Peer release. Operator supports >= 1.49.0; >= 1.63.2 carries the connector
# crash-recovery fix. Bump here if this tag isn't available to you.
BIG_PEER_VERSION="${BIG_PEER_VERSION:-1.63.2}"

OM_ADMIN_USER="${OM_ADMIN_USER:-admin@tak-demo.local}"
DB_NAME="${DATABASE_NAME:-tak_demo}"

# Must match infra/k8s/ditto/20-bigpeerapp.yaml.
DITTO_APP_ID="${DITTO_APP_ID:-7a9f1c4e-2b6d-4f83-9c15-8e0d3a5b7f42}"
DITTO_APP_NAME="tak-situational"
BIG_PEER_NAME="tak"

OLLAMA_MODEL="${OLLAMA_MODEL:-qwen2.5:7b}"

# Host ports published by kind — must match infra/k8s/kind-cluster.yaml.
HOST_MONGO_PORT=27017
HOST_OM_PORT=8080
# Local-only port used to reach the (unauthenticated) Ditto Operator API.
OPERATOR_API_PORT="${OPERATOR_API_PORT:-18081}"

# ===========================================================================
step "preflight"
bash scripts/preflight.sh

# ---- Big Peer ingress host ------------------------------------------------
# ATAK devices must reach the Big Peer over the LAN, so the host has to be a
# name that resolves to THIS machine from a phone. nip.io gives us that with
# zero DNS setup: anything.<IP>.nip.io -> <IP>.
if [ -z "${BIG_PEER_HOST:-}" ]; then
  LAN_IP="$(detect_lan_ip)"
  if [ -n "$LAN_IP" ]; then
    BIG_PEER_HOST="ditto.${LAN_IP}.nip.io"
  else
    # Dashboard-only fallback: fine for driving the UI, but a phone cannot
    # pair against this.
    BIG_PEER_HOST="ditto.127.0.0.1.nip.io"
    warn "no LAN IP detected — falling back to $BIG_PEER_HOST (ATAK devices will NOT be able to pair)"
  fi
fi

# ===========================================================================
step "kind cluster ($CLUSTER)"
if kind get clusters 2>/dev/null | grep -qx "$CLUSTER"; then
  ok "cluster already exists"
else
  kind create cluster --name "$CLUSTER" --config infra/k8s/kind-cluster.yaml
  ok "cluster created"
fi
kubectl config use-context "kind-$CLUSTER" >/dev/null

# ===========================================================================
step "namespaces"
kubectl apply -f infra/k8s/00-namespaces.yaml

# ===========================================================================
step "ingress-nginx (kind provider)"
kubectl apply -f "https://raw.githubusercontent.com/kubernetes/ingress-nginx/${INGRESS_NGINX_REF}/deploy/static/provider/kind/deploy.yaml"
kubectl -n ingress-nginx rollout status deploy/ingress-nginx-controller --timeout=180s || \
  warn "ingress-nginx not ready yet — continuing (re-run setup.sh if routing fails)"

# ===========================================================================
# cert-manager and Strimzi are hard prerequisites of the Ditto Operator: it
# issues auth certificates through cert-manager and builds the Big Peer
# transaction log on a Strimzi-managed Kafka cluster.
step "cert-manager (Ditto Operator prerequisite)"
helm upgrade --install cert-manager cert-manager \
  --repo https://charts.jetstack.io \
  --namespace cert-manager --create-namespace \
  --version "$CERT_MANAGER_VERSION" \
  --set 'crds.enabled=true' \
  --set 'startupapicheck.enabled=false' \
  --set 'prometheus.enabled=false' \
  --wait --timeout 5m >/dev/null
ok "cert-manager installed"

step "Strimzi Kafka operator (Ditto Operator prerequisite)"
helm upgrade --install strimzi strimzi-kafka-operator \
  --repo https://strimzi.io/charts \
  --version "$STRIMZI_VERSION" \
  --namespace kafka --create-namespace \
  --set watchAnyNamespace=true \
  --wait --timeout 5m >/dev/null
ok "Strimzi $STRIMZI_VERSION installed"

# ===========================================================================
step "MCK operator (v$MCK_VERSION)"
# Alias 'mck' for the public MongoDB chart registry — the 'mongodb' alias may
# already point at the internal 10gen charts on a MongoDB laptop, in which case
# `helm repo add mongodb …` silently no-ops. 'mongodb-webapp' stays on the
# 10gen URL for the web-app chart used to deploy backend/frontend.
helm repo add mck https://mongodb.github.io/helm-charts >/dev/null 2>&1 || true
helm repo add mongodb-webapp https://10gen.github.io/helm-charts >/dev/null 2>&1 || true
helm repo update >/dev/null
helm upgrade --install mongodb-kubernetes-operator mck/mongodb-kubernetes \
  --namespace "$NS_DB" --version "$MCK_VERSION" --wait >/dev/null
ok "operator installed"

# ===========================================================================
step "Ops Manager admin credentials"
if ! kubectl -n "$NS_DB" get secret ops-manager-admin-secret >/dev/null 2>&1; then
  # Ops Manager enforces password complexity (upper+lower+digit+symbol) and
  # requires FirstName/LastName on the initial admin user.
  OM_PW=$(python3 -c "import secrets,string; c=string.ascii_letters+string.digits+'@#!%'; print(secrets.choice(string.ascii_uppercase)+secrets.choice(string.ascii_lowercase)+secrets.choice(string.digits)+secrets.choice('@#!%')+''.join(secrets.choice(c) for _ in range(20)))")
  kubectl -n "$NS_DB" create secret generic ops-manager-admin-secret \
    --from-literal=Username="$OM_ADMIN_USER" \
    --from-literal=Password="$OM_PW" \
    --from-literal=FirstName="Admin" \
    --from-literal=LastName="User" >/dev/null
  ok "created ops-manager-admin-secret (user: $OM_ADMIN_USER)"
else
  ok "ops-manager-admin-secret already present"
fi

# ===========================================================================
step "Ops Manager (self-hosted control plane — first run ~10-15 min)"
kubectl apply -f infra/k8s/mongodb/05-ops-manager.yaml
OM_FAILS=0
om_ready() {
  OM_APPDB="$(kubectl -n "$NS_DB" get opsmanager ops-manager -o jsonpath='{.status.applicationDatabase.phase}' 2>/dev/null || true)"
  OM_WEB="$(kubectl -n "$NS_DB" get opsmanager ops-manager -o jsonpath='{.status.opsManager.phase}' 2>/dev/null || true)"
  [ "$OM_APPDB" = "Running" ] && [ "$OM_WEB" = "Running" ]
}
om_status() { printf 'appdb=%-9s web=%-9s' "${OM_APPDB:-…}" "${OM_WEB:-…}"; }
# Transient Failed is normal early in reconcile — only bail after several in a row.
om_failed() { if [ "${OM_WEB:-}" = "Failed" ]; then OM_FAILS=$((OM_FAILS+1)); else OM_FAILS=0; fi; [ "$OM_FAILS" -ge 3 ]; }
rc=0; spin_wait "Ops Manager" 1800 5 --status om_status --abort om_failed -- om_ready || rc=$?
case "$rc" in
  0) ;;
  3) die "Ops Manager entered Failed — kubectl -n $NS_DB describe opsmanager ops-manager" ;;
  *) die "Timed out waiting for Ops Manager — kubectl -n $NS_DB describe opsmanager ops-manager" ;;
esac

# ===========================================================================
step "Ops Manager API key Secret"
# Once OM is Running the operator publishes mongodb-ops-manager-admin-key
# (publicKey + privateKey), which the MongoDB CR references as `credentials`.
admin_key_ready() { kubectl -n "$NS_DB" get secret mongodb-ops-manager-admin-key >/dev/null 2>&1; }
rc=0; spin_wait "mongodb-ops-manager-admin-key" 300 5 -- admin_key_ready || rc=$?
[ "$rc" = 0 ] || die "API key Secret not created after 5m — kubectl -n $NS_DB logs deploy/mongodb-kubernetes-operator"

# ===========================================================================
step "Ops Manager project ConfigMap"
# Fetch the orgId from the running OM public API (digest auth with the
# operator-created admin key) and bake it into the ConfigMap the MongoDB CR
# points at.
OM_PUB=$(ksecret_val "$NS_DB" mongodb-ops-manager-admin-key publicKey)
OM_PRIV=$(ksecret_val "$NS_DB" mongodb-ops-manager-admin-key privateKey)
say "querying Ops Manager API for orgId…"
kubectl -n "$NS_DB" port-forward svc/ops-manager-svc 18080:8080 >/dev/null 2>&1 &
PF_PID=$!
sleep 4
OM_ORG_ID=$(curl -s --digest -u "$OM_PUB:$OM_PRIV" \
  "http://localhost:18080/api/public/v1.0/orgs" \
  | python3 -c "import sys,json; orgs=json.load(sys.stdin).get('results',[]); print(orgs[0]['id'] if orgs else '')" 2>/dev/null)
kill $PF_PID 2>/dev/null || true; wait $PF_PID 2>/dev/null || true
[ -n "$OM_ORG_ID" ] || die "could not retrieve orgId from the Ops Manager API"
ok "orgId: $OM_ORG_ID"
kubectl -n "$NS_DB" create configmap ops-manager-project \
  --from-literal=baseUrl="http://ops-manager-svc.${NS_DB}.svc.cluster.local:8080" \
  --from-literal=projectName="tak-situational-demo" \
  --from-literal=orgId="$OM_ORG_ID" \
  --dry-run=client -o yaml | kubectl apply -f - >/dev/null

# ===========================================================================
step "MongoDB user password Secrets"
# Seeds for the MongoDBUser CRs. The operator then publishes the credentials it
# actually applied into `tak-mongodb-<user>-admin` Secrets, which we read below.
ensure_password_secret "$NS_DB" mongodb-admin-password
ensure_password_secret "$NS_DB" mongodb-dashboard-password
ensure_password_secret "$NS_DB" mongodb-ditto-connector-password

# ===========================================================================
step "MongoDB Enterprise Advanced replica set + users (Ops Manager managed)"
kubectl apply -f infra/k8s/mongodb/10-mongodb-enterprise.yaml
kubectl apply -f infra/k8s/mongodb/20-mongodbusers.yaml
RS_FAILS=0
rs_ready()  { RS_PHASE="$(kubectl -n "$NS_DB" get mongodb tak-mongodb -o jsonpath='{.status.phase}' 2>/dev/null || true)"; [ "$RS_PHASE" = "Running" ]; }
rs_status() { printf 'phase=%s' "${RS_PHASE:-…}"; }
rs_failed() { if [ "${RS_PHASE:-}" = "Failed" ]; then RS_FAILS=$((RS_FAILS+1)); else RS_FAILS=0; fi; [ "$RS_FAILS" -ge 6 ]; }
rc=0; spin_wait "replica set (provisioning via Ops Manager)" 900 5 --status rs_status --abort rs_failed -- rs_ready || rc=$?
case "$rc" in
  0) ;;
  3) die "MongoDB replica set Failed — kubectl -n $NS_DB describe mongodb tak-mongodb" ;;
  *) die "Timed out waiting for the replica set — kubectl -n $NS_DB describe mongodb tak-mongodb" ;;
esac

# ===========================================================================
step "collections + changeStreamPreAndPostImages (post-init Job)"
# The Ditto connector refuses to start unless every synced collection exists
# with pre/post images enabled, so this must succeed before the data bridge.
kubectl -n "$NS_DB" delete job tak-mongodb-postinit --ignore-not-found >/dev/null
kubectl apply -f infra/k8s/mongodb/40-postinit-job.yaml
postinit_done() { [ "$(kubectl -n "$NS_DB" get job tak-mongodb-postinit -o jsonpath='{.status.succeeded}' 2>/dev/null || echo 0)" = "1" ]; }
rc=0; spin_wait "post-init Job" 420 5 -- postinit_done || rc=$?
[ "$rc" = 0 ] || die "post-init Job did not complete — kubectl -n $NS_DB logs job/tak-mongodb-postinit"

# ===========================================================================
step "connection-string Secrets"
# Read the passwords the operator actually set (not the seeds) so the URIs
# always authenticate.
MDB_HOST="tak-mongodb-svc.${NS_DB}.svc.cluster.local:27017"
DASH_PW="$(ksecret_val "$NS_DB" tak-mongodb-tak-dashboard-admin password)"
CONN_PW="$(ksecret_val "$NS_DB" tak-mongodb-tak-ditto-connector-admin password)"
[ -n "$DASH_PW" ] || die "could not read the dashboard user's password — kubectl -n $NS_DB get secrets | grep tak-mongodb"
[ -n "$CONN_PW" ] || die "could not read the ditto-connector user's password"

# Backend (namespace tak).
kubectl -n "$NS_APP" create secret generic tak-mongodb-uri \
  --from-literal=MONGODB_URI="mongodb://dashboard:${DASH_PW}@${MDB_HOST}/${DB_NAME}?authSource=admin&replicaSet=tak-mongodb" \
  --dry-run=client -o yaml | kubectl apply -f - >/dev/null

# Ditto MongoDB Connector (namespace ditto — the Secret must sit beside the
# workload that consumes it).
kubectl -n "$NS_DITTO" create secret generic tak-mongo-connector \
  --from-literal=connectionString="mongodb://ditto-connector:${CONN_PW}@${MDB_HOST}/${DB_NAME}?authSource=admin&replicaSet=tak-mongodb" \
  --dry-run=client -o yaml | kubectl apply -f - >/dev/null
ok "wrote tak-mongodb-uri ($NS_APP) + tak-mongo-connector ($NS_DITTO)"

# ===========================================================================
step "Ditto Operator (v$DITTO_OPERATOR_VERSION)"
helm upgrade --install ditto-operator \
  oci://quay.io/ditto-external/ditto-operator \
  --version "$DITTO_OPERATOR_VERSION" \
  --namespace "$NS_DITTO" --create-namespace \
  --wait --timeout 5m >/dev/null
ok "Ditto Operator installed"

# ===========================================================================
step "Ditto playground token"
# The shared token is a literal in BigPeer.spec, so it must be stable: we keep
# it in a Secret and reuse it on every re-run. That is what lets a paired ATAK
# device keep working after `make setup` is run again.
ensure_password_secret "$NS_DITTO" tak-playground-token
DITTO_PLAYGROUND_TOKEN="$(ksecret_val "$NS_DITTO" tak-playground-token password)"
[ -n "$DITTO_PLAYGROUND_TOKEN" ] || die "could not read the playground token"

# ===========================================================================
step "Big Peer (self-hosted Ditto Server)"
say "ingress host: $BIG_PEER_HOST   version: $BIG_PEER_VERSION"
sed -e "s|__BIG_PEER_HOST__|${BIG_PEER_HOST}|g" \
    -e "s|__BIG_PEER_VERSION__|${BIG_PEER_VERSION}|g" \
    -e "s|__DITTO_PLAYGROUND_TOKEN__|${DITTO_PLAYGROUND_TOKEN}|g" \
    infra/k8s/ditto/10-bigpeer.yaml | kubectl apply -f - >/dev/null

# Operator >= 0.17 reports Kubernetes-style conditions. Fall back to counting
# ready pods on older versions, where .status.conditions may be absent.
BP_FAILS=0
bp_ready() {
  BP_COND="$(kubectl -n "$NS_DITTO" get bigpeer "$BIG_PEER_NAME" \
    -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}' 2>/dev/null || true)"
  if [ -n "$BP_COND" ]; then
    [ "$BP_COND" = "True" ]
  else
    local total ready
    total="$(kubectl -n "$NS_DITTO" get pods -l "ditto.live/big-peer=$BIG_PEER_NAME" --no-headers 2>/dev/null | wc -l | tr -d ' ')"
    ready="$(kubectl -n "$NS_DITTO" get pods -l "ditto.live/big-peer=$BIG_PEER_NAME" \
      -o jsonpath='{range .items[*]}{.status.phase}{"\n"}{end}' 2>/dev/null | grep -c Running || true)"
    BP_COND="pods ${ready}/${total}"
    [ "${total:-0}" -ge 3 ] && [ "${ready:-0}" = "${total:-0}" ]
  fi
}
bp_status() { printf 'ready=%s' "${BP_COND:-…}"; }
bp_failed() {
  # A bad spec.version is the most common hard failure (image tag not found).
  local bad
  bad="$(kubectl -n "$NS_DITTO" get pods -l "ditto.live/big-peer=$BIG_PEER_NAME" \
    -o jsonpath='{range .items[*]}{.status.containerStatuses[*].state.waiting.reason}{"\n"}{end}' 2>/dev/null \
    | grep -cE 'ErrImagePull|ImagePullBackOff|InvalidImageName' || true)"
  if [ "${bad:-0}" -gt 0 ]; then BP_FAILS=$((BP_FAILS+1)); else BP_FAILS=0; fi
  [ "$BP_FAILS" -ge 4 ]
}
rc=0; spin_wait "Big Peer" 900 5 --status bp_status --abort bp_failed -- bp_ready || rc=$?
case "$rc" in
  0) ;;
  3) err "Big Peer pods cannot pull their images."
     err "BIG_PEER_VERSION=$BIG_PEER_VERSION may not exist or may not be available to you."
     die "Set a different BIG_PEER_VERSION in .env, then re-run. (kubectl -n $NS_DITTO get pods -l ditto.live/big-peer=$BIG_PEER_NAME)" ;;
  *) die "Timed out waiting for the Big Peer — kubectl -n $NS_DITTO describe bigpeer $BIG_PEER_NAME" ;;
esac

# ===========================================================================
step "Ditto App"
kubectl apply -f infra/k8s/ditto/20-bigpeerapp.yaml >/dev/null
ok "app $DITTO_APP_NAME ($DITTO_APP_ID)"

# ===========================================================================
step "Ditto MongoDB Connector (data bridge)"
kubectl apply -f infra/k8s/ditto/30-mongo-connector.yaml >/dev/null
db_ready() {
  DB_COND="$(kubectl -n "$NS_DITTO" get bigpeerdatabridge tak-mongo-connector \
    -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}' 2>/dev/null || true)"
  if [ -n "$DB_COND" ]; then
    [ "$DB_COND" = "True" ]
  else
    # Older operators: settle for the connector pod running.
    DB_COND="$(kubectl -n "$NS_DITTO" get pods -l "ditto.live/app=$DITTO_APP_NAME" \
      -o jsonpath='{range .items[*]}{.status.phase}{"\n"}{end}' 2>/dev/null | grep -c Running || true)"
    [ "${DB_COND:-0}" -ge 1 ]
  fi
}
db_status() { printf 'ready=%s' "${DB_COND:-…}"; }
rc=0; spin_wait "MongoDB Connector" 600 5 --status db_status -- db_ready || rc=$?
if [ "$rc" != 0 ]; then
  warn "the connector is not reporting Ready yet — the stack will still come up"
  warn "check: kubectl -n $NS_DITTO describe bigpeerdatabridge tak-mongo-connector"
  warn "       kubectl -n $NS_DITTO logs -l ditto.live/app=$DITTO_APP_NAME"
fi

# ===========================================================================
step "Big Peer HTTP API key"
# Needed by the backend to proxy ATAK photo attachments. Only the Operator API
# can mint one, and the raw value is returned exactly once — so we persist it
# and reuse it on later runs instead of minting a duplicate.
EXISTING_KEY="$(ksecret_val "$NS_APP" tak-ditto DITTO_API_KEY || true)"
if [ -n "$EXISTING_KEY" ] && kubectl -n "$NS_DITTO" get bigpeerapikey tak-dashboard >/dev/null 2>&1; then
  DITTO_API_KEY="$EXISTING_KEY"
  ok "reusing the existing API key"
else
  say "port-forwarding the Operator API on :$OPERATOR_API_PORT…"
  # The Operator API has NO authentication, so it is never published to the
  # host — a short-lived port-forward keeps it loopback-only.
  kubectl -n "$NS_DITTO" port-forward deployment/ditto-operator "${OPERATOR_API_PORT}:8080" >/dev/null 2>&1 &
  OP_PF_PID=$!
  trap 'kill $OP_PF_PID 2>/dev/null || true' EXIT
  for _ in $(seq 1 20); do
    curl -fsS "http://localhost:${OPERATOR_API_PORT}/namespace/${NS_DITTO}/bigPeer/${BIG_PEER_NAME}/app" >/dev/null 2>&1 && break
    sleep 1
  done

  # Ensure the app is registered with the Operator before asking for a key.
  curl -fsS -H 'Content-Type: application/json' \
    -X POST "http://localhost:${OPERATOR_API_PORT}/namespace/${NS_DITTO}/bigPeer/${BIG_PEER_NAME}/app" \
    -d "{\"name\":\"${DITTO_APP_NAME}\"}" >/dev/null 2>&1 || true

  DITTO_API_KEY="$(curl -fsS -H 'Content-Type: application/json' \
    -X POST "http://localhost:${OPERATOR_API_PORT}/namespace/${NS_DITTO}/bigPeer/${BIG_PEER_NAME}/app/${DITTO_APP_NAME}/apiKey" \
    -d '{
          "name": "tak-dashboard",
          "expiresAt": "2100-01-01T00:00:00Z",
          "permissions": {
            "remoteQuery": true,
            "read":  { "everything": true, "queriesByCollection": {} },
            "write": { "everything": true, "queriesByCollection": {} }
          }
        }' | tr -d '"[:space:]')"

  kill $OP_PF_PID 2>/dev/null || true; wait $OP_PF_PID 2>/dev/null || true
  trap - EXIT

  if [ -z "$DITTO_API_KEY" ]; then
    warn "could not mint a Big Peer API key — ATAK photo thumbnails will 503"
    warn "retry later: see docs/troubleshooting.md (\"Big Peer HTTP API key\")"
    DITTO_API_KEY="unset"
  else
    ok "minted API key for app $DITTO_APP_NAME"
  fi
fi

# ===========================================================================
step "Ditto connection details Secret"
# Discover the in-cluster Big Peer HTTP API Service so the backend talks to it
# directly over cluster DNS instead of hairpinning out through the ingress.
API_SVC="$(kubectl -n "$NS_DITTO" get svc -l "ditto.live/big-peer=$BIG_PEER_NAME" \
  -o jsonpath='{range .items[*]}{.metadata.name}{"\n"}{end}' 2>/dev/null | grep -- '-api' | head -1 || true)"
if [ -n "$API_SVC" ]; then
  API_PORT="$(kubectl -n "$NS_DITTO" get svc "$API_SVC" -o jsonpath='{.spec.ports[0].port}' 2>/dev/null || echo 8080)"
  DITTO_URL_EP="http://${API_SVC}.${NS_DITTO}.svc.cluster.local:${API_PORT}/${DITTO_APP_ID}"
  say "Big Peer HTTP API: $API_SVC:$API_PORT (in-cluster)"
else
  DITTO_URL_EP="http://${BIG_PEER_HOST}/${DITTO_APP_ID}"
  warn "no Big Peer API Service found — falling back to the ingress ($DITTO_URL_EP)"
fi

kubectl -n "$NS_APP" create secret generic tak-ditto \
  --from-literal=DITTO_URL_EP="$DITTO_URL_EP" \
  --from-literal=DITTO_API_KEY="$DITTO_API_KEY" \
  --from-literal=DITTO_AUTH_URL="http://${BIG_PEER_HOST}" \
  --from-literal=DITTO_WS_URL="ws://${BIG_PEER_HOST}" \
  --from-literal=DITTO_PLAYGROUND_TOKEN="$DITTO_PLAYGROUND_TOKEN" \
  --dry-run=client -o yaml | kubectl apply -f - >/dev/null
ok "wrote tak-ditto ($NS_APP)"

# ===========================================================================
step "Ollama (in-cluster LLM for the AI panel)"
if [ "${OLLAMA_SKIP:-0}" = "1" ]; then
  warn "OLLAMA_SKIP=1 — skipping Ollama; the AI panel will be hidden"
else
  kubectl apply -f infra/k8s/ollama/ollama.yaml >/dev/null
  ollama_ready() { kubectl -n "$NS_APP" get deploy ollama -o jsonpath='{.status.readyReplicas}' 2>/dev/null | grep -q '^1'; }
  spin_wait "ollama" 300 5 -- ollama_ready || warn "ollama not ready — kubectl -n $NS_APP logs deploy/ollama"
fi

# ===========================================================================
step "build images + load into kind"
docker build -t tak-situational-demo-backend:local  -f Dockerfile.backend  .
docker build -t tak-situational-demo-frontend:local -f Dockerfile.frontend .
kind load docker-image tak-situational-demo-backend:local  --name "$CLUSTER"
kind load docker-image tak-situational-demo-frontend:local --name "$CLUSTER"
ok "images built + loaded"

# ===========================================================================
step "deploy the dashboard (mongodb/web-app chart)"
for svc in backend frontend; do
  helm upgrade --install "tak-situational-demo-$svc" mongodb-webapp/web-app \
    --version "$WEBAPP_CHART_VERSION" -n "$NS_APP" -f "infra/local/$svc.yaml" >/dev/null
  say "released tak-situational-demo-$svc"
done

# ===========================================================================
step "ingress"
kubectl apply -f infra/k8s/ingress/ingress.yaml >/dev/null

# ===========================================================================
step "host access (NodePort services)"
kubectl apply -f infra/k8s/access/mongodb-nodeport.yaml >/dev/null
kubectl apply -f infra/k8s/access/opsmanager-nodeport.yaml >/dev/null
ok "MongoDB :$HOST_MONGO_PORT · Ops Manager :$HOST_OM_PORT exposed to the host"

# ===========================================================================
step "wait for app rollouts"
for svc in backend frontend; do
  dep="tak-situational-demo-$svc-web-app"
  # shellcheck disable=SC2317
  svc_ready() { local r; r="$(kubectl -n "$NS_APP" get deploy "$dep" -o jsonpath='{.status.readyReplicas}' 2>/dev/null)"; [ "${r:-0}" -ge 1 ]; }
  rc=0; spin_wait "$svc" 240 3 -- svc_ready || rc=$?
  [ "$rc" = 0 ] || warn "$svc not ready — kubectl -n $NS_APP logs deploy/$dep"
done

# ===========================================================================
step "Ollama model ($OLLAMA_MODEL)"
if [ "${OLLAMA_SKIP:-0}" = "1" ]; then
  say "skipped"
elif ollama_model_present "$NS_APP" "$OLLAMA_MODEL"; then
  ok "$OLLAMA_MODEL already present"
else
  ( "$ROOT/scripts/pull-models.sh" ) >/tmp/tak-ollama-pull.log 2>&1 &
  say "pulling in the background → /tmp/tak-ollama-pull.log (the AI panel 503s until it finishes)"
fi

# ===========================================================================
# Gather live details for the summary.
ADMIN_PW="$(ksecret_val "$NS_DB" tak-mongodb-tak-admin-admin password || true)"
OM_USER="$(ksecret_val "$NS_DB" ops-manager-admin-secret Username || echo "$OM_ADMIN_USER")"
OM_PW="$(ksecret_val "$NS_DB" ops-manager-admin-secret Password || true)"
MONGO_URI="mongodb://admin:${ADMIN_PW:-<password>}@localhost:${HOST_MONGO_PORT}/?authSource=admin&directConnection=true"

step "ready — the local stack is up"
cat <<EOF

  ${C_BOLD}1) Dashboard${C_RESET}
     $(hl "http://localhost")

  ${C_BOLD}2) MongoDB Enterprise Advanced — Compass / mongosh${C_RESET}
     $(hl "$MONGO_URI")
     Data lives in db ${C_CYAN}${DB_NAME}${C_RESET}: ${C_CYAN}track · mapitem · chat · file · alert${C_RESET}

  ${C_BOLD}3) Ops Manager — web UI${C_RESET}
     $(hl "http://localhost:${HOST_OM_PORT}")
     user: ${C_CYAN}${OM_USER}${C_RESET}   password: ${C_CYAN}${OM_PW:-<see ops-manager-admin-secret>}${C_RESET}

  ${C_BOLD}4) Pair an ATAK device (Ditto OnlinePlayground)${C_RESET}
     App ID:         ${C_CYAN}${DITTO_APP_ID}${C_RESET}
     Auth URL:       ${C_CYAN}http://${BIG_PEER_HOST}${C_RESET}
     Websocket URL:  ${C_CYAN}ws://${BIG_PEER_HOST}${C_RESET}
     Playground token: ${C_CYAN}${DITTO_PLAYGROUND_TOKEN}${C_RESET}
     ${C_GREY}The phone must be on this Wi-Fi. "Add Device" in the dashboard shows the
     same values as a QR code. Cloud sync must be DISABLED in the plugin so it
     targets this Big Peer instead of Ditto Cloud — see docs/RUN_LOCAL.md.${C_RESET}

  ${C_BOLD}5) Dev tooling (local only)${C_RESET}
     Backend API docs: $(hl "http://backend.localtest.me/docs")

  ${C_GREY}Smoke test:${C_RESET} ./scripts/verify.sh   ${C_GREY}Status:${C_RESET} make status   ${C_GREY}Tear down:${C_RESET} make reset

EOF
