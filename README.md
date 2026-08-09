# grok-kit

Personal kit to **superpower Grok for design work** and orchestrate better inside Cursor — plan→execute, thin-parent multi-agent runs, cost routing, shared memory, and playbook skills.

Installed as a local Cursor plugin via symlink:

```bash
ln -sfn /Volumes/Developer/Workspace/cursor-kit ~/.cursor/plugins/local/grok-kit
```

Reload the editor window after install.

## What's inside

| Path | Purpose |
|------|---------|
| `skills/` | Orchestration playbook + bootstrap/memory/cost skills |
| `agents/` | verifier, debugger, researcher |
| `rules/` | Thin always-on kit pointers (persona lives in User Rules) |
| `hooks/` | Optional memory staging on session stop |
| `docs/` | MCP snippets, companion-agent criteria, install notes |
| `templates/` | Stack profiles for `project-bootstrap` |
| `scripts/` | ICM seed / hot-memory sync helpers |

## Quick start

1. Install ICM (see `docs/icm-setup.md`)
2. Slim user MCP to ICM-only globals (see `docs/mcp-snippets/`)
3. Run `/memory-sync` once to seed ICM from hot MEMORY/USER files
4. Use `/project-bootstrap` in a repo to generate `.cursor/` + thin AGENTS.md
5. Default model policy: Auto **Balance**; escalate only when needed (`/cost-check`)

## Runtime split

- **Cursor** — interactive coding SoT (editor, MCP, kit skills); prefer Grok for design-oriented judgment
- **Hot memory pin** — short MEMORY/USER files; shares ICM long-tail
- **Companion agent** — rare long-run / unattended work only (see `docs/companion-agent.md`); not the daily driver
