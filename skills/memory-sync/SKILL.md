---
name: memory-sync
description: >-
  Sync hot MEMORY/USER files into the shared bot memory via MCP propose()
  (human-gated write gates, IDL §12) — propose only, never silent identity
  writes. Use after important durable learnings. Legacy ICM seed path kept
  below.
---

# Memory Sync

## Bot-memory write path (P2.K1) — primary

Durable learnings go to the shared bot memory through the MCP `propose()` tool —
**never** `store()`. `store()` bypasses the write gates; `propose()` routes every
learning through them (IDL §12):

- `type: episodic` or `scope: node_local` → auto-approved, stored immediately.
- `type: procedural`, or `pinned: true` → queued in `proposals` for human review.
- Global `semantic` with ≥2 `grounding_ids` → auto-approved.
- Global `semantic` with <2 `grounding_ids` → queued for curator/human review.

### Namespace mapping (hot-file entry → canonical namespace)

| Hot-file entry kind | Namespace | Type | Scope |
|---|---|---|---|
| preference | `preferences` | semantic | global |
| project learning | `project-<slug>` | semantic | global |
| decision | `decisions-<slug>` | semantic | global |
| resolved error | `errors-resolved-<slug>` | episodic | global |
| session handoff note | `handoff-<slug>` | episodic | node_local |

### Propose call shape

```json
{
  "namespace": "project-grokkit",
  "text": "Atomic learning, one fact per proposal.",
  "metadata": {
    "type": "semantic", "scope": "global",
    "author": "memory-sync", "origin": "memory-sync",
    "grounding_ids": ["<memory-id>", "..."],
    "importance": 5, "strength": 5.0
  }
}
```

Rules:

- One atomic fact per proposal; split compound learnings.
- Recall first; cite `grounding_ids` whenever the learning builds on existing memories.
- A `queued_for_review` decision is success, not failure — the curator/human promotes it.
- Never call `store()` from this skill. Never write secrets.

## Legacy ICM path

The ICM topic seed below is kept for the ICM bridge only. New durable learnings
use the bot-memory write path above.

## When to Use

- First-time ICM seed from hot-pin MEMORY/USER files (`HOT_MEMORY_FILE` / `HOT_USER_FILE`)
- After durable preferences/lessons worth keeping
- When the identity source file changed and User Rules need a slim re-export

## Caps (hot-pin contract)

- Hot MEMORY ≤ 2200 chars; USER ≤ 1375 chars
- Save: preferences, env facts, corrections, conventions, durable completed work
- Skip: trivia, rediscoverable facts, raw logs, session ephemera, content already in identity/AGENTS

## Procedure

1. Read hot `MEMORY.md` and `USER.md` (entries split by `§`) via env paths above
2. Map into ICM topics (via `icm` CLI or MCP tools):
   - `preferences`
   - `workspace-routing`
   - `project-<slug>`
   - `models`
   - `decisions-<slug>` / `errors-resolved-<slug>` as needed
3. Prefer `grok-kit seed-icm` (`scripts/seed-icm-from-memory.sh`) for bulk seed
4. Propose (do not auto-apply) a slim User Rule from the identity source file (≤40 lines)
5. Stage candidates in `PENDING_MEMORY.md` if unsure; ask user to approve

## Pitfalls

- Dual-writing the same hot MEMORY file from multiple agent homes (forbidden)
- Storing secrets
- Dumping the full identity source into Always-Apply rules

## Verification

- `node skills/memory-sync/scripts/propose-smoke.mjs` green (DATABASE_URL set)
- A `queued_for_review` proposal appears in `proposals`; episodic auto-approvals land in `memories`
- ICM recall returns seeded facts (legacy path)
- User approved any User Rule / hot-memory write
