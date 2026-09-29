#!/bin/bash
# Nightly consolidation helper for launchd StartCalendarInterval (Mac host).
# Runs Mem0 ADD/UPDATE/DELETE/NOOP apply against Neon main via workers/run-consolidate.mjs.
# Does NOT require the wake daemon to be up. Does NOT claim Tailscale.
set -euo pipefail
ENV_FILE="${ENV_FILE:-}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MEMORY_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
if [[ -z "$ENV_FILE" ]]; then
  ENV_FILE="${MEMORY_ROOT}/.env.local"
fi
if [[ ! -f "$ENV_FILE" ]]; then
  echo "consolidate.sh: missing ENV_FILE=$ENV_FILE" >&2
  exit 1
fi
# shellcheck disable=SC1090
set -a; source "$ENV_FILE"; set +a
if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "consolidate.sh: DATABASE_URL missing in $ENV_FILE" >&2
  exit 1
fi
export NODE_OPTIONS="${NODE_OPTIONS:---no-network-family-autoselection}"
# Same node as ai.botmemory.daemon.plist (nvm). Override with NODE_BIN.
NODE_BIN="${NODE_BIN:-/Users/<operator>/.nvm/versions/node/v22.23.2/bin/node}"
if [[ ! -x "$NODE_BIN" ]]; then
  NODE_BIN="$(command -v node || true)"
fi
if [[ -z "$NODE_BIN" || ! -x "$NODE_BIN" ]]; then
  echo "consolidate.sh: node not found (set NODE_BIN)" >&2
  exit 1
fi
cd "$MEMORY_ROOT"
ARGS=()
if [[ -n "${CONSOLIDATE_NAMESPACE:-}" ]]; then
  ARGS+=(--namespace="$CONSOLIDATE_NAMESPACE")
fi
if [[ -n "${CONSOLIDATE_LIMIT:-}" ]]; then
  ARGS+=(--limit="$CONSOLIDATE_LIMIT")
fi
exec "$NODE_BIN" workers/run-consolidate.mjs "${ARGS[@]}"
