# Setup status (applied on this machine)

## Positioning

**grok-kit** makes Grok stronger at design-oriented work and multi-agent orchestration inside Cursor (plan→execute, thin-parent runs, cost routing, shared memory, playbook skills).

## Done

- [x] Kit repo at `/Volumes/Developer/Workspace/cursor-kit` (local folder name; public repo `ashishpatill/grok-kit`)
- [x] Symlink `~/.cursor/plugins/local/grok-kit`
- [x] User MCP slimmed to ICM (`serve --compact`); previous servers archived at `~/.cursor/mcp-servers.archived.json` + `mcp.json.bak.grok-kit.*`
- [x] ICM binary `~/.local/bin/icm` v0.10.61; `icm init --mode mcp` + `--mode skill`
- [x] ICM seeded from hot MEMORY/USER files; topics include `preferences`, `workspace-routing`, `project-disksense`, `models`
- [x] Hot-memory write approval enabled
- [x] User Rules: Persona, Router and cost policy, Memory and ICM, Subagent contracts
- [x] User agents: verifier, debugger, researcher
- [x] Skills symlinked under `~/.cursor/skills/`
- [x] User `hooks.json` + `permissions.json`
- [x] Pilot: DiskSense `.cursor/rules`, ignore files, AGENTS kit section, ICM topic

## After reload

1. **Developer: Reload Window** in the IDE
2. Confirm Customize → MCP shows `icm` only (product MCP per project as needed)
3. Try `/cost-check`, `/plan-execute`, `/memory-sync`
4. Optional: configure at most one external memory provider against the same ICM DB

## Restore old global MCP (if needed)

```bash
cp ~/.cursor/mcp-servers.archived.json ~/.cursor/mcp.json
# or merge selected servers into a project's .cursor/mcp.json
```
