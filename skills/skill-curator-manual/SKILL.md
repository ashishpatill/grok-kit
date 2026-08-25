---
name: skill-curator-manual
description: >-
  Quarterly manual skill inventory: find near-duplicates and propose merges.
  Human applies changes. Use when skills sprawl. Do not auto-consolidate with an LLM curator.
disable-model-invocation: true
---

# Skill Curator (manual)

## Procedure

```bash
grok-kit skill-curator inventory
```

The JSON lists kit skills and `overlap[]` pairs (description Jaccard ≥ 0.45). Optionally `--also ~/.cursor/skills`.

Then:

1. Group remaining near-duplicates by hand
2. Propose merges or archives (do not delete without approval)
3. Output:

```markdown
## Keep
## Merge candidates
## Archive candidates
## Actions for human
```

## Pitfalls

- Auto-consolidating with an LLM curator (expensive, opinionated)
- Deleting skills still referenced by AGENTS.md
