#!/usr/bin/env bash
# scripts/lib.sh — shared output helpers for the local setup scripts.
#
# Source this near the top of preflight.sh / setup.sh / verify.sh / reset.sh:
#
#     ROOT="$(cd "$(dirname "$0")/.." && pwd)"
#     # shellcheck source=scripts/lib.sh
#     . "$ROOT/scripts/lib.sh"
#
# What it gives you:
#   • ANSI colors that auto-disable when stdout isn't a terminal (or NO_COLOR is
#     set) so piping to a log file stays readable.
#   • consistent status printers: step / say / ok / warn / err / die / hl
#   • spin_wait — an animated spinner that polls a condition until true, with a
#     live status line and optional fast-fail, degrading to plain heartbeat
#     lines when there's no TTY.
#
# Nothing here changes cluster state; it is presentation + waiting only.

# ---------------------------------------------------------------------------
# Colors (honour https://no-color.org; FORCE_COLOR=1 overrides the TTY check)
# ---------------------------------------------------------------------------
if { [ -t 1 ] || [ "${FORCE_COLOR:-}" = "1" ]; } && [ -z "${NO_COLOR:-}" ]; then
  C_RESET=$'\033[0m'; C_BOLD=$'\033[1m';   C_DIM=$'\033[2m'
  C_RED=$'\033[31m';  C_GREEN=$'\033[32m'; C_YELLOW=$'\033[33m'
  C_BLUE=$'\033[34m'; C_CYAN=$'\033[36m';  C_GREY=$'\033[90m'
else
  C_RESET=''; C_BOLD=''; C_DIM=''
  C_RED='';   C_GREEN=''; C_YELLOW=''
  C_BLUE='';  C_CYAN='';  C_GREY=''
fi

# ---------------------------------------------------------------------------
# Status printers
# ---------------------------------------------------------------------------
# step: a major phase header — bold cyan, with a leading blank line.
step() { printf '\n%s==>%s %s%s%s\n' "$C_CYAN$C_BOLD" "$C_RESET" "$C_BOLD" "$*" "$C_RESET"; }
# say:  ordinary progress detail (dim bullet).
say()  { printf '%s   •%s %s\n'  "$C_GREY"  "$C_RESET" "$*"; }
# ok:   a completed/healthy result (green check).
ok()   { printf '%s   ✓%s %s\n'  "$C_GREEN" "$C_RESET" "$*"; }
# warn: a non-fatal problem (yellow) — to stderr so it survives stdout capture.
warn() { printf '%s   ! %s%s\n'  "$C_YELLOW" "$*" "$C_RESET" >&2; }
# err:  a fatal problem (red bold) — to stderr. Caller decides whether to exit.
err()  { printf '%s   ✗ %s%s\n'  "$C_RED$C_BOLD" "$*" "$C_RESET" >&2; }
# die:  print an error and abort.
die()  { err "$*"; exit 1; }
# hl:   wrap a value in bold cyan for emphasis inside a sentence (URLs, creds…).
hl()   { printf '%s%s%s' "$C_BOLD$C_CYAN" "$*" "$C_RESET"; }

