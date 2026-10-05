#!/usr/bin/env bash
# Tear the local stack down.
#
# Default: delete the whole kind cluster — the fastest, most complete reset.
# Everything in-cluster goes with it: Ops Manager and its data, the MongoDB EA
# replica set, the Big Peer (including its Kafka transaction log), all Secrets,
# and the Ollama model cache.
#
#   ./scripts/reset.sh            delete the kind cluster
#   ./scripts/reset.sh --soft     keep the cluster, remove just the demo
#                                 (Ditto resources + app releases + app data)
#
# --soft is useful while iterating: it skips the ~25 minute Ops Manager rebuild
# but still gives you a clean Big Peer and a clean database.
#
# NOTE: a full reset regenerates the Ditto playground token and App-ID pairing
# material, so any ATAK device will need to be re-paired. --soft preserves the
# App ID but also regenerates the token.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
# shellcheck source=scripts/lib.sh
. "$ROOT/scripts/lib.sh"

if [ -f .env ]; then
  # shellcheck disable=SC1091
  set -a; . ./.env; set +a
fi

CLUSTER="${KIND_CLUSTER:-tak-situational-demo}"
NS_DITTO="ditto"; NS_APP="tak"; NS_DB="mongodb"

usage() {
  cat <<EOF
Usage: ./scripts/reset.sh [--soft]

  (no argument)  delete the kind cluster '$CLUSTER' and all local state
  --soft         keep the cluster, Ops Manager and MongoDB EA; remove only the
                 Ditto resources, app releases and demo data
  -h, --help     show this help
EOF
}

# Parse arguments strictly. The default action is destructive (it deletes the
# whole cluster), so an unrecognised argument — e.g. a typo like `--sof` — must
# abort rather than silently fall through to a full reset.
SOFT=0
if [ "$#" -gt 1 ]; then
  usage >&2
  die "expected at most one argument, got $#: $*"
fi
case "${1:-}" in
  "")        ;;
  --soft)    SOFT=1 ;;
  -h|--help) usage; exit 0 ;;
  *)         usage >&2; die "unknown argument: $1 (nothing was deleted)" ;;
esac

if [ "$SOFT" = 1 ]; then
  step "soft reset (keeping the cluster, Ops Manager and MongoDB EA)"

  say "removing the Ditto data bridge, app and Big Peer…"
  # Order matters: the bridge references the app, which references the Big Peer.
  kubectl -n "$NS_DITTO" delete bigpeerdatabridge tak-mongo-connector --ignore-not-found --timeout=120s
  kubectl -n "$NS_DITTO" delete bigpeerapikey tak-dashboard --ignore-not-found --timeout=60s
  kubectl -n "$NS_DITTO" delete bigpeerapp tak-situational --ignore-not-found --timeout=120s
  kubectl -n "$NS_DITTO" delete bigpeer tak --ignore-not-found --timeout=300s

  say "removing the app releases…"
  helm uninstall tak-situational-demo-backend  -n "$NS_APP" 2>/dev/null || true
  helm uninstall tak-situational-demo-frontend -n "$NS_APP" 2>/dev/null || true

  say "removing generated Secrets…"
  kubectl -n "$NS_APP"   delete secret tak-ditto tak-mongodb-uri --ignore-not-found
  kubectl -n "$NS_DITTO" delete secret tak-mongo-connector tak-playground-token --ignore-not-found

  say "dropping the demo database…"
  ADMIN_PW="$(ksecret_val "$NS_DB" tak-mongodb-tak-admin-admin password || true)"
  DB_NAME="tak_demo"
  if [ -n "$ADMIN_PW" ]; then
    kubectl -n "$NS_DB" run "tak-reset-drop-$RANDOM" \
      --rm -i --restart=Never --quiet --image=mongo:8.0 --command -- \
      mongosh "mongodb://admin:${ADMIN_PW}@tak-mongodb-svc.${NS_DB}.svc.cluster.local:27017/?authSource=admin&replicaSet=tak-mongodb" \
      --quiet --eval "db.getSiblingDB('${DB_NAME}').dropDatabase()" >/dev/null 2>&1 \
      && ok "dropped $DB_NAME" || warn "could not drop $DB_NAME (carry on; setup.sh recreates the collections)"
  else
    warn "no admin password found — skipping the database drop"
  fi

  # Kafka topics for the Big Peer transaction log have deletion protection and
  # are owned by the BigPeer; deleting the BigPeer above releases them.
  step "soft reset complete"
  printf '\n  Re-run %s to bring the demo back up (minutes, not tens of minutes).\n\n' "$(hl 'make setup')"
  exit 0
fi

step "full reset — deleting the kind cluster '$CLUSTER'"

if ! kind get clusters 2>/dev/null | grep -qx "$CLUSTER"; then
  ok "cluster '$CLUSTER' does not exist — nothing to do"
else
  kind delete cluster --name "$CLUSTER"
  ok "cluster deleted"
fi

# Local scratch state written by setup.sh (if any).
[ -d .ditto ] && rm -rf .ditto && say "removed ./.ditto"

step "reset complete"
cat <<EOF

  All in-cluster state is gone: Ops Manager, MongoDB EA, the Big Peer and its
  Kafka log, every Secret, and the Ollama model cache.

  ${C_BOLD}Next:${C_RESET} $(hl 'make setup')  ${C_GREY}(~25-35 min — Ops Manager dominates)${C_RESET}

  ${C_GREY}Any paired ATAK device must be re-paired: the playground token is
  regenerated on the next setup.${C_RESET}

EOF
