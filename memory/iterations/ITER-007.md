# Iteration 007 — P2.K1 memory-sync writes via MCP propose()

**Task:** P2.K1 — route `memory-sync` durable-learning writes through the MCP
`propose()` write gates (IDL §12). Human-gated; never silent identity writes.
**When:** 2026-09-29 IST · tip base `73b0e64` (main, PR #18).

## Goal
Every durable learning emitted by the `memory-sync` skill passes through the
`propose()` write gates — auto-approved only where the IDL allows, otherwise
queued in `proposals` for curator/human review. `store()` is never used by this
skill (it bypasses the gates).

## Plan
1. `skills/memory-sync/SKILL.md`: add the bot-memory write path — gate table,
   namespace mapping (hot-file entry → canonical namespace), propose call shape,
   and the never-`store()` rule. Legacy ICM path kept, marked legacy.
2. `skills/memory-sync/scripts/propose-smoke.mjs`: drive `memory-mcp` over stdio;
   assert routing for the four cases the skill relies on.
3. Green → commit → PR (no merge without Ashish).

## Exit condition
- [x] SKILL.md documents the propose() path with namespace mapping + gate rules
- [x] propose-smoke 8/8 green against local PG (schema v1 + 002/003/004)
- [x] PR opened, unmerged

## Evidence
`DATABASE_URL=postgres://postgres@127.0.0.1:5433/bot_memory node skills/memory-sync/scripts/propose-smoke.mjs`
→ ALL GREEN: ungrounded semantic → `queued_for_review` (`low-evidence`, row in
`proposals`); episodic → `auto_approved` (row in `memories`); procedural →
`queued_for_review` (`procedural-human-always`); grounded (≥2 grounding_ids)
semantic → `auto_approved`. Test namespace `project-p2k1-smoke` cleaned up.

Local test DB: fresh PG16 + pgvector 0.8.1 (built from source), schema
`v1.sql` + migrations 002/003/004 — all 6 tables present, matching Neon main.

## Out of scope
P2.K2–K4, P2.C1/R1/S1 · ICM path changes · merging (Ashish's call) ·
any writes to Neon (test ran local only).
