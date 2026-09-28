# Bot memory + graph — task list (P0 → P3)

Progress authority for the build loop. One subtask = one commit. Check a box
only when its exit check passes; append a one-line result note.

## P0 — Parallel spikes (1–2 weeks)

### A0 — Neon spike
- [ ] **A0.1** Schema v1 on a Neon branch (not main): memories (halfvec(384),
  tsvector, provenance, validity), sync_log, pg-boss tables. Source: IDL §12,
  crash-consistency §13.
  _Exit: `psql` applies cleanly on a fresh branch._
  _In progress 2026-09-28: schema drafted (`memory/schema/v1.sql`) and validated
  locally on PG16 + pgvector 0.8.1 — applies clean, smoke test green
  (see `memory/spikes/A0/NOTES.md`). Neon-branch apply needs a connection string._
- [ ] **A0.2** Seed data: 5k synthetic + 500 real memories imported from the
  bot-memory repo (content-hash dedup). _Exit: row counts match._
- [ ] **A0.3** Eval harness: 50 hand-built queries; measure recall@10, p50/p95
  latency. _Exit: harness runs; numbers in `memory/spikes/A0/RESULTS.md`._
- [ ] **A0.4** Embedding A/B: MiniLM-384 (local) vs nomic-768.
  _Exit: both indexed, recall@10 + latency compared._
- [ ] **A0.5** Retrieval A/B: RRF-SQL hybrid vs keyword-only baseline.
  _Exit: winner recorded with numbers._
- [ ] **A0.6** Stay/kill decision: stay if recall@10 ≥ 0.7 AND p95 < 500ms;
  kill if < 0.6 on both. _Exit: `memory/spikes/A0/DECISION.md` written._

_Needs: Neon API access (branch + connection string). Fallback: local
Postgres+pgvector validates schema/queries, not Neon specifics._

### B0 — daemon spike
- [ ] **B0.1** Wake receiver: tailnet-only webhook that wakes the daemon.
- [ ] **B0.2** Drain loop: claim one pg-boss job (SKIP LOCKED), process, sleep.
- [ ] **B0.3** systemd timer self-wake for scheduled jobs.
- [ ] **B0.4** Cold-start timing: webhook → first Neon row < 2s target.
  _Exit: timing log in `memory/spikes/B0/`._

_Needs: daemon host on the tailnet (home mini-PC / Mac)._

### C0 — MCP spike
- [ ] **C0.1** stdio `memory-mcp` server: `store`, `recall`, `list_namespaces`
  against the Neon branch.
- [ ] **C0.2** One Cursor session round-trip: store a learning, recall it in a
  fresh session. _Exit: transcript in `memory/spikes/C0/ROUNDTRIP.md`._

## Freeze gate (serial — needs Ashish, blocks P1)
- [ ] **G.1** Ashish signs IDL v2.1 (`memory/plan/FINAL-PLAN-V2.md` §12).
  Later changes need written sign-off.
- [ ] **G.2** WikiSkill/GEPA docs reconciled (`PLAN-dh-bot-memory.md`,
  `PLAN-dh-bot-memory-gepa.md`). _Blocked: private `BIMLabz/bot-memory`
  repo not accessible._

## P1 — Prototypes (3–4 weeks, starts after freeze gate)
Tracked here when P0 exits. See plan §14: full schema on Neon main,
`memory-mcp` (all tools) + CLI twin, import pipeline, worker agents,
`full` replica, TS orchestrator + blackboard, 3 nodes + Moose stand-in,
no-gatekeeping concurrency spike, kill -9 + restore drills.

## P2 / P3 — per plan §14, tracked after P1 gates.
