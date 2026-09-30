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
- [x] **A0.2** Seed data: 5k synthetic + real memories imported (content-hash
  dedup). _Exit: row counts match — honest yield, not invented 500._
  _Closed 2026-09-30: real corpus yield is **~207** (`spikes/A0/real-corpus-full-2026-09-29.jsonl`
  = 207 unique; earlier `real-corpus.jsonl` = 204). Never 500 — private repo
  did not yield that many atomic rows. Seed already on Neon **main**
  (`br-wandering-queen-b8sx7y0a`): baseline ~5206 (= ~5001 synthetic + 204 real)
  then 5214 after X4/X7 spike rows (ITER-006). Do not invent a 500-row import._
- [x] **A0.3** Eval harness: 50 hand-built queries; measure recall@10, p50/p95
  latency. _Exit: harness runs; numbers in `memory/spikes/A0/RESULTS.md`._
  _2026-09-28: hybrid RRF recall@10=0.94, p95=5.13 ms (kw 0.72 / vec 0.72)._
- [x] **A0.4** Embedding A/B: MiniLM-384 (local) vs nomic-768.
  _Exit: both indexed, recall@10 + latency compared._
  _Deferred-closed 2026-09-30: schema stays `halfvec(384)` (MiniLM). No nomic-768
  A/B run (would need dim/migration + large model download). No metrics invented.
  Re-open only if hybrid recall regresses > 0.05 on real corpus._
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
- [x] **G.2** WikiSkill/GEPA docs reconciled (`PLAN-dh-bot-memory.md`,
  `PLAN-dh-bot-memory-gepa.md`). _**RETIRED 2026-09-30:** PLAN-dh-* never landed
  in-tree (searched grok-kit, local bot-memory, BIMLabz/bot-memory, research folders).
  Historical path cites only; authoritative plan is FINAL-PLAN-V2. No Ashish action.
  Evidence: `memory/plan/G2-PLAN-dh-link.md`. No invented PLAN-dh content._

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
- [x] **P1.M8** `full` replica plan on daemon host + weekly pg_dump dry-run notes.
  _2026-09-29: `ops/replica-and-backup.md` + `ops/pg-dump-dry-run.sh`; Neon p1-v1 dump 9 470 271 B / 54 TOC / sha256 0206b8c4…; PITR documented as 6h incident-only; host full-replica install blocked on X1/X2. See ITER-003._
- [x] **P1.M9** Cold-start contract live in recall envelope (already stubbed; conformance tests).
  _2026-09-29: recall MCP/CLI envelope gains `contract` {version,source,index,daemon,last_seq,replica_lag,pending_embeddings}; `npm run contract:smoke` + `cli:smoke` ALL GREEN. See ITER-003._

### Graph track
- [x] **P1.G1** TS orchestrator + blackboard/outbox tables on Neon.
  _2026-09-29: migration `004-blackboard-outbox.sql` applied to Neon p1-v1 (blackboard+outbox verified); `memory/graph/` Orchestrator scaffold + `npm run graph:smoke` ALL GREEN. See ITER-003._
- [x] **P1.G2** Curator client calling memory MCP as `svc:curator`.
  _2026-09-29: CuratorClient + MCP `review_list`/`promote`/`reject_proposal`/`review_decide` (default decided_by=`svc:curator`); `npm run curator:smoke` ALL GREEN. See ITER-004._
- [x] **P1.G3** 3 nodes (grok-coder-01, verifier-01, curator-01) + scripted Moose stand-in.
  _2026-09-29: `graph/nodes.mjs` + `moose-standin.mjs`; orchestrator handler dispatch; `npm run nodes:smoke` ALL GREEN. Real Moose = X6._
- [x] **P1.G4** Stuck-debug round-trip demo recorded.
  _2026-09-29: `npm run demo:stuck-debug` → `graph/demo/stuck-debug-roundtrip.json` (coder stuck → verifier → curator promote → Moose recall). See ITER-004._