# ---------------------------------------------------------------------------
# spin_wait — poll a condition with an animated spinner
# ---------------------------------------------------------------------------
# Usage:
#   spin_wait <label> <timeout_s> <poll_every_s> \
#             [--status <fn>] [--abort <fn>] -- <predicate-cmd...>
#
#   <predicate-cmd>  Run every <poll_every_s> seconds. Return 0 when ready.
#                    It may stash state in globals that --status/--abort read.
#   --status <fn>    Optional. Its stdout shows live on the spinner line
#                    (e.g. "appdb=Running web=Pending"). Must return 0.
#   --abort  <fn>    Optional. Polled alongside the predicate; returning 0 bails
#                    out immediately with code 3 — use for terminal failure
#                    states so we don't sit through the whole timeout.
#
# Returns: 0 ready · 1 timed out · 3 aborted.
#
# The spinner animates every ~0.2s, but the (potentially expensive) predicate
# only runs every <poll_every_s> seconds so we never hammer the k8s API. With no
# TTY it prints one heartbeat line per poll instead of animating.
spin_wait() {
  local label="$1" timeout="$2" poll_every="$3"; shift 3
  local status_fn='' abort_fn=''
  while [ $# -gt 0 ]; do
    case "$1" in
      --status) status_fn="$2"; shift 2 ;;
      --abort)  abort_fn="$2";  shift 2 ;;
      --)       shift; break ;;
      *)        break ;;
    esac
  done
  # Everything left in "$@" is the predicate command.

  # Run the loop in a subshell with errexit OFF, so a failing predicate (the
  # normal "not ready yet" case) never trips the caller's `set -e`.
  (
    set +e
    local frames=( ⠋ ⠙ ⠹ ⠸ ⠼ ⠴ ⠦ ⠧ ⠇ ⠏ )
    local start=$SECONDS i=0 last_poll=-100000 status='' elapsed tty=0
    [ -t 1 ] && tty=1
    while :; do
      elapsed=$(( SECONDS - start ))
      if [ $(( SECONDS - last_poll )) -ge "$poll_every" ]; then
        last_poll=$SECONDS
        if "$@"; then
          [ "$tty" = 1 ] && printf '\r\033[K'
          ok "$label ${C_GREY}(${elapsed}s)${C_RESET}"
          exit 0
        fi
        if [ -n "$abort_fn" ] && "$abort_fn"; then
          [ "$tty" = 1 ] && printf '\r\033[K'
          exit 3
        fi
        [ -n "$status_fn" ] && status="$("$status_fn")"
        [ "$tty" = 0 ] && printf '   … %s  (%ds)\n' "${status:-$label}" "$elapsed"
      fi
      if [ "$elapsed" -ge "$timeout" ]; then
        [ "$tty" = 1 ] && printf '\r\033[K'
        err "$label — timed out after ${timeout}s"
        exit 1
      fi
      if [ "$tty" = 1 ]; then
        printf '\r %s %s  %s%s %s(%ds)%s' \
          "$C_CYAN${frames[i % ${#frames[@]}]}$C_RESET" "$label" \
          "$C_DIM" "$status" "$C_GREY" "$elapsed" "$C_RESET"
        i=$(( i + 1 ))
        sleep 0.2
      else
        sleep "$poll_every"
      fi
    done
  )
}

# ---------------------------------------------------------------------------
# Small shared helpers
# ---------------------------------------------------------------------------
# Decode a key out of a Kubernetes Secret (base64 -> plaintext).
# Uses `openssl base64 -d -A` rather than `base64 -d`: macOS 12 and earlier
# only accept `base64 -D`, while openssl is already a required tool and
# behaves the same everywhere. -A reads the single-line jsonpath output.
ksecret_val() { kubectl -n "$1" get secret "$2" -o jsonpath="{.data.$3}" 2>/dev/null | openssl base64 -d -A; }

# True when the EXACT Ollama model is present in the in-cluster pod.
#
# Matching on the base name is wrong: `qwen2.5:3b` being present doesn't make
# `qwen2.5:7b` usable. Ollama stores an untagged pull as `<name>:latest`, so an
# untagged name is normalised to that. Mirrors _model_present() in
# backend/routers/systemai.py.
ollama_model_present() { # <namespace> <model>
  local ns="$1" model="$2"
  case "$model" in *:*) ;; *) model="${model}:latest" ;; esac
  kubectl -n "$ns" exec deploy/ollama -- ollama list 2>/dev/null \
    | awk 'NR>1 {print $1}' | grep -qxF "$model"
}

# Create a {password: <random>} Secret if it doesn't already exist. Idempotent:
# existing passwords are never rotated, so connection strings stay valid across
# re-runs of setup.sh.
ensure_password_secret() { # <ns> <name>
  local ns="$1" name="$2"
  if ! kubectl -n "$ns" get secret "$name" >/dev/null 2>&1; then
    kubectl -n "$ns" create secret generic "$name" \
      --from-literal="password=$(openssl rand -base64 24 | tr -d '/+=')" >/dev/null
    say "created secret $ns/$name"
  fi
}

# Best-effort detection of this machine's LAN IP.
#
# This matters more than it looks: the Ditto Big Peer ingress host must be
# reachable FROM AN ANDROID PHONE on the same network, so "localhost" is useless
# — the phone would resolve it to itself. We embed the LAN IP in an nip.io
# hostname instead (ditto.192-168-1-23.nip.io style), which resolves from any
# device with no DNS setup.
detect_lan_ip() {
  local ip=''
  if [ "$(uname)" = "Darwin" ]; then
    # Ask the routing table which interface reaches the internet, then read its
    # address — more reliable than guessing en0 vs en1 vs a USB tether.
    local iface
    iface="$(route -n get default 2>/dev/null | awk '/interface:/{print $2; exit}')"
    [ -n "$iface" ] && ip="$(ipconfig getifaddr "$iface" 2>/dev/null || true)"
    [ -z "$ip" ] && ip="$(ipconfig getifaddr en0 2>/dev/null || true)"
  else
    ip="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src") print $(i+1)}')"
    [ -z "$ip" ] && ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
  fi
  printf '%s' "$ip"
}
