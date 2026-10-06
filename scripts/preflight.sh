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
# lsof is how we detect host-port conflicts. Without it every port check would
# silently pass and setup would fail later inside kind with a far less obvious
# error, so require it up front.
command -v lsof    >/dev/null 2>&1 || die "lsof not found (used to check host ports) — e.g. apt install lsof / dnf install lsof"
ok "kind + kubectl + helm + openssl + curl + python3 + lsof"

# Ollama runs in-cluster (infra/k8s/ollama/ollama.yaml) — no host install needed.

# ---- host ports -----------------------------------------------------------
# kind maps host :80/:443 (ingress) and :27017/:8080 (MongoDB / Ops Manager)
# as extraPortMappings. Docker publishes ALL of them when it creates the node
# container, so a conflict on ANY one stops the cluster from starting at all —
# it doesn't merely lose host access to that one service. All four are
# therefore fatal. Skip entirely once the cluster exists — the listener IS the
# kind node at that point, so the check would be a false positive.
CLUSTER="${KIND_CLUSTER:-tak-situational-demo}"
if kind get clusters 2>/dev/null | grep -qx "$CLUSTER"; then
  ok "host ports (skipped — kind cluster already exists)"
else
  busy=()
  for port in 80 443 27017 8080; do
    if lsof -iTCP:"$port" -P -sTCP:LISTEN >/dev/null 2>&1; then
      busy+=("$port")
      err "port $port is in use: $(lsof -iTCP:"$port" -P -sTCP:LISTEN 2>/dev/null | awk 'NR==2{print $1" (pid "$2")"}')"
    fi
  done
  if [ "${#busy[@]}" -gt 0 ]; then
    die "kind cannot create the cluster while ports ${busy[*]} are taken — stop those processes, or remap them in infra/k8s/kind-cluster.yaml"
  fi
  ok "ports 80, 443, 27017, 8080 free"
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
AVAIL_GB=0
# `df -g` is BSD-only (GNU df rejects it), so ask for POSIX 1K-blocks with -Pk,
# which every df supports, and convert to GiB ourselves.
AVAIL_KB="$(df -Pk / 2>/dev/null | awk 'NR==2{print $4}')"
case "$AVAIL_KB" in ''|*[!0-9]*) ;; *) AVAIL_GB=$(( AVAIL_KB / 1048576 )) ;; esac
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
