---
name: skill-curator-manual
description: >-
  Quarterly manual skill inventory: find near-duplicates and propose merges.
  Human applies changes. Use when skills sprawl. Do not auto-consolidate with an LLM curator.
disable-model-invocation: true
---

# Skill Curator (manual)

## Procedure

1. List skills under:
   - `~/.cursor/skills/`
   - `~/.agents/skills/`
   - project `.cursor/skills/`
   - this kit `skills/`
2. Group by overlapping descriptions / triggers
3. Propose merges or archives (do not delete without approval)
4. Output a short report:

```markdown
## Keep
## Merge candidates
## Archive candidates
## Actions for human
```

## Pitfalls

- Auto-consolidating with an LLM curator (expensive, opinionated)
- Deleting skills still referenced by AGENTS.md
