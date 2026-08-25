---
name: flagship
description: >-
  Session start/end bundle: project overview plus visualise so the user
  stays on top of the repo. Use before deep work or after /session-handoff.
---

# Flagship

Cursor and Grok Build flagship look for this repo: status first, picture second.

```bash
grok-kit flagship --when start   # session start
grok-kit flagship --when end     # after handoff
grok-kit flagship --when now
```

1. Run the compiler (JSON + mermaid).
2. If a host canvas skill is available, render that JSON as a status canvas.
3. Otherwise show `/overview` facts and `/visualise` mermaid in chat.
4. Deep session: `/session-handoff`, then `flagship --when end`. If the tree grew, `/code-hygiene` and let the user scrap/fix/keep.

Keep always-on rules byte-stable. This skill is on demand.