### Ops / exit gates
- [x] **P1.X1** Tailscale serve wake on daemon host (replace localhost).
  _2026-09-30: CLI `/Applications/Tailscale.app/Contents/MacOS/Tailscale` (v1.102.4);
  wrappers `/usr/local/bin/tailscale` + `~/bin/tailscale` (exec, not symlink).
  `serve --bg --https=443 → http://127.0.0.1:8789`; smoke
  `https://mac-mini.<tailnet>.ts.net/wake` Bearer WAKE_TOKEN → 200/ok/drained
  (artifact `daemon/launchd/out/x1-tailscale-serve-wake.json`). Helper
  `daemon/scripts/tailscale-serve-wake.sh`. Not funnel. Not X6/A0.4/G.2._
- [x] **P1.X2** launchd unit + timer self-wake on Mac daemon host (not Linux
  systemd on this machine).
  _2026-09-30: `memory/daemon/launchd/` plists + INSTALL.md for checkout
  `/path/to/grok-kit`. Smoke: `smoke-wake.mjs` vs Neon main
  → ok, reconcile_enqueued=3, drained=2, cold_start_ms≈6.5s (artifact
  `launchd/out/x2-wake-smoke.json`). X1 Tailscale serve later checked (see P1.X1)._
- [x] **P1.X3** Conformance suite green.
  _2026-09-29: `ops/conformance.mjs` wraps contract/cli/import/workers/graph/curator/nodes/demo:stuck-debug → `npm run conformance` ALL GREEN 8/8 (~1.6s stub-only). See ITER-005._
- [x] **P1.X4** `kill -9` mid-write → sweeper zero-loss.
  _2026-09-29: stub evidence — commit 8 staged → child SIGKILL → 8/8 survive →
  reconcile+backfill → adminCheckpoint clean. `npm run x4:kill9` + workers:smoke.
  Artifacts: `spikes/X4/out/x4-kill9-sweeper-stub.json`, ITER-006. Also live on Neon **main** (`br-wandering-queen-b8sx7y0a`): `x4-kill9-sweeper-pg.json` (6/6)._
- [x] **P1.X5** Restore drill: pg_dump → fresh branch → checkpoint clean.
  _2026-09-29: Neon branch `p1-x5-restore-20260929` (`br-restless-grass-b8xikkh4`) from p1-v1; schema drop + pg_restore M8 dump → memories=5206 sync_log=5208 staged_null_emb=0; 004 re-applied (dump pre-G1). p1-v1/main untouched. See ITER-004._
- [ ] **P1.X6** Moose real MCP onboarding recorded (end stand-in).
  _Open 2026-09-30: no real Moose MCP found to onboard. Stand-in docs improved
  (`memory/graph/MOOSE-ONBOARDING.md`); G3 `moose-standin.mjs` unchanged.
  Check only when a real Moose MCP round-trip transcript exists._
- [x] **P1.X7** No-gatekeeping spike: two bots concurrent writes to one `feature-*`; evidence-weighing resolution.
  _2026-09-29: stub spike — two bots concurrent `feature-auth-*` writes; evidence-weigh
  picks stronger grounding (identity swap stable); loser superseded + review_items
  resolution. `npm run x7:spike` + `evidence-weigh:smoke`. Artifacts:
  `spikes/X7/out/x7-no-gatekeeping-stub.json`, ITER-006. Also live on Neon **main**: `x7-no-gatekeeping-pg.json`._

## P2 — Integrations (2–3 weeks, serial on P1 gates)

