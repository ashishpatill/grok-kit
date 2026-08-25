# Spawn contract

Parent writes `.cursor/rlm-state/STATE.md` (see `templates/_shared/rlm-state/STATE.example.md`).

Then compile — do not freehand Task prompts:

```bash
node skills/orchestrate-rlm/scripts/state-tools.mjs check .cursor/rlm-state/STATE.md
node skills/orchestrate-rlm/scripts/state-tools.mjs render-spawn .cursor/rlm-state/STATE.md
```

Paste each `contracts[]` string into one child. Depth 1. Children return summaries only.
