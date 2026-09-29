# Iteration 004 — P1.G2 / G3 / G4 / X5

**Tasks:** G2 curator client as `svc:curator` · G3 3 nodes + Moose stand-in · G4 stuck-debug demo · X5 restore drill.

**When:** 2026-09-29 IST · tip base `d3d28f1` (M8/M9/G1 / PR #14).

---

## P1.G2 — exit evidence

| Path | Role |
|------|------|
| `memory/lib/curator-decide.mjs` | Shared promote / reject / review_decide (SQL) |
| `memory/graph/curator-client.mjs` | Client stamps `svc:curator` |
| `memory/graph/stub-memory-port.mjs` | Stub MemoryPort for smokes |
| `memory/mcp/index.mjs` | Tools: `review_list`, `promote`, `reject_proposal`, `review_decide` |

```
npm run curator:smoke   # ALL GREEN (stub)
```

---

## P1.G3 — exit evidence

| Path | Role |
|------|------|
| `memory/graph/nodes.mjs` | grok-coder-01, verifier-01, curator-01 + handlers |
| `memory/graph/moose-standin.mjs` | Scripted Moose over MemoryPort/MCP tools |
| Orchestrator | handler dispatch + `drain()` + `to_node` preference |

```
npm run nodes:smoke   # ALL GREEN
```

---

## P1.G4 — exit evidence

Scripted stuck-debug path: blackboard goal → stuck task → coder handoff → verifier fail + propose → curator promote as `svc:curator` → Moose recall.

Artifact: `memory/graph/demo/stuck-debug-roundtrip.json`

```
npm run demo:stuck-debug   # ALL GREEN
```

---

## P1.X5 — restore drill

1. Neon branch **`p1-x5-restore-20260929`** (`br-restless-grass-b8xikkh4`) created from **p1-v1** (not main; p1-v1 untouched).
2. CoW verify matched p1-v1: memories=5206, sync_log=5208, review_items=2, **staged_null_emb=0** (checkpoint clean).
3. Dropped schema on restore branch only; **`pg_restore`** of M8 dump (`bot_memory-p1-v1-20260929-2200.dump`, TOC 54, 0 restore errors) → same row counts, staged_null_emb=0.
4. Dump predated G1 → re-applied migration **004** (blackboard/outbox empty tables) on restore branch after restore.
5. **Still needed for full ritual:** post-G1 dump (include blackboard/outbox data) in weekly ops; optional delete of `p1-x5-restore-*` branches after review.

p1-v1 + main **not** modified by restore.

---

## Skipped / blocked (honest)

| Item | Status |
|------|--------|
| X1 Tailscale serve | Blocked — no always-on daemon host |
| X2 systemd unit | Blocked — same |
| X3 conformance suite | Open — no full suite yet beyond per-track smokes |
| X4 kill -9 sweeper | Open — not run this session |
| X6 real Moose MCP | Open — stand-in only (G3) |
| X7 no-gatekeeping spike | Open — not started |
| G.2 wiki docs reconcile | Light pass only if docs cheap; still open if PLAN-dh-* diverge |
