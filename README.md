# grok-kit

Personal Cursor/agent harness kit: playbook skills, thin-parent orchestration, cost routing, ICM shared-memory bridge, project bootstrap, and user-layer install helpers. Local working copy may live under `cursor-kit`; published as `ashishpatill/grok-kit`.

Installed as a local Cursor plugin via symlink:

```bash
ln -sfn /Volumes/Developer/Workspace/cursor-kit ~/.cursor/plugins/local/grok-kit
```

Reload the editor window after install. Or run `scripts/install-user-layer.sh` to copy agents/hooks, slim user MCP to ICM-only, and symlink skills + the plugin.

## What's inside

| Path | Purpose |
|------|---------|
| `skills/` | Playbooks: `plan-execute`, `orchestrate-rlm`, `project-bootstrap`, `memory-sync`, `session-handoff`, `cost-check`, `refine-harness`, `skill-curator-manual` |
| `agents/` | `verifier`, `debugger`, `researcher` |
| `rules/` | Thin always-on kit pointer (persona lives in User Rules) |
| `hooks/` | Optional memory-candidate staging on session stop |
| `docs/` | ICM setup, MCP snippets, companion-agent criteria, setup notes |
| `templates/` | Stack profiles for `project-bootstrap` |
| `scripts/` | User-layer install + ICM seed / hot-memory helpers |

## Quick start

1. Install ICM (see `docs/icm-setup.md`)
2. Slim user MCP to ICM-only globals (see `docs/mcp-snippets/`) or run `scripts/install-user-layer.sh`
3. Run `/memory-sync` once to seed ICM from hot MEMORY/USER files
4. Use `/project-bootstrap` in a repo to generate `.cursor/` + thin AGENTS.md
5. Default model policy: Auto **Balance**; escalate only when needed (`/cost-check`)

## Runtime split

- **Cursor** — interactive coding SoT (editor, MCP, kit skills)
- **Hot memory pin** — short MEMORY/USER files; shares ICM long-tail
- **Companion agent** — rare long-run / unattended work only (see `docs/companion-agent.md`); not the daily driver
