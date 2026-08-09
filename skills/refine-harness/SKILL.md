---
name: refine-harness
description: >-
  Human-gated harness refinement. Propose ≤3 evidence-backed ICM/skill patches
  after a trajectory. Never auto-apply; never mutate base User Rules.
disable-model-invocation: true
---

# Refine Harness (gated)

## When to Use

- After a successful or painful trajectory with a clear reusable lesson
- When a skill/procedure should be tightened with evidence

## Procedure

1. Review what worked / failed (cite paths, commands, outcomes)
2. Propose **≤3** patches, each with:
   - Target (ICM topic / skill path / project AGENTS line)
   - Evidence quote
   - Exact proposed text
   - Risk if wrong
3. Stop. Wait for human approve/reject.
4. On approve, apply only the accepted patches.

## Why gated

Some companion runtimes auto-mutate harness state (prompts, skills, memory, sub-agents) from their own trajectory. This skill is the **gated** counterpart: ≤3 evidence-backed proposals, human approve/reject, no auto-apply, no base User Rules mutation.

## Hard bans

- Unsupervised skill mutation
- Rewriting base User Rules / identity source
- More than 3 proposals per run
- "Improvements" without evidence from this trajectory

## Verification

- Human decision recorded
- Applied patches are tiny and reversible (git)
