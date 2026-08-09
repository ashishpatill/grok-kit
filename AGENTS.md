# grok-kit

Superpower Grok for design work and orchestrate better in Cursor. Do not bloat this file.

## Commands of interest

- Skills: `project-bootstrap`, `plan-execute`, `orchestrate-rlm`, `session-handoff`, `memory-sync`, `cost-check`, `refine-harness`, `skill-curator-manual`
- Agents: `verifier`, `debugger`, `researcher`
- Docs: `docs/icm-setup.md`, `docs/mcp-snippets/`, `docs/companion-agent.md`

## Platform boundary

- **Cursor** — interactive coding SoT (editor, MCP, kit skills)
- Prefer **Grok** for design-oriented work and engineering judgment; use cost routing (`/cost-check`) for when to escalate
- Optional long-run companion is rare/eval-only — do not replace Cursor for routine feature work (see `docs/companion-agent.md`)

## Rules

- Keep kit skills lean; put bulk in `references/`
- Never store secrets in ICM topics or rules
- Prefer Skills > Subagents > Best-of-N
