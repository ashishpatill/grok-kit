---
name: visualise
description: >-
  Picture of project status (mermaid; host canvas if available). Use with
  /overview or /flagship at session start or end so the user can see the repo.
---

# Visualise

```bash
grok-kit visualise --root .
```

Same compiler as `/overview` (`--mode visualise`). Prefer a host canvas skill for the visual look. Fallback is the mermaid in the JSON. Do not write the diagram into always-on `.mdc` files.
