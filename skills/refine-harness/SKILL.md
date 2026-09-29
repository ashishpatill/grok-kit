---
name: refine-harness
description: >-
  Human-gated harness refinement. Propose ≤3 evidence-backed ICM/skill patches
  after a trajectory. Each patch must cite recalled memory IDs (P2.K4). Never
  auto-apply; never mutate base User Rules.
disable-model-invocation: true
---

# Refine Harness (gated)

## When to Use

- After a successful or painful trajectory with a clear reusable lesson
- When a skill/procedure should be tightened with evidence

## Procedure

1. Review what worked / failed (cite paths, commands, outcomes).
2. **Recall first** from bot-memory (`recall` on relevant namespaces). Collect
   the memory UUIDs that ground the lesson — do not invent IDs.
3. Propose **≤3** patches, each with:
   - Target (ICM topic / skill path / project AGENTS line)
   - Evidence quote (from this trajectory)
   - Exact proposed text
   - Risk if wrong
   - **`memory_ids`** — ≥1 recalled memory UUID (required; P2.K4)
4. When the same procedure was skipped or narrated twice in this trajectory, prefer proposing a **script** (compiled steps) over more skill prose.
5. Stop. Wait for human approve/reject.
6. On approve, apply only the accepted patches.

### Patch shape (P2.K4)

```json
{
  "target": "skills/example/SKILL.md",
  "evidence": "Trajectory quote / command outcome",
  "proposed": "Exact replacement or addition text",
  "risk": "What breaks if this is wrong",
  "memory_ids": ["<uuid-from-recall>", "..."]
}
```

Use `skills/refine-harness/scripts/cite-patches.mjs` (`buildPatches` /
`formatPatchProposals` / `citeFromRecall`) to validate before presenting.
A patch without `memory_ids` is rejected — authority comes from cited
shared learnings, not vibes (plan §2.12).

## Why gated

Some companion runtimes auto-mutate harness state (prompts, skills, memory, sub-agents) from their own trajectory. This skill is the **gated** counterpart: ≤3 evidence-backed proposals, human approve/reject, no auto-apply, no base User Rules mutation.

`/usage-learn` is a different loop: it observes local CLI/slash **names** after `install --learn` and may adapt **only** `.cursor/grok-kit.json` feature flags + generated project-rule workflow bullets after `install --improve` or `grok-kit learn apply --i-consent`. Skill-text still goes through this skill.

## Hard bans

- Unsupervised skill mutation
- Rewriting base User Rules / identity source
- More than 3 proposals per run
- "Improvements" without evidence from this trajectory
- Patches that omit `memory_ids` (ungrounded)

## Verification

- Human decision recorded
- Applied patches are tiny and reversible (git)
- `node --test skills/refine-harness/scripts/cite-patches.test.mjs` green
- `node skills/refine-harness/scripts/cite-smoke.mjs` green (optional live recall when `DATABASE_URL` set)
