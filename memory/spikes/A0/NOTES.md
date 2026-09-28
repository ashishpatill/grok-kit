# A0 — Neon spike notes

## A0.1 schema validation (2026-09-28, local)
- **Env:** PostgreSQL 16 + pgvector 0.8.1 (built from source; apt only
  carried 0.6.0, which lacks `halfvec`).
- `memory/schema/v1.sql` applies cleanly: `memories` table, HNSW index
  (`halfvec_cosine_ops`), GIN index on `text_tsv`, recall-filter indexes,
  `sync_log` table, `updated_at` + `sync_log` triggers — all created.
- **Smoke test (all green):**
  - INSERT → `index_status='staged'`, `embedding IS NULL`, `text_tsv`
    populated, `sync_log` row with `op='insert'`.
  - UPDATE embedding → `index_status='indexed'`, `sync_log` row with
    `op='update'`.
  - Vector recall: `ORDER BY embedding <#> query` returns the row.
  - Full-text recall: `text_tsv @@ plainto_tsquery('english','concise output')`
    matches (`'concis' & 'comparison'`).
- **Local DB for the loop:** database `memory_spike` on this VM's PG16,
  schema already applied. Reuse with
  `sudo -u postgres psql -d memory_spike`.
- **Pending (true exit check):** apply to a real Neon branch — needs a Neon
  connection string (Ashish: share via Secure Vault, or apply manually).

## Next (A0.2)
Seed 5k synthetic + 500 real memories (bot-memory repo, content-hash dedup).
Needs an embedding model for the seed vectors (MiniLM-384 local candidate).
<!-- Append the following section to memory/spikes/A0/NOTES.md (do not wipe local PG notes above). -->

## Neon apply + bench (CEO spike, 2026-09-28)

- **Neon project:** `bimlabz-bot-memory` · branch `p0-spike` · DB `bot_memory`.
- Schema applied on that branch was the **legacy** spike SQL (see `memory/schema/legacy-neon-spike.sql`): `id uuid`, flat `status`, `source_session`/`author`/`origin` columns. Branch authority remains `memory/schema/v1.sql` — daemon/mcp in this tree are adapted to v1; re-apply v1 on a fresh Neon branch when connection string is available.
- **Bench (A0.3 / A0.5):** 5 001 MiniLM-384 halfvec rows; hybrid RRF recall@10 = **0.94**, p95 = **~5.13 ms**. Keyword and vector alone each 0.72. Full numbers in `RESULTS.md`.
- **Decision (A0.6):** **STAY** — see `DECISION.md`.
- **Not done:** 500 real memories from `BIMLabz/bot-memory` (no repo access); nomic-768 A/B (A0.4 deferred).
- Optional generator/bench scripts under `scripts/` targeted the legacy Neon schema; need re-seed for v1 (see `scripts/README.md`).
