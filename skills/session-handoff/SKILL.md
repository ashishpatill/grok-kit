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

```bash
grok-kit session-handoff init --project <slug>
# fill .cursor/handoff.md (replace "(describe)")
grok-kit session-handoff check
```

1. Fill Goal / Done / Decisions / Next steps / Key paths / Open risks / Verify commands.
2. If ICM is available, store a compact summary under topic `handoff-<slug>` (no secrets).
3. Tell the user to `@.cursor/handoff.md` or recall ICM in the next chat.
4. Run `grok-kit flagship --when end` so they see overview + visualise before leaving.
5. Optionally propose durable facts via `/memory-sync` (staged, not auto-applied).

`check` fails while `(describe)` remains, if required headings are missing, or if inline secrets appear.

## Pitfalls

- Dumping full transcripts
- Storing API keys or tokens
- Skipping verify commands
