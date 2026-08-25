---
name: overview
description: >-
  Compiled project status: git branch/dirtiness, grok-kit profile, handoff,
  recent commits. Use at session start or end, or when the user asks where
  the project stands.
---

# Overview

Stay on top of the repo without dumping skills into always-on rules.

```bash
grok-kit overview --root . --when start|end|now
```

Session bundle (overview + visualise): `/flagship`. Picture only: `/visualise`.

If a host canvas skill is installed, render the JSON there (cards + diagram). Otherwise print mermaid from the JSON in chat. Do not copy the dump into User Rules (KV cache).
