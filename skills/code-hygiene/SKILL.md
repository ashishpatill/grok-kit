---
name: code-hygiene
description: >-
  Rank stale, unused, and low-quality code so the user can read it and
  decide scrap, keep, or fix. Use when fighting code drift, cleaning a
  repo, or before a session ends with a larger tree than it started.
---

# Code hygiene

Compiler ranks drift. You decide. The agent explains; it does not silent-delete.

```bash
grok-kit hygiene --root .
grok-kit hygiene --explain path/to/file
grok-kit hygiene --short
```

Aliases: `drift`, `scrap`, `code-hygiene`. Optional `--write` is gitignored.

1. Run the compiler (JSON + mermaid).
2. Follow `readLoop` in the JSON. Details: `references/read-loop.md`.
3. Present at most 3 findings. For each file: say what it does, why it looks stale or low quality, then offer **scrap / fix / keep**.
4. Edit only what the user chose. Prove with `/verify-aci` (or the repo prove-it).
5. Leave this skill after the batch; do not dump findings into always-on rules.

Pin cheap/Composer for the read pass. If a host deslop or code-quality skill exists, use it only on files the user already approved.
