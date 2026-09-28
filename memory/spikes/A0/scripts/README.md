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
