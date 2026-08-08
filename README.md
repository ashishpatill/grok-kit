# Agent kit

Personal agent OS kit: smarter, cheaper agent setup with ICM for shared long-tail memory.

Installed as a local IDE plugin via symlink:

```bash
ln -sfn /Volumes/Developer/Workspace/cursor-kit ~/.cursor/plugins/local/agent-kit
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

- **IDE agent host** — interactive coding
- **Hot memory pin** — short MEMORY/USER files; shares ICM long-tail
- **Companion agent** — rare long-run work (see `docs/companion-agent.md`)
