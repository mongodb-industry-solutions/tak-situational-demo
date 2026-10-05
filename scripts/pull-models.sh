#!/usr/bin/env bash
# Pull the LLM the AI panel uses into the in-cluster Ollama pod.
#
# scripts/setup.sh runs this in the background (logging to
# /tmp/tak-ollama-pull.log) because a 7B model is several GB and there is no
# reason to block the rest of the bring-up on it. The AI panel returns 503 until
# the pull completes; everything else — map, node status, chat — works
# immediately.
#
# Safe to run by hand at any time, e.g. after `make reset` or to add a model:
#   OLLAMA_MODEL=llama3.1:8b ./scripts/pull-models.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=scripts/lib.sh
. "$ROOT/scripts/lib.sh"

if [ -f "$ROOT/.env" ]; then
  # shellcheck disable=SC1091
  set -a; . "$ROOT/.env"; set +a
fi

NS_APP="tak"
# Must stay in step with LLM_MODEL in infra/local/backend.yaml.
OLLAMA_MODEL="${OLLAMA_MODEL:-qwen2.5:7b}"

step "pulling $OLLAMA_MODEL into the in-cluster Ollama"

kubectl -n "$NS_APP" get deploy ollama >/dev/null 2>&1 || \
  die "the ollama Deployment is missing — run ./scripts/setup.sh first (or unset OLLAMA_SKIP)"

kubectl -n "$NS_APP" rollout status deploy/ollama --timeout=300s >/dev/null || \
  die "ollama never became ready — kubectl -n $NS_APP logs deploy/ollama"

# `ollama pull` streams progress; keep it attached so the log file is useful.
kubectl -n "$NS_APP" exec deploy/ollama -- ollama pull "$OLLAMA_MODEL"

ok "$OLLAMA_MODEL ready"
kubectl -n "$NS_APP" exec deploy/ollama -- ollama list || true
