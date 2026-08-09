# grok-kit

Personal Cursor/agent harness kit — playbook skills, orchestration, cost routing, ICM bridge. Do not bloat this file.

## Commands of interest

- Skills: `project-bootstrap`, `plan-execute`, `orchestrate-rlm`, `session-handoff`, `memory-sync`, `cost-check`, `refine-harness`, `skill-curator-manual`
- Agents: `verifier`, `debugger`, `researcher`
- Docs: `docs/icm-setup.md`, `docs/mcp-snippets/`, `docs/companion-agent.md`

## Platform boundary

- **Cursor** — interactive coding SoT (editor, MCP, kit skills)
- Prefer Models pool routing via `/cost-check` (Auto Balance default; escalate only when needed)
- Optional long-run companion is rare/eval-only — do not replace Cursor for routine feature work (see `docs/companion-agent.md`)

## Rules

- Keep kit skills lean; put bulk in `references/`
- Never store secrets in ICM topics or rules
- Prefer Skills > Subagents > Best-of-N
