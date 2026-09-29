---
name: session-handoff
description: >-
  End-of-session handoff to .cursor/handoff.md, ICM topic handoff-<slug>, and
  bot-memory episodic propose() on close (P2.K2). Use when finishing deep work
  or switching tasks so the next chat can resume.
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
grok-kit session-handoff close --project <slug>   # check + episodic emit
```

1. Fill Goal / Done / Decisions / Next steps / Key paths / Open risks / Verify commands.
2. If ICM is available, store a compact summary under topic `handoff-<slug>` (no secrets).
3. Tell the user to `@.cursor/handoff.md` or recall ICM in the next chat.
4. Run `grok-kit flagship --when end` so they see overview + visualise before leaving.
5. If the tree grew, `grok-kit hygiene` and let the user scrap/fix/keep before the next chat.
6. Optionally propose durable facts via `/memory-sync` (propose path, never silent identity writes).

## Bot-memory emit (P2.K2)

`session-handoff close` emits one **episodic** record via MCP `propose()`:

- namespace: `handoff-<slug>`
- type: `episodic`, scope: `node_local` → auto-approved (IDL §12)
- text: compact Goal / Done / Next summary (no secrets)
- skipped when `DATABASE_URL`/`BOT_MEMORY_URL` unset, or `--no-emit` / `MEMORY_EMIT=0`

Never uses `store()`. Never writes secrets.

`check` fails while `(describe)` remains, if required headings are missing, or if inline secrets appear.

## Pitfalls

- Dumping full transcripts
- Storing API keys or tokens
- Skipping verify commands
