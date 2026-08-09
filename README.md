# grok-kit

Personal **Cursor agent harness** kit: playbook skills, thin-parent orchestration, cost routing, ICM shared-memory bridge, project bootstrap, and user-layer install helpers.

Repo: [github.com/ashishpatill/grok-kit](https://github.com/ashishpatill/grok-kit)  
Local working copy may still live at `/Volumes/Developer/Workspace/cursor-kit`; plugin id is `grok-kit`.

## What it is

| Path | Purpose |
|------|---------|
| `skills/` | Playbooks: `plan-execute`, `orchestrate-rlm`, `project-bootstrap`, `memory-sync`, `session-handoff`, `cost-check`, `refine-harness`, `skill-curator-manual` |
| `agents/` | `verifier`, `debugger`, `researcher` |
| `rules/` | Thin always-on kit pointer (persona lives in User Rules) |
| `hooks/` | Optional memory-candidate staging on session stop |
| `docs/` | ICM setup, MCP snippets, companion criteria, publish notes |
| `templates/` | Stack profiles for `project-bootstrap` |
| `scripts/` | User-layer install + ICM seed helpers |
| `.cursor-plugin/plugin.json` | Cursor plugin manifest (`name`: `grok-kit`) |
| `plugin.json` | Root metadata for Grok Build–style catalogs |

Cursor remains the interactive coding source of truth. An optional long-run companion is rare/eval-only — see `docs/companion-agent.md`.

## Install

### Option A — install script (recommended)

From the kit root (resolves paths from the script location, so any clone path works):

```bash
./scripts/install-user-layer.sh
```

This will:

- Copy agents into `~/.cursor/agents/`
- Install stop-hook + `~/.cursor/hooks.json`
- Symlink each skill into `~/.cursor/skills/`
- Symlink the plugin to `~/.cursor/plugins/local/grok-kit`
- Slim user MCP to ICM-only (backs up existing `~/.cursor/mcp.json` first)
- Create a stub `~/.cursor/permissions.json` if missing

### Option B — plugin symlink only

```bash
mkdir -p ~/.cursor/plugins/local
ln -sfn /path/to/grok-kit ~/.cursor/plugins/local/grok-kit
```

Skills still load best if also symlinked (or use Option A):

```bash
for d in /path/to/grok-kit/skills/*; do
  ln -sfn "$d" ~/.cursor/skills/"$(basename "$d")"
done
```

### Enable in Cursor

1. Command Palette → **Developer: Reload Window**
2. Confirm the local plugin appears under plugins / Customize (id `grok-kit`)
3. Confirm slash skills resolve (e.g. `/cost-check`, `/plan-execute`)

## Setup

1. **ICM (shared memory)** — install and init per `docs/icm-setup.md`  
   Typical: `icm` on `PATH`, then `icm init --mode mcp` (optional `--mode skill`).
2. **User MCP** — keep globals ICM-only (`docs/mcp-snippets/user-mcp.icm-only.json`).  
   Product MCP (DB/browser/payments/deploy) belongs in **project** `.cursor/mcp.json`.
3. **Seed memory** — run `/memory-sync` once to propose ICM topics from hot MEMORY/USER files (human-gated).
4. **Reload** — Developer: Reload Window; smoke-test `/cost-check`, `/plan-execute`, `/memory-sync`.
5. **Per-repo bootstrap** — in a project, run `/project-bootstrap` for thin `AGENTS.md`, `.cursor/rules/core.mdc`, ignore files, and ICM topic hints.

Machine-specific checklist (this host): `docs/SETUP-STATUS.md`.

### Runtime split

- **Cursor** — editor, MCP, kit skills (daily driver)
- **Hot memory pin** — short MEMORY/USER files; ICM holds the long tail
- **Companion agent** — optional unattended/eval only (`docs/companion-agent.md`)

## Usage

Invoke skills with `/<skill-name>` in chat (after install + reload).

| Skill | When to use |
|-------|-------------|
| `/plan-execute` | Ambiguous multi-file work — plan first, then implement |
| `/orchestrate-rlm` | Multi-hop / multi-package work; thin parent, summary-only children (depth 1) |
| `/cost-check` | Before large runs, high spend, or choosing Cost / Balance / Intelligence |
| `/project-bootstrap` | New or under-tooled repo — `.cursor/` layer + thin AGENTS |
| `/memory-sync` | Seed or update ICM from hot memory; propose (never silent) identity exports |
| `/session-handoff` | End a deep session; write handoff + ICM `handoff-<slug>` |
| `/refine-harness` | After a trajectory: ≤3 evidence-backed harness patches, human approve |
| `/skill-curator-manual` | Periodic skill inventory / merge proposals (manual apply) |

**Agents** (Task / custom agents): `verifier` (readonly checks), `debugger`, `researcher`. Prefer Skills → single Agent → Plan→Agent → parallel Task (≤3–5) → Best-of-N rare.

**Default routing:** Auto **Balance**; pin cheap/Composer for explore/verify; escalate Intelligence only for Debug / novel architecture (`/cost-check`).

## Publish / marketplace

- **Local plugin** — always works via symlink / `install-user-layer.sh` (above).
- **Cursor Marketplace** — submit `https://github.com/ashishpatill/grok-kit` at [cursor.com/marketplace/publish](https://cursor.com/marketplace/publish) (manual review). Prep checklist: `docs/publish.md`.
- **Grok Build catalog** — open catalog via PR to [xai-org/plugin-marketplace](https://github.com/xai-org/plugin-marketplace) with a remote entry pinned to a `main` commit SHA. Details in `docs/publish.md`.

## License

MIT — see `LICENSE`.
