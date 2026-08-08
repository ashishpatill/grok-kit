#!/usr/bin/env bash
# Seed ICM topics from hot MEMORY.md / USER.md (split on §).
# Required: HOT_MEMORY_FILE and HOT_USER_FILE point at your hot-pin files.
set -euo pipefail

MEMORY="${HOT_MEMORY_FILE:?Set HOT_MEMORY_FILE to your MEMORY.md path}"
USERF="${HOT_USER_FILE:?Set HOT_USER_FILE to your USER.md path}"
ICM_BIN="${ICM_BIN:-$HOME/.local/bin/icm}"
[[ -x "$ICM_BIN" ]] || ICM_BIN="$(command -v icm || true)"

if [[ -z "${ICM_BIN}" ]]; then
  echo "icm not found. Install first: see docs/icm-setup.md" >&2
  exit 1
fi

store() {
  local topic="$1"
  local content="$2"
  [[ -z "${content//[[:space:]]/}" ]] && return 0
  "$ICM_BIN" store --no-embeddings -t "$topic" -c "$content" -i medium
}

seed_file() {
  local file="$1"
  local default_topic="$2"
  [[ -f "$file" ]] || { echo "missing $file"; return 0; }
  local entry
  local rest
  rest="$(cat "$file")§"
  while [[ -n "$rest" ]]; do
    entry="${rest%%§*}"
    if [[ "$rest" == *"§"* ]]; then
      rest="${rest#*§}"
    else
      rest=""
    fi
    entry="$(printf '%s' "$entry" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
    [[ -z "$entry" ]] && continue
    topic="$default_topic"
    if printf '%s' "$entry" | grep -qiE 'workspace|routing|Projects with own AGENTS|lives at'; then
      topic="workspace-routing"
    elif printf '%s' "$entry" | grep -qiE 'model providers|Default:'; then
      topic="models"
    elif printf '%s' "$entry" | grep -q 'DiskSense'; then
      topic="project-disksense"
    elif printf '%s' "$entry" | grep -q 'OpenHarness'; then
      topic="project-openharness"
    elif printf '%s' "$entry" | grep -q 'MindBridge'; then
      topic="project-mindbridge"
    elif printf '%s' "$entry" | grep -qiE 'prefer|Hardware|Commits|macOS'; then
      topic="preferences"
    fi
    echo "→ $topic (${#entry} chars)"
    store "$topic" "$entry" || true
  done
}

echo "Seeding from $MEMORY"
seed_file "$MEMORY" "workspace-routing"
echo "Seeding from $USERF"
seed_file "$USERF" "preferences"
echo "Done. Try: icm recall --no-embeddings \"workspace\""
