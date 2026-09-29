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
  _Partial 2026-09-28: 5 001 synthetic MiniLM-384 on Neon `p0-spike` (legacy).
  Real export DONE (`spikes/A0/real-corpus.jsonl` — 204 unique, not 500).
  Real seed DONE on same Neon branch (204 rows, `author=import:real-corpus`;
  total 5 206). Re-seed against v1.sql still open — use
  `spikes/A0/scripts/seed_real_v1.mjs` when a v1 branch exists._
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
  _Real confirm 2026-09-28: hybrid recall@10=1.00 / p95=11.48 ms on 50 gold
  windows from the 204-row real corpus (see DECISION.md + RESULTS.md)._

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


## Freeze gate (serial)
- [x] **G.1** Ashish signs IDL v2.1 (`memory/plan/FINAL-PLAN-V2.md` §12).
  _Signed 2026-09-28 (chat: "Freeze IDL and P1"). Later signature changes need written sign-off (v2.2+)._
- [ ] **G.2** WikiSkill/GEPA docs reconciled (`PLAN-dh-bot-memory.md`,
  `PLAN-dh-bot-memory-gepa.md`). _Still open if those docs diverge from FINAL-PLAN;
  private repo export used for A0.2 corpus only so far._

## P1 — Prototypes (3–4 weeks) — started 2026-09-28

One subtask = one commit. Check only when exit passes.

### Memory track
- [x] **P1.M1** Apply `schema/v1.sql` on Neon branch `p1-v1` (not production main yet).
  _Exit: `\d memories` shows index_status, approval, provenance; sync_log triggers exist._
  _2026-09-29 Neon p1-v1 has v1 columns + sync_log_
- [x] **P1.M2** Seed 5 001 synthetic + 204 real into v1 branch; row counts match.
  _2026-09-29: 5205 = 5001 synthetic + 204 real_
- [x] **P1.M3** Re-run A0 hybrid bench + C0 MCP round-trip against v1; refresh RESULTS artifacts.
  _2026-09-29: real hybrid recall@10=1.00 p95≈5.18ms_
- [x] **P1.M4** `memory-mcp` full tool surface per IDL §12 (recall hybrid RRF, get, propose path stubs as listed in plan).
  _2026-09-29: 6 tools live (store, recall[hybrid RRF k=60], list_namespaces, get, ingest_file, propose). Propose routing: episodic/node_local auto; procedural/pinned human-always; semantic auto iff grounding_ids>=2 else queued (proposals table, migration 002; v1.sql untouched). Verified 23/23 green via `mcp/test-surface.mjs` against local PG16 + pgvector 0.8.1 seeded with the 204-row real corpus (MiniLM-384). Daemon-facing promote/supersede/review/decide/stats → M6/M7/G2._
- [x] **P1.M5** CLI twin for store/recall/list_namespaces (same contract as MCP).
  _2026-09-29: `memory/cli/` twin (store/recall/list_namespaces) + stub smoke green (`npm run cli:smoke`); envelopes match MCP._
- [x] **P1.M6** Import pipeline: bot-memory JSONL + content-hash dedup → review queue for contradictions.
  _2026-09-29: `memory/import/` (hash/parse/ops/apply/CLI) + migration 003 (`review_items` + `memories_content_hash_uq`); stub smoke ALL GREEN (`npm run import:smoke`); Neon apply of 003 still ops step on p1-v1._
- [x] **P1.M7** Workers: embed, score, dedup (pg-boss); daemon drains on wake.
  _2026-09-29: `memory/workers/` (embed MiniLM halfvec, score heuristic|OpenRouter, dedup ADD/UPDATE→review) + `lib/embed.mjs`; daemon wake = reconcile NULL embeddings → drain batch via dispatch; stub smoke `npm run workers:smoke`. Neon backfill of staged import rows = ops wake against p1-v1._
- [ ] **P1.M8** `full` replica plan on daemon host + weekly pg_dump dry-run notes.
- [ ] **P1.M9** Cold-start contract live in recall envelope (already stubbed; conformance tests).

### Graph track
- [ ] **P1.G1** TS orchestrator + blackboard/outbox tables on Neon.
- [ ] **P1.G2** Curator client calling memory MCP as `svc:curator`.
- [ ] **P1.G3** 3 nodes (grok-coder-01, verifier-01, curator-01) + scripted Moose stand-in.
- [ ] **P1.G4** Stuck-debug round-trip demo recorded.

### Ops / exit gates
- [ ] **P1.X1** Tailscale serve wake on daemon host (replace localhost).
- [ ] **P1.X2** systemd unit + timer self-wake on daemon host.
- [ ] **P1.X3** Conformance suite green.
- [ ] **P1.X4** `kill -9` mid-write → sweeper zero-loss.
- [ ] **P1.X5** Restore drill: pg_dump → fresh branch → checkpoint clean.
- [ ] **P1.X6** Moose real MCP onboarding recorded (end stand-in).
- [ ] **P1.X7** No-gatekeeping spike: two bots concurrent writes to one `feature-*`; evidence-weighing resolution.

## P2 / P3 — per plan §14, tracked after P1 gates.
