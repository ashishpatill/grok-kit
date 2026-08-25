---
name: project-bootstrap
description: >-
  Detect a repo, adapt grok-kit to it, and bootstrap a thin project layer
  (AGENTS.md, core rule, verify ACI, grok-kit.json). Use when setting up the
  kit for a new or existing project, or when .cursor/grok-kit.json is missing.
---

# Project Bootstrap

## When to Use

- New repo or existing project lacking `.cursor/` layer
- Any git repo missing `.cursor/grok-kit.json` **after** `grok-kit install --i-consent` (sessionStart)
- The user explicitly asked to adapt this repo (`grok-kit apply --root .`)
- Applying this kit's stack profiles

## Default: adapt, then bootstrap

Do not hand-copy files. Do not dump every kit skill into always-on rules.

```bash
grok-kit apply --root <repo>
```

`apply` detects the stack, picks a profile, runs `bootstrap` (skips rich files),
and writes the adaptation source of truth:

```text
.cursor/grok-kit.json                 # profile, enabled features, MCP hint
.cursor/rules/grok-kit-project.mdc    # generated always-on router for THIS repo
```

`--detect-only` prints the plan. `--if-missing` no-ops when `grok-kit.json` exists
(sessionStart hook). `--require-consent` (used by sessionStart) skips writes unless
the user ran `grok-kit install --i-consent`. `--write-mcp` copies Tell MCP into
`.cursor/mcp.json` only when recommended **and** Tell is not already present.
Never enable Tell globally.

Low-level (profile already known):

```bash
grok-kit bootstrap --root <repo> --profile <profile>
```

## Profiles (pick one, or let apply detect)

| Profile | When |
|---------|------|
| `tell-proof` | Tell monorepo (`@tell/mcp` / `tell_proof_verify`) |
| `nextjs-clerk-neon` | Next.js + Clerk |
| `research-python` | Python without a JS UI |
| `agentic-framework` | grok-kit itself / harness repos |
| `generic` | everything else (Next/React still get a `tell-proof` **feature flag**) |

## What bootstrap writes (skip if present)

```text
AGENTS.md                 # created, or a grok-kit section appended
.cursorignore
.cursorindexingignore
.cursor/rules/core.mdc
.cursor/verify/verify.sh
.cursor/verify/feature-map.json
.cursor/verify/rubric.json
.gitignore                # ACI log + rlm-state lines
```

## After apply

1. Replace `drive()` in `.cursor/verify/verify.sh` with this repo's prove-it command.
2. Follow **enabled** features in `.cursor/grok-kit.json` only.
3. If `tell-proof` is enabled, UI claims need `tell_proof_verify`. Do not auto-apply `tell_apply` patches. Enable Tell MCP with `tell mcp install cursor --project` (or `pnpm -F @tell/mcp start` in the Tell repo).
4. Suggest ICM topic `project-<slug>` with: how to run/test, gotchas, key paths
5. `/cost-check`: disable global product MCP not needed here
6. Usage-learn is gated: observe only after `install --learn`; adapt `grok-kit.json` only after `--improve` or `grok-kit learn apply --i-consent`

## Core stubs

### AGENTS.md skeleton

```markdown
# <Project>

## Stack
## Run / test
## Conventions
## Skills index
/verify-aci  /rubric-verify  /watch-ci  /route-task  /code-hygiene
## Gotchas
## ICM topic
project-<slug>
```

### core.mdc skeleton

```markdown
---
description: Repo invariants
alwaysApply: true
---

# Core
- (≤10 bullets of true invariants)
```

## Pitfalls

- Duplicating CLAUDE.md / Tell's 40 skills into always-on rules
- Enabling database/browser/deploy/Tell product MCP globally
- Nested AGENTS.md essay farms
- Treating "use every grok-kit skill" as always-on — adaptation is the subset in `grok-kit.json`

## Verification

- `.cursor/grok-kit.json` present; project rule lists this repo's enabled features
- `core.mdc` present and short
- Ignore files present
- `.cursor/verify/verify.sh` exists; `drive()` is this repo's prove-it command (not the template fail-closed stub)
- User can run stated test command
