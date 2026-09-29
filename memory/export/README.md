# Hot-pin export (P3.H1)

Export **human-editable** hot-pin files from Neon pinned / identity memories.

## Why

Three-layer memory (FINAL-PLAN-V2): hot pin (`MEMORY.md` / `USER.md`) stays
tiny and always-loaded; Neon is the durable long-tail. This tool is the
**export-only** path Neon → hot pin (mirror), not a second write path.

Caps match `skills/memory-sync/SKILL.md`: MEMORY ≤ 2200 chars, USER ≤ 1375.

## Inject-index pattern

1. Put `TOPICS.md` (compact id + preview table) in the agent prompt.
2. On demand, `recall(namespace, query)` or `get(id)` for full bodies.
3. Do **not** paste every memory body into Always-Apply rules.

## Usage

```bash
# Stub / CI (no Neon)
node export/index.mjs --fixture export/fixtures/pinned.json --out-dir /tmp/hot --topics

# Neon main (br-wandering-queen-b8sx7y0a) — read-only SELECT
DATABASE_URL=… node export/index.mjs --out-dir ./export/out --topics

npm run export:hot-pin -- --fixture export/fixtures/pinned.json --out-dir /tmp/hot --topics
npm run export:smoke
```

Outputs: `MEMORY.md`, `USER.md`, optional `TOPICS.md`, `stats.json`.

## Selection rules

- `approval=live`, not superseded, `valid_to` null/future
- `pinned=true` **or** namespace in `preferences` | `workspace-routing` | `models`
- Dedupe by normalized text (strips synthetic `MEMKEY-*` noise)
- Prefer higher `importance`, then earlier `created_at`
- Pack under char caps with `§` separators (seed-icm compatible)

## Safety

- **No secrets** in exports — never store tokens in memories.
- **No dual-write**: edit hot pin → `propose()` back into Neon; one agent home owns the file (`docs/icm-setup.md`).
- Live smoke uses disposable temp dirs; do not commit `export/out/` with live content.

See also: `ops/hot-pin-export.md` (ops pointer).

## mirror_export dry-run (P3.M1)

Craft-log shaped dump for private `BIMLabz/bot-memory` (happened/wrong/worked/next).

```bash
npm run export:mirror -- --fixture export/fixtures/craft-sample.json --out-dir /tmp/mirror
npm run mirror:smoke
```

- Dry-run default; `--push` is **refused** (no secrets to GitHub).
- See `ops/mirror-export.md`.
