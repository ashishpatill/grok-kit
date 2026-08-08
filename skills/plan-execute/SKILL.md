---
name: plan-execute
description: >-
  Plan-and-execute playbook: plan mode then agent implement. Use for ambiguous
  multi-file work. Includes replan triggers and parallel-requirement checklists.
---

# Plan Execute

## When to Use

- Ambiguous scope, multi-file features, or architectural choices
- Before expensive Agent loops

## Procedure

### Plan mode checklist (required)

- Goal + non-goals
- Options + recommendation + risks (decision surface)
- Parallel requirements as separate checkboxes (do not collapse OR branches)
- Explore vs mutate boundary (edits wait for approval)
- Verifier (command or acceptance test)
- Budget (max subagents, max passes)
- Replan triggers ("if X fails, stop and ask")

### Execute

1. User approves plan
2. Switch to Agent; implement against checklist
3. If assumptions invalidate → re-Plan (do not grind stale todos)
4. Verify with listed gate; optional `/verifier` subagent

## Pitfalls

- Plan that is already an implementation dump
- Skipping Plan then burning tokens on failed Agent loops
- Reflection without a verifier

## Verification

- Plan saved to workspace if sharing
- Each parallel requirement checked or explicitly deferred
