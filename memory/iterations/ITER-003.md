# Iteration 003 — P1.M8 / P1.M9 / P1.G1

**Tasks:** M8 full replica + weekly pg_dump dry-run · M9 cold-start contract live · G1 TS orchestrator + blackboard/outbox.

**When:** 2026-09-29 IST · tip base `f6d7084` (M7 / PR #13).

---

## P1.M8 — exit evidence

### Deliverables

| Path | Role |
|------|------|
| `memory/ops/replica-and-backup.md` | Full replica plan; weekly dump rhythm (retention 4w); Neon backup branch before migrations; PITR = 6h incident-only |
| `memory/ops/pg-dump-dry-run.sh` | Dry-run script (`DATABASE_URL` + optional `PG_DUMP`); never prints secrets |
| `memory/ops/backups/` | Gitignored landing zone for dumps |

### Dry-run (Neon `p1-v1`)

- Project `cold-lab-97058535`, branch `br-wandering-queen-b8sx7y0a`, db `bot_memory`
- `DATABASE_URL` from Neon MCP `get_connection_string` (direct host, no password in git/PR)
- Mac Homebrew `pg_dump` 14.x refuses Neon PG17 → used EDB PG17.5 client binaries locally (`PG_DUMP=…/pgsql/bin/pg_dump`)
- Also verified once from agent box with Debian `postgresql-client-17` (same TOC shape)

```
[pg-dump-dry-run] OK
  path=ops/backups/bot_memory-p1-v1-20260929-2205.dump
  bytes=9470271
  elapsed_s=126
  toc_entries=54
  dumped from: 17.11 (8a81ecb)
  dumped by: pg_dump 17.5
  sha256: 0206b8c4f066e5ed0cf1c27f78649db1a8689aaedf2e8f0786b03fcc48031439
```

`pg_restore -l` lists memories / proposals / review_items / sync_log + vector extension — archive readable (restoreability smoke). Full restore drill = **X5** (not claimed here).

### Blocked (not M8)

- Host `full` replica install + Tailscale/systemd → **X1/X2** (no always-on daemon host yet)
- X3–X7 unchanged

---

## P1.M9 — cold-start contract (this iteration)

Recall envelope gains live `contract` fields (index warm/cold, daemon hint, `last_seq`, `replica_lag`) per plan §8 / §13.5. Stub + MCP/CLI smoke assert them.

---

## P1.G1 — graph scaffold (this iteration)

Migration `004-blackboard-outbox.sql` + minimal TS/JS orchestrator read/write blackboard + outbox; apply to Neon **p1-v1 only**; smoke green.

## P1.G1 — exit evidence

| Path | Role |
|------|------|
| `memory/schema/migrations/004-blackboard-outbox.sql` | Additive blackboard + outbox |
| `memory/graph/{types,store,orchestrator}.ts` | TS orchestrator scaffold (Node strip-types) |
| `memory/graph/smoke.mjs` | Stub smoke (+ optional `--live`) |

Neon **p1-v1 only** (not main): tables `blackboard`, `outbox` present; MCP transaction insert→claim→done→cleanup OK.

```
npm run graph:smoke   # ALL GREEN (stub)
```

Mac→Neon pooled TCP intermittently ETIMEDOUT in this session; live path soft-skips. Schema + round-trip confirmed via Neon MCP.
