#!/bin/bash
# Self-wake helper for launchd StartInterval (Mac host).
# Reads PORT + WAKE_TOKEN from ENV_FILE (default: memory/.env.local next to checkout).
set -euo pipefail
ENV_FILE="${ENV_FILE:-}"
if [[ -z "$ENV_FILE" ]]; then
  SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
  ENV_FILE="${SCRIPT_DIR}/../../.env.local"
fi
if [[ ! -f "$ENV_FILE" ]]; then
  echo "wake.sh: missing ENV_FILE=$ENV_FILE" >&2
  exit 1
fi
# shellcheck disable=SC1090
set -a; source "$ENV_FILE"; set +a
PORT="${PORT:-8787}"
if [[ -z "${WAKE_TOKEN:-}" ]]; then
  echo "wake.sh: WAKE_TOKEN missing in $ENV_FILE" >&2
  exit 1
fi
curl -sf -m 120 -X POST "http://127.0.0.1:${PORT}/wake" \
  -H "Authorization: Bearer ${WAKE_TOKEN}" \
  -H 'content-type: application/json' \
  -d '{"source":"launchd-self-wake"}'
