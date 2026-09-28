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
