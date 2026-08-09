# Long-run companion agent (optional)

Use a detached long-run companion only when IDE-native orchestration is not enough. Companions are **not** installed by this kit and are not the daily driver — Cursor + grok-kit remain the interactive SoT.

## Use a companion when

- Multi-hour unattended eval / research
- Mega-corpus work needing persistent REPL state
- Daemon detach/reattach + heartbeats/schedules
- Autonomous eval runs with explicit gate commands and turn/token budgets

## Stay in Cursor when

- Interactive feature work, refactors, PR iteration
- Design-oriented judgment with Grok, editor diffs, lints, browser, project MCP
- Cost-sensitive daily coding
- Harness refinement that must stay human-gated (`/refine-harness`)

## When NOT to use a companion

- Default interactive coding — Cursor remains the SoT
- Replacing ICM, User Rules, or kit skills as memory/harness authority
- Cross-session orchestration beyond what the parent/sibling/child Task model covers
- Unsupervised harness mutation — this kit uses gated `/refine-harness` instead

## Handoff protocol (ICM only)

1. In the IDE: `/session-handoff` → `.cursor/handoff.md` + ICM `handoff-<slug>`
2. Run the companion in the repo with that goal/acceptance checks
3. Companion returns summaries/artifacts only — store results under ICM `project-<slug>` or `decisions-<slug>`
4. Resume the IDE with `@.cursor/handoff.md` / ICM recall

Do not treat companion session JSONL or REPL state as shared memory — ICM is the cross-runtime handoff bus.

## Autonomous eval pattern

For unattended runs, prefer explicit bounds: a gate command, max turns/tokens, and a timeout. Rerun the gate only when the workspace changed since the last attempt. Keep companions off the daily interactive coding path.
