# grok-kit

Personal Cursor/agent harness kit — playbook skills, orchestration, cost routing, ICM bridge. Do not bloat this file.

## Commands of interest

- Skills: `project-bootstrap` (`grok-kit apply` adapts per repo), `plan-execute`, `orchestrate-rlm`, `session-handoff`, `memory-sync`, `cost-check`, `refine-harness`, `skill-curator-manual`, `usage-learn`, `verify-aci`, `watch-ci`, `rubric-verify`, `route-task`
- Agents: `verifier`, `debugger`, `researcher`
- Docs: `docs/icm-setup.md`, `docs/mcp-snippets/`, `docs/companion-agent.md`

## Run / test

```bash
node scripts/grok-kit.mjs check
node scripts/grok-kit.mjs verify-aci --root . --phase doctor
./.cursor/verify/verify.sh
```

## Platform boundary

- **Cursor** — interactive coding SoT (editor, MCP, kit skills)
- Prefer Models pool routing via `/cost-check` (Auto Balance default; escalate only when needed)
- Optional long-run companion is rare/eval-only — do not replace Cursor for routine feature work (see `docs/companion-agent.md`)

## Rules

- Keep kit skills lean; put bulk in `references/`
- Never store secrets in ICM topics or rules
- Prefer Skills > Subagents > Best-of-N
- Adaptation SoT: `.cursor/grok-kit.json` (`grok-kit apply`). Use enabled features only; do not dump the whole kit into always-on rules.
- User-layer install and background per-repo apply require `grok-kit install --i-consent`. Direct `grok-kit apply --root .` is this-repo-only.
- Usage observation is opt-in (`install --learn`). Harness tweaks to `grok-kit.json` need `--improve` or `grok-kit learn apply --i-consent`. Never auto-rewrite User Rules or `SKILL.md`.
- Route with `/route-task`. Prove with `/verify-aci`. PR merge-state with `/watch-ci` (status-once).
- After install, `grok-kit` is on PATH (`~/.local/bin/grok-kit`).
