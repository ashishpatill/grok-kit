---
name: route-task
description: >-
  Use when choosing how to start a bug, feature, investigation, or ship /
  merge-ready request. Maps onto grok-kit skills; not a sticky mode.
---

# Route Task

Pick a row, **leave this skill**, run the mapped scripts. Do not stay here copying todos.

| Intent | Sequence (compiled) |
|--------|---------------------|
| bug | reproduce → `debugger` (stop after 2 hypotheses) → `verify-aci --phase drive` → `rubric-verify` |
| feature | `/plan-execute` (approve) → implement → `rubric-verify` → `verify-aci --phase all` |
| investigate | `researcher` (summary only). If >1 package: `/orchestrate-rlm` + `state-tools check` |
| ship | `verify-aci --phase all` → `rubric-verify` → `watch-ci --status-once`. Stop at human approval. Do not merge unless asked. |

Details: `references/sequences.md`.

Cost: `/cost-check` before a large run. Memory: `/session-handoff` when the session is deep.