_P1 gates: conformance ✓ · kill-9 zero-loss ✓ (live Neon main, #18) · restore drill ✓ · no-gatekeeping ✓ (live Neon main, #18) · Moose real onboarding (X6) open._

### GrokKit integrations
- [x] **P2.K1** `memory-sync` writes via MCP `propose()` (human-gated; never silent identity writes).
  _2026-09-29: SKILL.md + `propose-smoke.mjs` 8/8; squash-merged #20 (`32b6bd0` / `637fda2`). ITER-007._
- [x] **P2.K2** `session-handoff` emits episodic records on session close.
  _2026-09-30: `close` → MCP propose episodic `handoff-<slug>`; unit 4/4;
  Neon main smoke ALL GREEN (`episodic-smoke.mjs`)._
- [x] **P2.K3** Verify-loop outcomes (`rubric-verify` / `verify-aci`) auto-emit episodic records.
  _2026-09-30: auto-emit episodic `errors-resolved-<slug>`; Neon main smoke
  ALL GREEN (`skills/verify-aci/scripts/episodic-smoke.mjs`)._
- [x] **P2.K4** `refine-harness` cites memory IDs in generated patches.
  _2026-09-30: SKILL.md requires `memory_ids` on each ≤3 patch; `cite-patches.mjs`
  validates opaque TEXT ids (UUID/ULID/`real_`/`syn_`); unit 11/11; Neon main
  recall cite smoke ALL GREEN (`cite-smoke.mjs`, ns=`project-grok-kit`, read-only)._

### Cross-system
- [ ] **P2.C1** Moose onboards behind the frozen IDL v2.1 contract (needs X6); first real cross-system learning promoted and reused.

### Replicas
- [x] **P2.R1** Per-device replica profiles (`hot`/`standard`) live; dynamic sync verified (phone pulls hot-set over Tailscale). Needs X1/X2.
  _2026-09-30: `replica/` SQLite read cache (FTS5 or LIKE fallback); profiles hot/standard (full=P1.M8 not re-claimed);
  `pullSync` from `sync_log WHERE seq > last_token`; `npm run replica:smoke` ALL GREEN (fixture +
  live Neon main hot pull). Evidence `replica/evidence/p2-r1-smoke.json`. Mac dry-run stand-in —
  no physical phone. Phone Tailscale = same pull once device on mesh._

### Safety drill
- [x] **P2.S1** Wrong-learning drill: deliberately propose a plausible-but-false learning → must land in the human queue, never auto-promote. **Exit:** drill passes + Ashish approves gate behavior live.
  _Script GREEN 2026-09-30 on Neon main: proposal `8ad02baf-7c00-4f43-8691-2c959574a791`
  in `project-p2s1-wrong-learning` → `queued_for_review` / `low-evidence`, **not**
  in memories. Left unchecked until Ashish live reject/approve closes the gate._
  _2026-09-30: Ashish asked CEO to decide → **rejected** (`decided_by=ashish-via-ceo`); 0 memories in `project-p2s1-wrong-learning`. Gate PASS._


## P3 — Consolidation + hardening (ongoing) — per plan §14, tracked after P2 gates.


### Thin inter-bot bus (research → TASKS only; no full A2A stack)
_Primitives from research: presence / message / task / wake. Reuse existing daemon
presence + `/wake` scaffolds where they fit. Do **not** invent a full A2A protocol
or multi-vendor agent-to-agent stack in this phase._

- [x] **P3.B1** `presence.heartbeat` — formalize bot/daemon heartbeat surface (align with `memory/daemon/presence.mjs` / PR #21); online check for peers.
  _2026-09-30: `daemon/presence.mjs` reused from #21 shape; migration `005-inter-bot-bus.sql` → Neon **main** (`br-wandering-queen-b8sx7y0a`) created `daemon_presence`; `bus/accept` + `listOnline`; stub+live smoke ALL GREEN (`npm run bus:smoke`). Sync/X1 not claimed._
- [x] **P3.B2** `message.send` — thin contracted message/handoff send (payload: from/to/ask/evidence/`memory_refs`); fail closed on missing evidence; no free-form chat bus.
  _2026-09-30: `bus/messages.mjs` + `bus_messages` table; fail-closed without evidence/`memory_refs`; smoke covers reject + persist._
- [x] **P3.B3** `task.request` / `task.update` / `task.cancel` — minimal task lifecycle on existing blackboard/outbox (004); ids + status only; no workflow engine.
  _2026-09-30: `bus/tasks.mjs` + `bus_tasks`; lifecycle submitted→working→input-required|completed|failed|canceled; mirrors to outbox topic; smoke ALL GREEN._
- [x] **P3.B4** `wake.request` — authenticated daemon wake (`POST /wake` + `WAKE_TOKEN`, X2 launchd); document as the cross-bot nudge primitive.
  _2026-09-30: `bus/wake.mjs` + launchd INSTALL note; mock bearer smoke green. X1 Tailscale serve landed (see P1.X1)._

### Consolidation (Mem0 op-set — plan §7 / §14)
_Sleep-time ADD / UPDATE / DELETE / NOOP apply with bi-temporal `valid_from`/`valid_to`.
Nightly launchd path on Mac; no Tailscale claim. Minimal slice — not ExpeL / Voyager / reflective._

- [x] **P3.C1** Mem0-style ADD / UPDATE / DELETE / NOOP for candidate facts + nightly consolidate path.
  _2026-09-30: `workers/classify.mjs` (pure classify) + strengthened `dedup.mjs` (apply flag) +
  `workers/consolidate.mjs` / `run-consolidate.mjs`; bi-temporal `valid_to` close on DELETE/UPDATE;
  launchd `ai.botmemory.consolidate.plist` @ 02:00 local + INSTALL §5. Stub smoke ALL GREEN
  (`npm run consolidate:smoke`); live Neon **main** (`br-wandering-queen-b8sx7y0a`) disposable ns
  smoke + cleanup. No X1/X6/A0.4/S1._

### Hot-pin export + visible recall (product slices from Muse/Grok/Cursor research)
_Export-only hot pin from Neon; recall cites like Referenced-Chats. Do **not** claim X1/X6/A0.4._

- [x] **P3.H1** Hot-pin export: generate human-editable `MEMORY.md` (+ optional topic index) from Neon pinned/identity memories — CLI under `memory/export/`; inject-index pattern (index in prompt, full topics on demand). Docs: `export/README.md`, `ops/hot-pin-export.md`.
  _2026-09-30: `export/hot-pin.mjs` + `export/index.mjs`; stub smoke ALL GREEN (`npm run export:smoke`); live Neon **main** (`br-wandering-queen-b8sx7y0a`) read-only optional via `--live`. Caps 2200/1375; § separators; no dual-write._
- [x] **P3.V1** Visible recall: MCP/CLI recall envelopes include provenance + memory IDs + short removal path note (Referenced-Chats style). Minimal extend of existing recall surface; smoke green.
  _2026-09-30: `lib/visible-recall.mjs`; MCP + CLI twin shape results with `provenance`/`removal`/`removal_note`; `npm run cli:smoke` + `visible-recall:smoke` ALL GREEN. No X1/X6/A0.4._

### Poison red-team + light reflective stub
_Never silent auto-promote into pinned/identity. Do **not** claim X1/X6/A0.4/G.2._

- [x] **P3.P1** Poisoning red-team smoke (AgentPoison / MINJA-inspired).
  _2026-09-30: `lib/propose-route.mjs` (identity-ns harden: `preferences` →
  `identity-ns-human-always` even unpinned); `spikes/P3P1/poison-redteam.mjs`
  injects adversarial pinned/preferences/procedural/low-evidence candidates →
  human queue; consolidate near-pinned → NOOP; expired poison → DELETE; never
  gains `pinned=true`. Stub ALL GREEN (`npm run poison:smoke`); live Neon **main**
  (`br-wandering-queen-b8sx7y0a`) disposable ns + cleanup. No X1/X6/A0.4/G.2._
- [x] **P3.R1** Light reflective / ExpeL extraction stub (deepen later).
  _2026-09-30: `lib/reflective-stub.mjs` — pure extract; `must_human_gate=true`;
  routed through propose-route (preferences → queued). Not full ExpeL/Voyager._

### ExpeL deepen + mirror_export dry-run
_Never silent auto-promote reflective. Do **not** claim X1/X6/A0.4/G.2._

- [x] **P3.R2** ExpeL / reflective deepen: extraction + usage-voting sketch → propose (human-gated).
  _2026-09-30: `lib/reflective.mjs` (extractInsights + applyUsageVote + propose payload);
  `propose-route` gates `type=reflective` → `reflective-human-always`; stub re-export kept;
  `spikes/P3R2/reflective-expel.mjs` stub ALL GREEN (`npm run reflective:smoke`); optional
  Neon **main** disposable ns + cleanup via `--live`. Not full Voyager / OpenRouter extract._
- [x] **P3.M1** `mirror_export` dry-run: craft-log YAML/JSONL dump for private bot-memory.
  _2026-09-30: `export/mirror.mjs` + `mirror-cli.mjs`; happened/wrong/worked/next; secret
  rows skipped; `--push` refused; stub smoke ALL GREEN (`npm run mirror:smoke`); docs
  `export/README.md` + `ops/mirror-export.md`. No push secrets; dry-run default._



