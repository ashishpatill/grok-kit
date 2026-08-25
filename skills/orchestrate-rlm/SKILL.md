---
name: orchestrate-rlm
description: >-
  RLM-style thin-parent orchestration with summary-only subagents and STATE.md.
  Use for multi-hop, multi-package, or parallelizable work. Depth 1, max 3–5 children.
---

# Orchestrate RLM

## When to Use

- Independent work units (dirs, packages, hypotheses)
- Large scans that would bloat the parent context
- Implement + verify as separate contexts

## Procedure

1. Write `.cursor/rlm-state/STATE.md` using `templates/_shared/rlm-state/STATE.example.md`:
   - GOAL
   - Acceptance checks (commands)
   - Work units (≤5)
   - Budget (max children, max passes)
2. Compile — do not freehand child prompts:

```bash
grok-kit state-tools check .cursor/rlm-state/STATE.md
grok-kit state-tools render-spawn .cursor/rlm-state/STATE.md
```

3. For each `contracts[]` string, spawn a Task/subagent. Depth **1**.
4. Parent merges summaries into STATE.md
5. `grok-kit verify-aci` plus listed gate commands

## Pitfalls

- Never re-ingest child tool dumps into the parent
- Do not use Intelligence parent + `inherit` children for parallel explore (N× cost)
- Skills beat subagents for repeated procedures
- External `rlm(...)`-style admission APIs may return a handle at task start, not the child answer — unlike Cursor Task summary-only returns; poll or use ICM, never assume sync child output

## Verification

- STATE.md updated
- Gate commands run
- Parent chat still thin
