#!/usr/bin/env bash
# Tell + grok-kit ACI. Scripts own the order.
# Visual claims need tell_proof_verify against .cursor/verify/ui-contract.json.
set -euo pipefail

PHASE="${1:-all}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

doctor() {
  command -v git >/dev/null
  git rev-parse --is-inside-work-tree >/dev/null
  command -v node >/dev/null || command -v python3 >/dev/null
  test -f .cursor/verify/ui-contract.json
}

launch() {
  test -f README.md -o -f AGENTS.md
  test -f .cursor/verify/ui-contract.json
}

drive() {
  echo "Replace drive() with this repo's prove-it. Visual claims: tell_proof_verify against .cursor/verify/ui-contract.json (a screenshot is not proof)." >&2
  return 1
}

case "$PHASE" in
  doctor) doctor ;;
  launch) launch ;;
  drive) drive ;;
  all) doctor; launch; drive ;;
  *) echo "unknown phase: $PHASE" >&2; exit 64 ;;
esac
