# A0 bench scripts (legacy schema)

These scripts (`generate_and_embed.mjs`, `regenerate_unique_and_bench.mjs`) were used for the CEO Neon `p0-spike` bench.

**They target the legacy spike schema**, not `memory/schema/v1.sql`:

| Script assumption | v1.sql |
|-------------------|--------|
| `id uuid` / `::uuid` casts | `id TEXT` |
| column `status` (`staged`/`indexed`) | `index_status` + separate `approval` |
| flat `bot_id`, `source_session`, `author`, `origin`, `embedding_model` | fold into `provenance JSONB`; drop `bot_id` column |
| manual / no sync_log triggers assumed | triggers append `sync_log` (`insert`/`update`/`retire`) |
| strength often `1.0` | default **5.0** |

**Do not run against a v1 database without adapting.** Re-seed against v1.sql is an A0.2 follow-up. Historical RESULTS/DECISION stand; numbers were measured on the legacy Neon branch.

## Real corpus scripts (added 2026-09-28)

| Script | Schema | Purpose |
|--------|--------|---------|
| `seed_real_and_bench.mjs` | **legacy** Neon `p0-spike` | Embed + insert `real-corpus.jsonl`, measure hybrid/kw/vec recall@10 |
| `seed_real_v1.mjs` | **v1.sql** | Embed + insert into authoritative schema (run when v1 Neon branch exists) |
| `export_real_memories.py` | n/a | Ashish one-shot exporter from `BIMLabz/bot-memory` (needs private GH access) |

Do not run the legacy seeder against a v1 database.
