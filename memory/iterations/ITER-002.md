# Iteration 002 — P1.M6: import pipeline (JSONL + content-hash dedup → review queue)

**Task (from `memory/TASKS.md`):** P1.M6 — Import pipeline: bot-memory JSONL +
content-hash dedup → review queue for contradictions.

**Why this task:** After MCP (M4) and CLI twin (M5), the next freeze-plan
deliverable is the bot-memory repo import path. Spike A0 already exported
`real-corpus.jsonl` (204 rows); M6 turns that shape into a durable, gated
ingest with Mem0-style ADD/UPDATE/NOOP/CONTRADICTION ops and a human review
queue for contradictions (§10 honesty model).

## Goal

- Additive migration `003-import-review.sql`: `review_items` table + unique
  expression index on `memories.provenance->>'content_hash'`.
- `memory/import/` package: parse JSONL → classify ops → apply (or dry-run) →
  JSON summary `{added, updated, noop, contradicted, review_ids}`.
- Stub smoke green without Neon; CLI twin smoke still green.
- Do **not** claim Neon applied 003 unless applied (ops note below).

**Done =** `npm run import:smoke` ALL GREEN; TASKS.md P1.M6 checked; branch
pushed + PR against `main`.

## What landed

| Path | Role |
|------|------|
| `memory/schema/migrations/003-import-review.sql` | `review_items` (kind includes `import_contradiction`; status queued/approved/rejected/resolved; decided_*) + `memories_content_hash_uq` |
| `memory/import/hash.mjs` | sha256 content_hash; whitespace+case normalize |
| `memory/import/parse-jsonl.mjs` | JSONL reader matching `spikes/A0/real-corpus.jsonl` |
| `memory/import/ops.mjs` | Deterministic ADD / UPDATE / NOOP / CONTRADICTION (no LLM) |
| `memory/import/apply.mjs` | Apply ops: ADD insert staged; UPDATE insert+supersede; CONTRADICTION → review_items only |
| `memory/import/stub-adapter.mjs` | In-memory adapter for smoke |
| `memory/import/pg-adapter.mjs` | PG adapter (lazy `pg`); snapshot index for classify |
| `memory/import/index.mjs` | CLI `--file` / `--dry-run` / `--import-batch` |
| `memory/import/smoke.mjs` | Fixture: dup hash, material yaml conflict, near-identical twin, replaces, dry-run, CLI process |

**Op rules (M6, deterministic):**
1. exact `content_hash` in DB or batch → **NOOP**
2. same namespace + near-identical normalized text, different `yaml_id` → **CONTRADICTION** (review only)
3. same `yaml_id` / id, different hash → material text diff → **CONTRADICTION**; else **UPDATE**
4. `provenance.replaces` target exists → **UPDATE**
5. else → **ADD**

## Exit check

```
cd memory && npm run import:smoke   # ALL GREEN
cd memory && npm run cli:smoke      # still green (M5)
```

## Ops note — Neon `p1-v1`

Migration **003 was not applied** to Neon in this iteration (no
`DATABASE_URL` used). Apply on the direct (unpooled) connection when ready:

```
psql "$DATABASE_URL_DIRECT" -f memory/schema/migrations/003-import-review.sql
```

Then a real import:

```
DATABASE_URL=... npm run import -- --file spikes/A0/real-corpus.jsonl --import-batch real-corpus-m6
```

## Out of scope (later)

- P1.M7 workers (embed / score / dedup via pg-boss; sim≥0.92 LLM path)
- `review_list` / `review_decide` daemon tools
- Editing frozen IDL prose in `FINAL-PLAN-V2.md`
