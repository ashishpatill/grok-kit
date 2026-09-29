#!/bin/bash
# Self-wake helper: POST /wake to the local daemon (used by the systemd timer
# and the launchd self-wake job). Reads PORT and WAKE_TOKEN from the env file.
set -euo pipefail
ENV_FILE="${ENV_FILE:-/opt/bot-memory/grok-kit/memory/.env.local}"
# shellcheck disable=SC1090
set -a; source "$ENV_FILE"; set +a
PORT="${PORT:-8787}"
curl -sf -m 30 -X POST "http://127.0.0.1:${PORT}/wake" \
  -H "Authorization: Bearer ${WAKE_TOKEN}" \
  -H 'content-type: application/json' \
  -d '{"source":"self-wake-timer"}' > /dev/null
