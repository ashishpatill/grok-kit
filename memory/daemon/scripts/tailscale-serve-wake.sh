#!/bin/bash
# P1.X1 — wire Tailscale Serve HTTPS → localhost daemon /wake (tailnet-only).
# Prefer full CLI path; optional wrappers: /usr/local/bin/tailscale and ~/bin/tailscale.
set -euo pipefail
TS_BIN="${TS_BIN:-/Applications/Tailscale.app/Contents/MacOS/Tailscale}"
if [[ ! -x "$TS_BIN" ]]; then
  echo "missing Tailscale CLI: $TS_BIN" >&2
  exit 1
fi
ENV_FILE="${ENV_FILE:-}"
if [[ -z "$ENV_FILE" ]]; then
  SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
  ENV_FILE="${SCRIPT_DIR}/../../.env.local"
fi
PORT=8787
if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  set -a; source "$ENV_FILE"; set +a
  PORT="${PORT:-8787}"
fi
echo "Serving HTTPS :443 → http://127.0.0.1:${PORT} (tailnet-only; not funnel)"
"$TS_BIN" serve --bg --https=443 "http://127.0.0.1:${PORT}"
"$TS_BIN" serve status
DNS="$("$TS_BIN" status --json | python3 -c "import sys,json; print(json.load(sys.stdin)['Self']['DNSName'].rstrip('.'))")"
echo "Wake URL shape: https://${DNS}/wake"
echo "POST with Authorization: Bearer \$WAKE_TOKEN (from memory/.env.local)"
