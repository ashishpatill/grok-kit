---
name: project-bootstrap
description: >-
  Bootstrap a repo with thin AGENTS.md, .cursor/rules/core.mdc, ignore files,
  optional mcp.json, STATE conventions, and ICM project topic. Use when setting
  up the grok-kit layer for a new or existing project.
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

1. Detect stack (package.json, pyproject, Package.swift, etc.) or ask for profile
2. Ensure files (do not overwrite rich existing AGENTS.md — merge thin kit section instead):

```text
AGENTS.md                 # ≤80 lines if creating fresh
.cursorignore
.cursorindexingignore
.cursor/rules/core.mdc    # alwaysApply invariants ≤40 lines
.cursor/mcp.json          # only if product MCP needed
.cursor/rlm-state/.gitkeep
```

3. Add to `.gitignore` if missing: `.cursor/rlm-state/`, `.cursor/handoff.md`, `PENDING_MEMORY.md`
4. Copy profile extras from `templates/<profile>/`
5. Suggest ICM topic `project-<slug>` with: how to run/test, gotchas, key paths
6. Run `/cost-check` mentally: disable global product MCP not needed here

## Core stubs

### AGENTS.md skeleton

```markdown
# <Project>

## Stack
## Run / test
## Conventions
## Skills index
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
- User can run stated test command
