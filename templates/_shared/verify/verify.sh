#!/usr/bin/env bash
# Project-local artifact interface. Scripts own the order; the model owns judgment.
# Phases: doctor (can we run?) → launch (does it start?) → drive (one golden path).
set -euo pipefail

PHASE="${1:-all}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

doctor() {
  command -v git >/dev/null
  git rev-parse --is-inside-work-tree >/dev/null
  command -v node >/dev/null || command -v python3 >/dev/null
}

launch() {
  # Replace with: dev server health, CLI --help, or import check.
  test -f README.md -o -f AGENTS.md
}

drive() {
  # Replace with the command that proves the claimed change.
  # Leaving this as a hard fail prevents a bootstrap from looking green.
  echo "Replace drive() in .cursor/verify/verify.sh with this repo's prove-it command." >&2
  return 1
}

case "$PHASE" in
  doctor) doctor ;;
  launch) launch ;;
  drive) drive ;;
  all) doctor; launch; drive ;;
  *) echo "unknown phase: $PHASE" >&2; exit 64 ;;
esac
