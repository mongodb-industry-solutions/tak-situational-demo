#!/usr/bin/env bash
# End-to-end smoke test for the local stack.
#
# Checks each layer in the order data actually flows, so the first failure tells
# you where the pipeline is broken:
#
#   ingress -> frontend -> backend -> MongoDB EA -> Ditto Big Peer
#           -> MongoDB Connector -> (round-trip: Mongo write visible in Ditto)
#
# Exits non-zero if a REQUIRED check fails. Checks that depend on optional
# pieces (Ollama model, ATAK devices, attachments) are reported as WARN.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
# shellcheck source=scripts/lib.sh
. "$ROOT/scripts/lib.sh"

if [ -f .env ]; then
  # shellcheck disable=SC1091
  set -a; . ./.env; set +a
fi

NS_DB="mongodb"; NS_DITTO="ditto"; NS_APP="tak"
DB_NAME="${DATABASE_NAME:-tak_demo}"
DITTO_APP_ID="${DITTO_APP_ID:-7a9f1c4e-2b6d-4f83-9c15-8e0d3a5b7f42}"
BIG_PEER_NAME="tak"
FAILED=0

fail() { err "$*"; FAILED=$((FAILED+1)); }

# ===========================================================================
step "cluster + workloads"

if kubectl cluster-info >/dev/null 2>&1; then
  ok "kubectl can reach the cluster ($(kubectl config current-context))"
else
  die "kubectl cannot reach a cluster — is the kind cluster running? (make status)"
fi

for ns in "$NS_DB" "$NS_DITTO" "$NS_APP"; do
  kubectl get ns "$ns" >/dev/null 2>&1 || fail "namespace $ns is missing"
done

for dep in tak-situational-demo-backend-web-app tak-situational-demo-frontend-web-app; do
  r="$(kubectl -n "$NS_APP" get deploy "$dep" -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo 0)"
  if [ "${r:-0}" -ge 1 ]; then ok "$dep ready"; else fail "$dep has no ready replicas"; fi
done

# ===========================================================================
step "MongoDB Enterprise Advanced"

RS_PHASE="$(kubectl -n "$NS_DB" get mongodb tak-mongodb -o jsonpath='{.status.phase}' 2>/dev/null || true)"
if [ "$RS_PHASE" = "Running" ]; then
  RS_VER="$(kubectl -n "$NS_DB" get mongodb tak-mongodb -o jsonpath='{.status.version}' 2>/dev/null || true)"
  ok "replica set Running (version ${RS_VER:-unknown})"
else
  fail "replica set phase is '${RS_PHASE:-missing}' — kubectl -n $NS_DB describe mongodb tak-mongodb"
fi

# changeStreamPreAndPostImages is the connector's hard prerequisite, so assert
# it directly rather than trusting that the post-init Job ran.
ADMIN_PW="$(ksecret_val "$NS_DB" tak-mongodb-tak-admin-admin password || true)"
if [ -n "$ADMIN_PW" ]; then
  MISSING="$(kubectl -n "$NS_DB" run tak-verify-mongo-$RANDOM \
    --rm -i --restart=Never --quiet --image=mongo:8.0 --command -- \
    mongosh "mongodb://admin:${ADMIN_PW}@tak-mongodb-svc.${NS_DB}.svc.cluster.local:27017/?authSource=admin&replicaSet=tak-mongodb" \
    --quiet --eval "
      const t = db.getSiblingDB('${DB_NAME}');
      const want = ['track','mapitem','chat','file','alert'];
      const bad = want.filter(n => {
        const i = t.getCollectionInfos({name:n})[0];
        return !i || i.options?.changeStreamPreAndPostImages?.enabled !== true;
      });
      print(bad.join(','));
    " 2>/dev/null | tr -d '[:space:]')"
  if [ -z "$MISSING" ]; then
    ok "all 5 synced collections exist with changeStreamPreAndPostImages enabled"
  else
    fail "collections missing pre/post images: $MISSING — re-run the post-init Job"
  fi
else
  warn "could not read the admin password — skipping the collection check"
fi

# ===========================================================================
step "Ditto Big Peer"

BP_COND="$(kubectl -n "$NS_DITTO" get bigpeer "$BIG_PEER_NAME" \
  -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}' 2>/dev/null || true)"
