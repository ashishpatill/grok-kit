#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
mapfile -t tests < <(find skills scripts -name '*.test.mjs' | sort)
if [[ ${#tests[@]} -eq 0 ]]; then
  echo "no tests found" >&2
  exit 1
fi
node --test "${tests[@]}"
