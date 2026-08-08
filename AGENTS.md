# Agent kit

Personal agent OS kit. Do not bloat this file.

## Commands of interest

- Skills: `project-bootstrap`, `plan-execute`, `orchestrate-rlm`, `session-handoff`, `memory-sync`, `cost-check`, `refine-harness`, `skill-curator-manual`
- Agents: `verifier`, `debugger`, `researcher`
- Docs: `docs/icm-setup.md`, `docs/mcp-snippets/`, `docs/companion-agent.md`

## Rules

- Keep kit skills lean; put bulk in `references/`
- Never store secrets in ICM topics or rules
- Prefer Skills > Subagents > Best-of-N