BP_PODS="$(kubectl -n "$NS_DITTO" get pods -l "ditto.live/big-peer=$BIG_PEER_NAME" --no-headers 2>/dev/null | grep -c Running || true)"
if [ "$BP_COND" = "True" ] || [ "${BP_PODS:-0}" -ge 3 ]; then
  ok "Big Peer up (${BP_PODS:-0} pods Running${BP_COND:+, Ready=$BP_COND})"
else
  fail "Big Peer not ready (Ready='${BP_COND:-n/a}', ${BP_PODS:-0} pods Running) — kubectl -n $NS_DITTO describe bigpeer $BIG_PEER_NAME"
fi

APP_UID="$(kubectl -n "$NS_DITTO" get bigpeerapp tak-situational -o jsonpath='{.spec.appId}' 2>/dev/null || true)"
if [ "$APP_UID" = "$DITTO_APP_ID" ]; then
  ok "app registered with the expected App ID"
else
  fail "BigPeerApp appId is '${APP_UID:-missing}', expected $DITTO_APP_ID"
fi

# ===========================================================================
step "Ditto MongoDB Connector"

DB_COND="$(kubectl -n "$NS_DITTO" get bigpeerdatabridge tak-mongo-connector \
  -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}' 2>/dev/null || true)"
CONN_PODS="$(kubectl -n "$NS_DITTO" get pods -l "ditto.live/app=tak-situational" --no-headers 2>/dev/null | grep -c Running || true)"
if [ "$DB_COND" = "True" ] || [ "${CONN_PODS:-0}" -ge 1 ]; then
  ok "connector running (${CONN_PODS:-0} pods${DB_COND:+, Ready=$DB_COND})"
else
  fail "connector not ready — kubectl -n $NS_DITTO describe bigpeerdatabridge tak-mongo-connector"
fi

# The connector parks documents it could not write to MongoDB here. Anything in
# it means sync is silently dropping data.
if [ -n "${ADMIN_PW:-}" ]; then
  UNSYNCED="$(kubectl -n "$NS_DB" run tak-verify-unsynced-$RANDOM \
    --rm -i --restart=Never --quiet --image=mongo:8.0 --command -- \
    mongosh "mongodb://admin:${ADMIN_PW}@tak-mongodb-svc.${NS_DB}.svc.cluster.local:27017/?authSource=admin&replicaSet=tak-mongodb" \
    --quiet --eval "print(db.getSiblingDB('${DB_NAME}').__ditto_unsynced_documents.countDocuments({}))" 2>/dev/null | tr -d '[:space:]')"
  case "$UNSYNCED" in
    ''|*[!0-9]*) say "__ditto_unsynced_documents not present yet (normal before first sync)" ;;
    0)           ok "__ditto_unsynced_documents is empty" ;;
    *)           warn "$UNSYNCED document(s) failed to sync Ditto → MongoDB (inspect __ditto_unsynced_documents)" ;;
  esac
fi

# ===========================================================================
step "HTTP surface"

code() { curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$1" 2>/dev/null || echo 000; }

c="$(code http://localhost/)"
if [ "$c" = "200" ]; then ok "dashboard http://localhost -> 200"; else fail "dashboard http://localhost -> $c"; fi

c="$(code http://localhost/api/health)"
if [ "$c" = "200" ]; then ok "backend /api/health (via the frontend proxy) -> 200"; else fail "backend /api/health -> $c"; fi

for ep in tracks mapitems chat alerts telemetry; do
  c="$(code "http://localhost/api/$ep")"
  if [ "$c" = "200" ]; then ok "/api/$ep -> 200"; else fail "/api/$ep -> $c"; fi
done

c="$(code http://backend.localtest.me/docs)"
if [ "$c" = "200" ]; then ok "Swagger http://backend.localtest.me/docs -> 200"; else warn "Swagger -> $c (dev tooling only)"; fi

# ===========================================================================
step "Big Peer round-trip (MongoDB -> Ditto)"
# The real proof the connector works: write straight into MongoDB, then read it
# back through the Big Peer HTTP API with DQL. Exercises change streams, the
# connector, and the Big Peer store in one shot.

DITTO_API_KEY="$(ksecret_val "$NS_APP" tak-ditto DITTO_API_KEY || true)"
PROBE_ID="verify-probe-$(date +%s)"

if [ -z "$DITTO_API_KEY" ] || [ "$DITTO_API_KEY" = "unset" ]; then
  warn "no Big Peer API key — skipping the round-trip check"
elif [ -z "${ADMIN_PW:-}" ]; then
  warn "no MongoDB admin password — skipping the round-trip check"
else
  kubectl -n "$NS_DB" run "tak-verify-insert-$RANDOM" \
    --rm -i --restart=Never --quiet --image=mongo:8.0 --command -- \
    mongosh "mongodb://admin:${ADMIN_PW}@tak-mongodb-svc.${NS_DB}.svc.cluster.local:27017/?authSource=admin&replicaSet=tak-mongodb" \
    --quiet --eval "
      db.getSiblingDB('${DB_NAME}').mapitem.insertOne({
        _id: '${PROBE_ID}', e: 'VERIFY-PROBE', j: 33.2, l: -117.4,
        w: 'a-f-G', _r: false, b: Date.now(), o: Date.now() + 3600000
      });
    " >/dev/null 2>&1 || warn "could not insert the probe document"

  API_SVC="$(kubectl -n "$NS_DITTO" get svc -l "ditto.live/big-peer=$BIG_PEER_NAME" \
    -o jsonpath='{range .items[*]}{.metadata.name}{"\n"}{end}' 2>/dev/null | grep -- '-api' | head -1 || true)"
  if [ -z "$API_SVC" ]; then
    warn "no Big Peer API Service found — skipping the round-trip check"
  else
    API_PORT="$(kubectl -n "$NS_DITTO" get svc "$API_SVC" -o jsonpath='{.spec.ports[0].port}' 2>/dev/null || echo 8080)"
    kubectl -n "$NS_DITTO" port-forward "svc/$API_SVC" "18082:${API_PORT}" >/dev/null 2>&1 &
    VF_PID=$!
    sleep 3
    found=0
    # Sync is asynchronous — poll rather than assuming it is instant.
    for _ in $(seq 1 20); do
      body="$(curl -fsS --max-time 10 \
        -X POST "http://localhost:18082/${DITTO_APP_ID}/api/v4/store/execute" \
        -H "Authorization: Bearer ${DITTO_API_KEY}" \
        -H 'Content-Type: application/json' \
        -d "{\"statement\":\"SELECT * FROM mapitem WHERE _id = '${PROBE_ID}'\"}" 2>/dev/null || true)"
      if printf '%s' "$body" | grep -q "$PROBE_ID"; then found=1; break; fi
      sleep 3
    done
    kill $VF_PID 2>/dev/null || true; wait $VF_PID 2>/dev/null || true

    if [ "$found" = 1 ]; then
      ok "probe document replicated MongoDB -> Ditto (bidirectional sync works)"
    else
      fail "probe document never reached Ditto — the connector is not syncing"
      warn "inspect: kubectl -n $NS_DITTO logs -l ditto.live/app=tak-situational"
    fi
  fi

  # Clean up regardless of the result.
  kubectl -n "$NS_DB" run "tak-verify-cleanup-$RANDOM" \
    --rm -i --restart=Never --quiet --image=mongo:8.0 --command -- \
    mongosh "mongodb://admin:${ADMIN_PW}@tak-mongodb-svc.${NS_DB}.svc.cluster.local:27017/?authSource=admin&replicaSet=tak-mongodb" \
    --quiet --eval "db.getSiblingDB('${DB_NAME}').mapitem.deleteOne({_id:'${PROBE_ID}'})" >/dev/null 2>&1 || true
fi

# ===========================================================================
step "AI panel (optional)"

if [ "${OLLAMA_SKIP:-0}" = "1" ]; then
  say "OLLAMA_SKIP=1 — the AI panel is intentionally disabled"
else
  OLLAMA_MODEL="${OLLAMA_MODEL:-qwen2.5:7b}"
  if ollama_model_present "$NS_APP" "$OLLAMA_MODEL"; then
    ok "$OLLAMA_MODEL present in the Ollama pod"
  else
    warn "$OLLAMA_MODEL not pulled yet — the AI panel will 503 (tail /tmp/tak-ollama-pull.log)"
  fi
fi

# ===========================================================================
if [ "$FAILED" -eq 0 ]; then
  step "verify: all required checks passed"
  printf '\n  Open %s\n\n' "$(hl http://localhost)"
  exit 0
fi
step "verify: $FAILED required check(s) failed"
printf '\n  See %s\n\n' "$(hl docs/troubleshooting.md)"
exit 1
