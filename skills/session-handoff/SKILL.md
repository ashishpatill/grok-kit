---
name: session-handoff
description: >-
  End-of-session handoff to .cursor/handoff.md and ICM topic handoff-<slug>.
  Use when finishing deep work or switching tasks so the next chat can resume.
---

# Session Handoff

## When to Use

- End of a deep session
- Task switch / new chat needed
- Before context compaction risk

## Procedure

1. Write gitignored `.cursor/handoff.md`:

```markdown
# Handoff — <project> — <date>

## Goal
## Done
## Decisions
## Next steps (ordered)
## Key paths
## Open risks
## Verify commands
```

2. If ICM is available, store a compact summary under topic `handoff-<slug>` (no secrets).
3. Tell the user to `@.cursor/handoff.md` or recall ICM in the next chat.
4. Optionally propose durable facts via `/memory-sync` (staged, not auto-applied).

## Pitfalls

- Dumping full transcripts
- Storing API keys or tokens
- Skipping verify commands

## Verification

- handoff.md exists and is ≤~80 lines
- Next-step list is actionable
