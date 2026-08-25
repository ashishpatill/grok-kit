---
name: rubric-verify
description: >-
  Use when scoring a diff against a short repo-grounded checklist after
  implement, or when a verifier needs mechanical evidence before judgment.
---

# Rubric Verify

Cheap, repo-grounded, mechanical first. Not a multi-model debate.

## Procedure

1. Write or reuse a checklist (`templates/_shared/rubric/checklist.example.json`). Items must cite paths, commands, or diff patterns from **this** repo — not generic style nits.
2. Run:

```bash
node "$SKILL_DIR/scripts/rubric-verify.mjs" --rubric <file.json> [--diff patch] [--root <repo>]
```

3. Mechanical kinds (`path-exists`, `diff-path`, `diff-excludes`, `grep-worktree`, `command`) are scored by the script.
4. `judgment` items go to the `verifier` agent (Composer). Escalate a second model only for a one-way door where must-items disagree with a human.

`ok` is false iff any **must** item failed. `should` failures warn. `--dry-run` skips `command` items.

## Pitfalls

- 40-item style rubrics (use the formatter)
- Cross-model judges as the default
- Claims that cannot be checked against this diff
