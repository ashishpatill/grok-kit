---
name: usage-learn
description: >-
  Identify this user's most-used grok-kit skills and workflows, propose ≤3
  harness adaptations, apply only after consent (--learn / --improve or
  learn apply --i-consent). Use when optimizing the kit to how they actually work.
---

# Usage learn

Local observation only. No file contents, no secrets, no cloud telemetry.

## Consent

```bash
grok-kit install --i-consent --learn            # observe + propose
grok-kit install --i-consent --learn --improve  # also adapt grok-kit.json / project rule
```

`--improve` implies `--learn`. Revoke: `grok-kit consent revoke`.

Without consent, `learn` is a no-op besides printing `consent-required`.

## Compiler

```bash
grok-kit learn record --skill cost-check    # slash skills the CLI does not see
grok-kit learn summarize
grok-kit learn propose --root .
grok-kit learn apply --root . --i-consent   # one-shot even without --improve
```

sessionStart runs `learn tick` after install `--learn`: refresh proposals; with `--improve`, enable optional features in `grok-kit.json` and store workflow bullets there.

## What it may change (after consent)

- Enable optional features you already use (`orchestrate-rlm`, `tell-proof`, `skill-curator`)
- Record frequent workflows on `.cursor/grok-kit.json` (`learned.workflows`)

It does **not** inline those workflows into `.cursor/rules/grok-kit-project.mdc`. That always-on file stays byte-stable so the prompt prefix can be KV-cached.

## What it will not change

- Cursor User Rules / persona
- Kit `SKILL.md` files (that is `/refine-harness`, still human-approve)
- Product MCP, git remotes, other repos' secrets

## Pitfalls

- Treating usage logs as proof of correctness
- Auto-applying skill-text rewrites
- Logging argv that might contain paths or tokens (the compiler does not)
