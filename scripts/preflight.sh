#!/usr/bin/env bash
# Preflight checks for the local kind stack: required CLI tools, free host
# ports, and enough RAM to actually run everything.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=scripts/lib.sh
. "$ROOT/scripts/lib.sh"

step "preflight checks"

# ---- required tooling -----------------------------------------------------
command -v docker  >/dev/null 2>&1 || die "docker not found"
docker info        >/dev/null 2>&1 || die "docker daemon not running"
ok "docker daemon reachable"

command -v kind    >/dev/null 2>&1 || die "kind not found (https://kind.sigs.k8s.io)"
command -v kubectl >/dev/null 2>&1 || die "kubectl not found"
command -v helm    >/dev/null 2>&1 || die "helm not found"
command -v openssl >/dev/null 2>&1 || die "openssl not found"
command -v curl    >/dev/null 2>&1 || die "curl not found"
command -v python3 >/dev/null 2>&1 || die "python3 not found (used to parse API responses)"
ok "kind + kubectl + helm + openssl + curl + python3"

# Ollama runs in-cluster (infra/k8s/ollama/ollama.yaml) — no host install needed.

# ---- host ports -----------------------------------------------------------
# kind maps host :80/:443 (ingress) and :27017/:8080 (MongoDB / Ops Manager).
# They must be free when the cluster is CREATED. We hard-fail only on 80/443,
# which kind needs to create the node at all; the other two surface as a clear
# kind error. Skip entirely once the cluster exists — the listener IS the kind
# node at that point, so the check would be a false positive.
CLUSTER="${KIND_CLUSTER:-tak-situational-demo}"
if kind get clusters 2>/dev/null | grep -qx "$CLUSTER"; then
  ok "host ports (skipped — kind cluster already exists)"
else
  for port in 80 443; do
    if command -v lsof >/dev/null 2>&1 && lsof -iTCP:"$port" -P -sTCP:LISTEN >/dev/null 2>&1; then
      die "port $port is in use — kind ingress needs it (stop whatever is listening)"
    fi
  done
  ok "ports 80, 443 free"
  for port in 27017 8080; do
    if command -v lsof >/dev/null 2>&1 && lsof -iTCP:"$port" -P -sTCP:LISTEN >/dev/null 2>&1; then
      warn "port $port is in use — host access for it will fail (free it, or edit infra/k8s/kind-cluster.yaml)"
    fi
  done
fi

# ---- RAM ------------------------------------------------------------------
# Budget: Ops Manager (~4 GB) + its 3-member app DB + MCK + EA mongod + Kafka
# (Strimzi, for the Big Peer transaction log) + Big Peer store/subscription/api
# + Ollama (up to 8 GB) + backend + frontend. 32 GB is comfortable, 24 GB works
# if you don't run much else, 16 GB will thrash.
TOTAL_GB=0
if [ "$(uname)" = "Darwin" ]; then
  TOTAL_GB=$(( $(sysctl -n hw.memsize) / 1073741824 ))
elif [ -r /proc/meminfo ]; then
  TOTAL_GB=$(( $(awk '/MemTotal/ {print $2}' /proc/meminfo) / 1048576 ))
fi
if [ "$TOTAL_GB" -gt 0 ] && [ "$TOTAL_GB" -lt 24 ]; then
  warn "only ${TOTAL_GB}GB RAM — 32 GB recommended (Ops Manager ~4 GB + Kafka + Big Peer + Ollama)"
  warn "expect OOM kills; consider OLLAMA_SKIP=1 and a smaller OLLAMA_MODEL"
elif [ "$TOTAL_GB" -gt 0 ] && [ "$TOTAL_GB" -lt 32 ]; then
  warn "${TOTAL_GB}GB RAM — workable, but close everything else; 32 GB recommended"
elif [ "$TOTAL_GB" -gt 0 ]; then
  ok "${TOTAL_GB}GB RAM"
fi

# ---- disk -----------------------------------------------------------------
# Ops Manager, EA, Kafka, Big Peer and the Ollama model add up fast.
AVAIL_GB="$(df -g / 2>/dev/null | awk 'NR==2{print $4}' || echo 0)"
if [ "${AVAIL_GB:-0}" -gt 0 ] && [ "${AVAIL_GB:-0}" -lt 30 ]; then
  warn "only ${AVAIL_GB}GB free disk — ~30 GB recommended for images + volumes"
fi

# ---- LAN IP ---------------------------------------------------------------
# Not fatal: you can still drive the dashboard without a phone. But the Big Peer
# ingress host depends on it, so flag it early.
LAN_IP="$(detect_lan_ip)"
if [ -n "$LAN_IP" ]; then
  ok "LAN IP detected: $LAN_IP (ATAK devices will reach the Big Peer here)"
else
  warn "could not detect a LAN IP — set BIG_PEER_HOST in .env if ATAK devices need to connect"
fi

ok "preflight complete"
