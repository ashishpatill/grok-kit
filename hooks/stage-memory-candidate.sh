#!/usr/bin/env bash
# Optional stop hook: never auto-merges memory. Emits empty OK JSON for IDE stop hooks.
# Staging is done by the agent via /memory-sync or /session-handoff; this hook is a no-op safety stub.
set -euo pipefail
# Read stdin (hook payload) and discard — fail open
cat >/dev/null || true
printf '%s\n' '{}'
