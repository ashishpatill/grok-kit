---
name: memory-sync
description: >-
  Sync hot MEMORY/USER files into ICM topics and propose slim User Rule
  exports from the identity source file. Human-gated — propose only, never
  silent identity writes. Use when seeding ICM or after important durable learnings.
---

# Memory Sync

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
3. Prefer `scripts/seed-icm-from-memory.sh` for bulk seed
4. Propose (do not auto-apply) a slim User Rule from the identity source file (≤40 lines)
5. Stage candidates in `PENDING_MEMORY.md` if unsure; ask user to approve

## Pitfalls

- Dual-writing the same hot MEMORY file from multiple agent homes (forbidden)
- Storing secrets
- Dumping the full identity source into Always-Apply rules

## Verification

- ICM recall returns seeded facts
- User approved any User Rule / hot-memory write
