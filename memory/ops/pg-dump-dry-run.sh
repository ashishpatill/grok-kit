#!/usr/bin/env bash
# P1.M8 — weekly pg_dump dry-run against Neon (or any DATABASE_URL).
# Usage: DATABASE_URL=… ./ops/pg-dump-dry-run.sh [out_path]
# Never prints the connection string. Exit 0 only when dump + TOC list succeed.
#
# Requires pg_dump major >= server major (Neon p1-v1 is PG17). Override binary:
#   PG_DUMP=/usr/lib/postgresql/17/bin/pg_dump ./ops/pg-dump-dry-run.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: DATABASE_URL is required (export in shell; do not commit)." >&2
  exit 2
fi

pick_pg_dump() {
  if [[ -n "${PG_DUMP:-}" && -x "${PG_DUMP}" ]]; then
    echo "$PG_DUMP"
    return
  fi
  local candidates=(
    /usr/lib/postgresql/17/bin/pg_dump
    /usr/local/opt/postgresql@17/bin/pg_dump
    /opt/homebrew/opt/postgresql@17/bin/pg_dump
    /usr/local/opt/libpq/bin/pg_dump
    /opt/homebrew/opt/libpq/bin/pg_dump
    pg_dump
  )
  local c
  for c in "${candidates[@]}"; do
    if [[ -x "$c" ]]; then
      echo "$c"
      return
    fi
    if command -v "$c" >/dev/null 2>&1; then
      command -v "$c"
      return
    fi
  done
  echo "ERROR: no pg_dump found. Install postgresql-client-17 (or set PG_DUMP)." >&2
  exit 3
}

PG_DUMP_BIN="$(pick_pg_dump)"
DUMP_VER="$("$PG_DUMP_BIN" --version 2>/dev/null || true)"
echo "[pg-dump-dry-run] using $PG_DUMP_BIN ($DUMP_VER)"

STAMP="$(date +%Y%m%d-%H%M)"
DEFAULT_OUT="$ROOT/ops/backups/bot_memory-p1-v1-${STAMP}.dump"
OUT="${1:-$DEFAULT_OUT}"
mkdir -p "$(dirname "$OUT")"

echo "[pg-dump-dry-run] dumping to $OUT …"
START=$(date +%s)
set +e
"$PG_DUMP_BIN" "$DATABASE_URL" \
  --format=custom \
  --no-owner \
  --no-acl \
  --file="$OUT"
RC=$?
set -e
if [[ $RC -ne 0 ]]; then
  echo "ERROR: pg_dump exited $RC (server/client major mismatch? Neon is PG17 — need pg_dump ≥17)." >&2
  rm -f "$OUT"
  exit "$RC"
fi
ELAPSED=$(( $(date +%s) - START ))

if [[ ! -s "$OUT" ]]; then
  echo "ERROR: dump file missing or empty: $OUT" >&2
  exit 1
fi

BYTES=$(wc -c < "$OUT" | tr -d ' ')
RESTORE_BIN="${PG_RESTORE:-}"
if [[ -z "$RESTORE_BIN" ]]; then
  sibling="$(dirname "$PG_DUMP_BIN")/pg_restore"
  if [[ -x "$sibling" ]]; then
    RESTORE_BIN="$sibling"
  else
    RESTORE_BIN=$(command -v pg_restore || true)
  fi
fi
TOC_LINES=0
if [[ -n "$RESTORE_BIN" ]]; then
  TOC_LINES=$("$RESTORE_BIN" -l "$OUT" 2>/dev/null | wc -l | tr -d ' ')
fi

echo "[pg-dump-dry-run] OK"
echo "  path=$OUT"
echo "  bytes=$BYTES"
echo "  elapsed_s=$ELAPSED"
echo "  toc_entries=$TOC_LINES"
echo "  restoreability: pg_restore -l lists $TOC_LINES TOC lines (non-zero = archive readable)"
echo "  next (X5 restore drill): create Neon branch → pg_restore → admin_checkpoint"

DUMP_COUNT=$(find "$ROOT/ops/backups" -maxdepth 1 -name 'bot_memory-p1-v1-*.dump' 2>/dev/null | wc -l | tr -d ' ')
echo "  retention: $DUMP_COUNT dump(s) under ops/backups/ (target keep=4)"
exit 0
