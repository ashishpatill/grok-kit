#!/usr/bin/env bash
# grok-kit ACI. Scripts own the order.
set -euo pipefail

PHASE="${1:-all}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

doctor() {
  command -v git >/dev/null
  git rev-parse --is-inside-work-tree >/dev/null
  command -v node >/dev/null
  node -e 'if (Number(process.versions.node.split(".")[0]) < 18) process.exit(1)'
}

launch() {
  node "$ROOT/scripts/grok-kit.mjs" --help >/dev/null
  node "$ROOT/scripts/grok-kit.mjs" verify-aci --help >/dev/null
  node "$ROOT/scripts/grok-kit.mjs" watch-ci --help >/dev/null
  node "$ROOT/scripts/grok-kit.mjs" rubric-verify --help >/dev/null
  node "$ROOT/scripts/grok-kit.mjs" state-tools --help >/dev/null
  node "$ROOT/scripts/grok-kit.mjs" bootstrap --help >/dev/null
  node "$ROOT/scripts/grok-kit.mjs" apply --help >/dev/null
  node "$ROOT/scripts/grok-kit.mjs" consent --help >/dev/null
  node "$ROOT/scripts/grok-kit.mjs" route-task --help >/dev/null
  node "$ROOT/scripts/grok-kit.mjs" session-handoff --help >/dev/null
  node "$ROOT/scripts/grok-kit.mjs" skill-curator --help >/dev/null
  node "$ROOT/scripts/grok-kit.mjs" learn --help >/dev/null
}

drive() {
  bash "$ROOT/scripts/kit-check.sh"
}

case "$PHASE" in
  doctor) doctor ;;
  launch) launch ;;
  drive) drive ;;
  all) doctor; launch; drive ;;
  *) echo "unknown phase: $PHASE" >&2; exit 64 ;;
esac
