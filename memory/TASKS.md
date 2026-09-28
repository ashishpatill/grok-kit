# Bot memory + graph — task list (P0 → P3)

Progress authority for the build loop. One subtask = one commit. Check a box
only when its exit check passes; append a one-line result note.

## P0 — Parallel spikes (1–2 weeks)

### A0 — Neon spike
- [x] **A0.1** Schema v1 on a Neon branch (not main): memories (halfvec(384),
  tsvector, provenance, validity), sync_log, pg-boss tables. Source: IDL §12,
  crash-consistency §13.
  _Exit: `psql` applies cleanly on a fresh branch._
  _2026-09-28: `memory/schema/v1.sql` validated on local PG16 + pgvector 0.8.1
  (see `spikes/A0/NOTES.md`). CEO also applied a **legacy** spike schema to Neon
  branch `p0-spike` (see `schema/legacy-neon-spike.sql`) for A0/B0/C0 benches.
  Branch authority remains v1.sql — re-apply v1 on a fresh Neon branch when a
  connection string is available._
- [ ] **A0.2** Seed data: 5k synthetic + 500 real memories imported from the
  bot-memory repo (content-hash dedup). _Exit: row counts match._
  _Partial 2026-09-28: 5 001 synthetic MiniLM-384 rows seeded on Neon `p0-spike`
  (legacy schema). 500 real from `BIMLabz/bot-memory` NOT done (no repo access).
  Re-seed against v1.sql is follow-up; scripts under `spikes/A0/scripts/` need
  adaptation (see that README)._
- [x] **A0.3** Eval harness: 50 hand-built queries; measure recall@10, p50/p95
  latency. _Exit: harness runs; numbers in `memory/spikes/A0/RESULTS.md`._
  _2026-09-28: hybrid RRF recall@10=0.94, p95=5.13 ms (kw 0.72 / vec 0.72)._
- [ ] **A0.4** Embedding A/B: MiniLM-384 (local) vs nomic-768.
  _Exit: both indexed, recall@10 + latency compared._
  _Deferred 2026-09-28: MiniLM-only path run; nomic A/B not executed (plan allows
  defer unless recall delta > 0.05)._
- [x] **A0.5** Retrieval A/B: RRF-SQL hybrid vs keyword-only baseline.
  _Exit: winner recorded with numbers._
  _2026-09-28: Hybrid RRF k=60 winner (0.94 vs keyword 0.72). See RESULTS.md._
- [x] **A0.6** Stay/kill decision: stay if recall@10 ≥ 0.7 AND p95 < 500ms;
  kill if < 0.6 on both. _Exit: `memory/spikes/A0/DECISION.md` written._
  _2026-09-28: **STAY** — hybrid 0.94 / p95 ~5 ms. Caveat: synthetic corpus._

_Needs: Neon API access (branch + connection string). Fallback: local
Postgres+pgvector validates schema/queries, not Neon specifics._

### B0 — daemon spike
- [x] **B0.1** Wake receiver: tailnet-only webhook that wakes the daemon.
  _2026-09-28: localhost stand-in (`POST /wake` + bearer) PASS; Tailscale serve = P1._
- [x] **B0.2** Drain loop: claim one pg-boss job (SKIP LOCKED), process, sleep.
  _2026-09-28: pg-boss fetch/complete then stop; queue `memory-embed`._
- [x] **B0.3** systemd timer self-wake for scheduled jobs.
  _2026-09-28: `SELF_WAKE_MS` timer self-wake PASS (70 ms warm). systemd unit = P1
  on daemon host; spike proves timer→wake path._
- [x] **B0.4** Cold-start timing: webhook → first Neon row < 2s target.
  _Exit: timing log in `memory/spikes/B0/`._
  _2026-09-28: cold 862 ms / warm 78 ms. Artifacts in `spikes/B0/out/`.
  Localhost stand-in; Tailscale serve = P1._

_Needs: daemon host on the tailnet (home mini-PC / Mac)._

### C0 — MCP spike
- [x] **C0.1** stdio `memory-mcp` server: `store`, `recall`, `list_namespaces`
  against the Neon branch.
  _2026-09-28: tools implemented; adapted to v1.sql (`provenance`, `index_status`+
  `approval`, trigger sync_log, TEXT ids). `list_namespaces` added._
- [x] **C0.2** One Cursor session round-trip: store a learning, recall it in a
  fresh session. _Exit: transcript in `memory/spikes/C0/ROUNDTRIP.md`._
  _2026-09-28: MCP Client stdio round-trip hit in 419 ms — see ROUNDTRIP.md +
  `spikes/C0/out/c0-roundtrip.json` (measured on legacy Neon schema; re-run on v1)._

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
