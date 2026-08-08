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

1. Write `.cursor/rlm-state/STATE.md` with:
   - GOAL
   - Acceptance checks (commands)
   - Work units (≤5)
   - Budget (max children, max passes)
2. For each unit, spawn a Task/subagent with this contract:

```text
goal: <one sentence>
context:
  - absolute paths
  - constraints / non-goals
  - verify command
  - definition of done
return: ≤N bullets + paths + open risks (no raw dumps)
model: pin cheap/composer for explore; inherit only for judgment-heavy implement
```

3. Parent merges summaries into STATE.md
4. Run gate commands (`test` / `lint`)
5. Depth **1** — children must not spawn grandchildren unless map-reduce was requested

## Pitfalls

- Never re-ingest child tool dumps into the parent
- Do not use Intelligence parent + `inherit` children for parallel explore (N× cost)
- Skills beat subagents for repeated procedures

## Verification

- STATE.md updated
- Gate commands run
- Parent chat still thin
