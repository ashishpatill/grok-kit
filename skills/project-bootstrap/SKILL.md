---
name: project-bootstrap
description: >-
  Bootstrap a repo with thin AGENTS.md, .cursor/rules/core.mdc, ignore files,
  verify ACI (doctor/launch/drive), optional mcp.json, STATE conventions, and
  ICM project topic. Use when setting up the grok-kit layer for a new or existing
  project.
---

# Project Bootstrap

## When to Use

- New repo or existing project lacking `.cursor/` layer
- Applying this kit's stack profiles

## Profiles (pick one)

| Profile | Template dir |
|---------|----------------|
| `nextjs-clerk-neon` | `templates/nextjs-clerk-neon/` |
| `research-python` | `templates/research-python/` |
| `agentic-framework` | `templates/agentic-framework/` |
| `generic` | use core stubs below |

## Procedure

1. Detect stack (or ask). Pick a profile.
2. Run the compiler (do not hand-copy files):

```bash
grok-kit bootstrap --root <repo> --profile <profile>
```

`--dry-run` prints the plan. Existing rich `AGENTS.md` / `verify.sh` are skipped unless `--force-verify`.

The script writes:

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

3. Replace `drive()` in `.cursor/verify/verify.sh` with this repo's prove-it command.
4. Suggest ICM topic `project-<slug>` with: how to run/test, gotchas, key paths
5. `/cost-check`: disable global product MCP not needed here

## Core stubs

### AGENTS.md skeleton

```markdown
# <Project>

## Stack
## Run / test
## Conventions
## Skills index
/verify-aci  /rubric-verify  /watch-ci  /route-task
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

- Duplicating CLAUDE.md wholesale into always-on rules
- Enabling database/browser/deploy product MCP globally
- Nested AGENTS.md essay farms

## Verification

- `core.mdc` present and short
- Ignore files present
- `.cursor/verify/verify.sh` exists; `drive()` is this repo's prove-it command (not the template fail-closed stub)
- User can run stated test command
