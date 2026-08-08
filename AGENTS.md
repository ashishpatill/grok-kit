# Agent kit

Personal agent OS kit. Do not bloat this file.

## Commands of interest

- Skills: `project-bootstrap`, `plan-execute`, `orchestrate-rlm`, `session-handoff`, `memory-sync`, `cost-check`, `refine-harness`, `skill-curator-manual`
- Agents: `verifier`, `debugger`, `researcher`
- Docs: `docs/icm-setup.md`, `docs/mcp-snippets/`, `docs/companion-agent.md`

## Prime platform boundary

- **Cursor** — interactive coding SoT (editor, MCP, kit skills)
- **Prime (optional)** — companion for long-run/autonomous eval; batch inference/training via Lab/Compute — not a daily driver
- Do not replace Cursor with Prime Lab, Compute, or Inference for routine feature work

## Rules

- Keep kit skills lean; put bulk in `references/`
- Never store secrets in ICM topics or rules
- Prefer Skills > Subagents > Best-of-N
