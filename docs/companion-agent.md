# Long-run companion agent (optional)

Use a detached long-run companion only when IDE-native orchestration is not enough.

**Prime Agent** is one optional companion (not installed by this kit). See [Prime Agent blog](https://www.primeintellect.ai/blog/prime-agent) for upstream design.

## Use a companion when

- Multi-hour unattended eval / research
- Mega-corpus work needing persistent REPL state
- Daemon detach/reattach + heartbeats/schedules
- Autonomous eval runs with explicit gate commands and turn/token budgets

## Stay in the IDE when

- Interactive feature work, refactors, PR iteration
- Editor diffs, lints, browser, project MCP
- Cost-sensitive daily coding
- Harness refinement that must stay human-gated (`/refine-harness`)

## When NOT to use Prime Agent

- Default interactive coding — Cursor remains the SoT
- Replacing ICM, User Rules, or kit skills as memory/harness authority
- Cross-session orchestration beyond parent/sibling/child (Prime A2A is **nuclear-family only**)
- Unsupervised harness mutation — Prime `/refine` is Continual Harness CRUD; this kit uses gated `/refine-harness` instead

## Handoff protocol (ICM only)

1. In the IDE: `/session-handoff` → `.cursor/handoff.md` + ICM `handoff-<slug>`
2. Run the companion in the repo with that goal/acceptance checks
3. Companion returns summaries/artifacts only — store results under ICM `project-<slug>` or `decisions-<slug>`
4. Resume the IDE with `@.cursor/handoff.md` / ICM recall

Do not treat companion session JSONL or REPL state as shared memory — ICM is the cross-runtime handoff bus.

## Autonomous eval pattern (Prime CLI)

For unattended runs, prefer explicit bounds and a gate:

```bash
prime-agent \
  --autonomous \
  --autonomous-gate "npm run check" \
  --autonomous-max-turns 20 \
  "Implement and verify the requested change"
```

Also available: `--autonomous-max-tokens`, `--autonomous-timeout-ms`. Gate reruns only when the workspace changed since the last attempt.

## Install (when needed)

```bash
curl -fsSL https://app.primeintellect.ai/prime-agent/install.sh | sh
```

Install and run in the project directory. Keep off the daily interactive coding path.
