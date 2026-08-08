# Long-run companion agent (optional)

Use a detached long-run companion only when IDE-native orchestration is not enough.

## Use a companion when

- Multi-hour unattended eval / research
- Mega-corpus work needing persistent REPL state
- Daemon detach/reattach + heartbeats/schedules

## Stay in the IDE when

- Interactive feature work, refactors, PR iteration
- Editor diffs, lints, browser, project MCP
- Cost-sensitive daily coding

## Handoff protocol

1. In the IDE: `/session-handoff` → `.cursor/handoff.md` + ICM `handoff-<slug>`
2. Run the companion in the repo with that goal/acceptance checks
3. Companion returns summaries/artifacts only — store results under ICM `project-<slug>` or `decisions-<slug>`
4. Resume the IDE with `@.cursor/handoff.md` / ICM recall

## Install (when needed)

Install and run your preferred long-run agent CLI in the project directory. Keep it off the daily interactive coding path.
