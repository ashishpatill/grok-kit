# Spawn contract

Parent writes `.cursor/rlm-state/STATE.md` (see `templates/_shared/rlm-state/STATE.example.md`).

Then compile — do not freehand Task prompts:

```bash
grok-kit state-tools check .cursor/rlm-state/STATE.md
grok-kit state-tools render-spawn .cursor/rlm-state/STATE.md
```

Paste each `contracts[]` string into one child. Depth 1. Children return summaries only.
