# Iteration 001 — P1.M4: memory-mcp full tool surface

**Task (from `memory/TASKS.md`):** P1.M4 — `memory-mcp` full tool surface per IDL §12
(recall hybrid RRF, get, propose path stubs as listed in plan).

**Why this task:** P1.M1–M3 need the Neon connection string (Ashish's Mac only —
blocked for this agent). P1.M4 is the first unblocked P1 subtask; develop and
verify against local PG16 + pgvector, then carry to Neon in P1.M3.

## Goal

`memory-mcp` exposes the IDL §12 tool surface and every tool is verified green
against a local PG16 + pgvector database running `schema/v1.sql`:
- `recall` upgraded from keyword-only to hybrid RRF (k=60 fusion, per A0 results)
- `get` — fetch one memory by id
- `ingest_file` — bot-facing file-drop path (base64 → chunks → staged memories)
- `propose` — routing stub implementing the plan's write gates:
  episodic/node-local → auto-approve (store immediately);
  procedural/pinned → human-always (queued);
  global semantic → auto-approve iff ≥2 grounding_ids (IDL min_evidence_auto),
  else queued. Queue persisted in new `proposals` table (migration 002 —
  v1.sql itself is NOT edited; the frozen IDL is untouched).
- Existing `store`, `list_namespaces` unchanged and re-verified.

**Done =** all six tools exercised end-to-end through the real MCP stdio
server against local PG16; TASKS.md P1.M4 checked with a result note;
committed + pushed on `feat/bot-memory-p1` (no merge — Ashish merges).

## Loop

1. Finish local PG16 + pgvector setup; apply `v1.sql` (+ migration 002) to a
   fresh local DB.
2. Implement one tool at a time in `memory/mcp/index.mjs`; `node --check` after
   each.
3. Write `memory/mcp/test-surface.mjs`: drives the built server over stdio
   (store → recall → get → ingest_file → propose-auto → propose-queued →
   list_namespaces), asserts shapes and statuses.
4. Seed the 204-row real corpus locally (MiniLM embeddings) so hybrid recall
   is exercised on real data.
5. Run the test; fix failures; re-run until green.
6. Commit (one commit), push branch, check P1.M4 in TASKS.md with result note.
7. Report: what landed, what remains (daemon-facing tools → M6/M7/G2).

## Plan

- `memory/schema/migrations/002-proposals.sql` — proposals table
  (id, namespace, type, scope, text, importance, strength, pinned,
  grounding_ids, provenance, status pending/approved/rejected, decided_by/at).
- `memory/mcp/index.mjs`:
  - lazy MiniLM embedder (already a dependency) for the query vector leg;
  - `recall`: RRF-SQL hybrid (kw leg: tsvector+ts_rank_cd; vec leg: halfvec
    cosine on indexed rows; FULL OUTER JOIN, 1/(60+rnk) fusion); staged rows
    contribute keyword-only; envelope gains `legs` detail;
  - `get`: SELECT by id (any approval state; surfaced in payload);
  - `ingest_file`: base64 decode → paragraph chunking (≤2000 chars) →
    one staged memory per chunk, provenance.origin='ingest_file';
  - `propose`: routing per write gates above; auto path reuses the store
    insert; queue path inserts into proposals.
- `memory/mcp/test-surface.mjs` — stdio end-to-end assertions.
- Docs: TASKS.md result note; MCP header comment updated to P1.

**Out of scope (later subtasks):** promote/reject_proposal, supersede,
resolve_contradiction, recordUsage, review_list/review_decide,
admin_checkpoint, stats, remember (→ P1.M6/M7, P1.G2); CLI twin (→ P1.M5);
Neon runs (→ P1.M1–M3, needs Ashish's connection string).
