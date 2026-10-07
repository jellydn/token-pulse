#!/usr/bin/env bash
# Start CodexBar on 127.0.0.1:8080, Token Pulse on 127.0.0.1:3000, and one
# Cloudflare tunnel. The tunnel publishes Token Pulse only.
set -euo pipefail
set -m
cd "$(dirname "$0")/.."
tunnel="${1:-myusage}"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

if [[ ! "$tunnel" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,62}$ ]]; then
  printf 'Tunnel name must be one Cloudflare tunnel name.\n' >&2
  exit 1
fi
if [[ -z "${CODEXBAR_DASHBOARD_TOKEN:-}" ]]; then
  printf 'Set CODEXBAR_DASHBOARD_TOKEN in .env before starting.\n' >&2
  exit 1
fi
if curl -fsS -m 1 -o /dev/null http://127.0.0.1:8080/health 2>/dev/null; then
  printf 'CodexBar is already listening on 127.0.0.1:8080. Stop it, then run just again.\n' >&2
  exit 1
fi
if curl -fsS -m 1 -o /dev/null http://127.0.0.1:3000/healthz 2>/dev/null; then
  printf 'Token Pulse is already listening on 127.0.0.1:3000. Stop it, then run just again.\n' >&2
  exit 1
fi

bun run build:css

pids=()
stopped=0
stop_pid() {
  local pid="$1"
  local signal="$2"
  kill "$signal" -- "-$pid" 2>/dev/null || kill "$signal" "$pid" 2>/dev/null || true
}
cleanup() {
  if [[ "$stopped" == 1 ]]; then
    return
  fi
  stopped=1
  if [[ ${#pids[@]} -eq 0 ]]; then
    return
  fi
  local pid
  for pid in "${pids[@]}"; do
    stop_pid "$pid" -TERM
  done
  sleep 1
  for pid in "${pids[@]}"; do
    stop_pid "$pid" -KILL
  done
}
trap cleanup EXIT
trap 'cleanup; exit 130' INT
trap 'cleanup; exit 143' TERM

wait_http() {
  local url="$1"
  local tries="$2"
  local _i
  for _i in $(seq 1 "$tries"); do
    if curl -fsS -m 2 -o /dev/null "$url" 2>/dev/null; then
      return 0
    fi
    sleep 1
  done
  return 1
}

codexbar serve \
  --host 127.0.0.1 \
  --port 8080 \
  --refresh-interval 60 \
  --identity redacted &
pids+=("$!")
if ! wait_http http://127.0.0.1:8080/health 30; then
  printf 'CodexBar did not become ready on 127.0.0.1:8080.\n' >&2
  exit 1
fi

bun --hot src/index.tsx &
pids+=("$!")
if ! wait_http http://127.0.0.1:3000/healthz 45; then
  printf 'Token Pulse did not become ready on 127.0.0.1:3000.\n' >&2
  exit 1
fi

# localhost can resolve to ::1. Token Pulse listens on 127.0.0.1 only.
cloudflared tunnel run --url http://127.0.0.1:3000 "$tunnel" &
pids+=("$!")

printf 'Token Pulse http://127.0.0.1:3000\n'
printf 'Tunnel %s -> http://127.0.0.1:3000\n' "$tunnel"
printf 'CodexBar stays on 127.0.0.1:8080 and is not published.\n'
printf 'Press Ctrl+C to stop.\n'

while true; do
  for pid in "${pids[@]}"; do
    if ! kill -0 "$pid" 2>/dev/null; then
      printf 'A process exited. Stopping the others.\n' >&2
      exit 1
    fi
  done
  sleep 2
done
