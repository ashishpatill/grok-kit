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
  test -f skills/watch-ci/scripts/watch-ci.mjs
  test -f skills/verify-aci/scripts/verify-aci.mjs
  test -f skills/rubric-verify/scripts/rubric-verify.mjs
  test -f skills/orchestrate-rlm/scripts/state-tools.mjs
  test -f skills/route-task/SKILL.md
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
