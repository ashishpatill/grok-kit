# grok-kit

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/ashishpatill/grok-kit/blob/main/LICENSE)
[![GitHub](https://img.shields.io/badge/github-ashishpatill%2Fgrok-kit-181717.svg?logo=github)](https://github.com/ashishpatill/grok-kit)

Personal Cursor agent harness kit: playbook skills, thin-parent orchestration, cost-aware model routing, shared-memory bridge (ICM), and project bootstrap. Built so agent work stays repeatable instead of burning context and forgetting decisions between chats.

Local checkout may live at any path (for example `cursor-kit`). Plugin id is always `grok-kit`.

## What it fixes

Common failure modes this kit targets:

| Pain | Kit response |
|------|----------------|
| Ad-hoc agent chaos | Skills ladder + `/orchestrate-rlm` (thin parent, summary-only children, depth 1) |
| Expensive model misuse | `/cost-check` router matrix (Auto Balance default; pin cheap for explore/verify) |
| Session amnesia | ICM shared memory + `/memory-sync` / `/session-handoff` (human-gated writes) |
| Under-tooled repos | `/project-bootstrap` → thin `AGENTS.md`, rules, ignore files, stack templates |
| Context bloat from MCP | Install slims user MCP to ICM-only; product servers stay project-scoped |

Cursor stays the interactive coding source of truth. An optional long-run companion is rare/eval-only. See [`docs/companion-agent.md`](docs/companion-agent.md).

## What's included

- Playbook skills: plan→execute, orchestration, cost, bootstrap, memory, handoff, harness refinement
- Specialist agents: `verifier`, `debugger`, `researcher` (pin cheap for explore/verify)
- Cost routing: Optimize For matrix; prefer Cursor Models pool (Grok 4.5 / Composer 2.5) for routine work
- Memory bridge: ICM for long-tail store; keep hot MEMORY/USER short; no silent identity mutation
- MCP slim pattern: user-global = ICM; archive/restore helpers; product servers in project snippets
- User-layer install script: agents, hooks, skill symlinks, plugin symlink, permissions stub
- Stack templates: Next.js/Clerk/Neon, research-Python, agentic-framework profiles for bootstrap

### Skills

| Skill | When to use |
|-------|-------------|
| `/cost-check` | Before large runs, high spend, or choosing Cost / Balance / Intelligence |
| `/plan-execute` | Ambiguous multi-file work: plan first, then implement |
| `/orchestrate-rlm` | Multi-hop / multi-package work; thin parent, summary-only children |
| `/project-bootstrap` | New or under-tooled repo: `.cursor/` layer + thin AGENTS |
| `/memory-sync` | Seed or update ICM from hot memory; propose (never silent) identity exports |
| `/session-handoff` | End a deep session; write handoff + ICM `handoff-<slug>` |
| `/refine-harness` | After a trajectory: ≤3 evidence-backed harness patches, human approve |
| `/skill-curator-manual` | Periodic skill inventory / merge proposals (manual apply) |

### Agents

| Agent | Role |
|-------|------|
| `verifier` | Readonly acceptance checks vs plan/STATE; pin Composer |
| `debugger` | Localize → minimal fix → verify; stop after two failed hypotheses |
| `researcher` | Readonly exploration; summarize-only returns; pin Composer |

Ladder: Skill → single Agent → Plan→Agent → parallel Task (≤3-5, depth 1) → Best-of-N rare.

## Quickstart

```bash
git clone https://github.com/ashishpatill/grok-kit.git
cd grok-kit
./scripts/install-user-layer.sh
```

In Cursor: Developer: Reload Window, then try:

```text
/cost-check
/plan-execute
/project-bootstrap
```

Confirm the local plugin id `grok-kit` appears under plugins / Customize, and slash skills resolve.

## Setup

### 1. Install the user layer

Option A: install script (recommended)

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

Option B: plugin symlink only

```bash
mkdir -p ~/.cursor/plugins/local
ln -sfn /path/to/grok-kit ~/.cursor/plugins/local/grok-kit

for d in /path/to/grok-kit/skills/*; do
  ln -sfn "$d" ~/.cursor/skills/"$(basename "$d")"
done
```

### 2. Shared memory (ICM)

Install and init per [`docs/icm-setup.md`](docs/icm-setup.md):

```bash
# put icm on PATH, then:
icm init --mode mcp
icm init --mode skill   # optional
```

Keep user-global MCP ICM-only ([`docs/mcp-snippets/user-mcp.icm-only.json`](docs/mcp-snippets/user-mcp.icm-only.json)). Product MCP (database, browser, payments, deploy) belongs in the project's `.cursor/mcp.json`. See [`docs/mcp-snippets/`](docs/mcp-snippets/).

Seed once (human-gated):

```bash
export HOT_MEMORY_FILE="$HOME/path/to/MEMORY.md"
export HOT_USER_FILE="$HOME/path/to/USER.md"
./scripts/seed-icm-from-memory.sh
# or invoke /memory-sync in Cursor
```

### 3. Reload and smoke-test

1. Command Palette → Developer: Reload Window
2. Customize → MCP should show `icm` only (add product servers per project as needed)
3. Try `/cost-check`, `/plan-execute`, `/memory-sync`

Machine-specific checklist for an already-applied host: [`docs/SETUP-STATUS.md`](docs/SETUP-STATUS.md).

### Runtime split

| Layer | Role |
|-------|------|
| Cursor | Editor, MCP, kit skills (daily driver) |
| Hot memory pin | Short MEMORY/USER files |
| ICM | Long-tail preferences, routing, project topics, handoffs |
| Companion | Optional unattended/eval only |

## Usage

### Day-to-day

1. Start ambiguous work with `/plan-execute` (approve plan → Agent)
2. Before a large or expensive run, `/cost-check`
3. Multi-package or parallel units → `/orchestrate-rlm` with contracts (goal, paths, verify, definition of done; children return summaries only)
4. New repo → `/project-bootstrap` (pick a template profile)
5. End deep work → `/session-handoff`; durable facts → `/memory-sync` (propose, don't auto-apply)

### Orchestration ladder

```text
Skill  →  single Agent  →  Plan→Agent  →  parallel Task (≤3-5)  →  Best-of-N (rare)
```

Children stay depth 1. Prefer built-in Explore for search; pin cheap/Composer on verify and research agents. Never inherit Intelligence for those.

### Default routing

| Scenario | Optimize For |
|----------|----------------|
| Clarify / Q&A / nits | Cost or Composer 2.5 |
| Day-to-day implement | Balance (default) |
| Stubborn debug / novel architecture | Intelligence (only when needed) |
| Verify / research subagents | Pin Composer; never inherit Intelligence |

Full matrix: skill [`skills/cost-check/SKILL.md`](skills/cost-check/SKILL.md).

## Architecture

```mermaid
flowchart TB
  subgraph user["User layer (~/.cursor)"]
    UR[User Rules / persona]
    MCP[MCP: ICM only]
    SK[skills/ symlinks]
    AG[agents/]
  end

  subgraph kit["grok-kit plugin"]
    PS[Playbook skills]
    PA[verifier / debugger / researcher]
    RP[rules/kit-pointer.mdc]
    TP[templates/]
    SC[scripts/install-user-layer.sh]
  end

  subgraph project["Project repo"]
    AM[AGENTS.md]
    CR[.cursor/rules]
    PM[.cursor/mcp.json product servers]
    ST[.cursor/rlm-state / handoff]
  end

  subgraph memory["Memory"]
    HOT[Hot MEMORY / USER pin]
    ICM[(ICM SQLite)]
  end

  UR --> PS
  SK --> PS
  RP --> PS
  PS --> PA
  PS --> project
  SC --> user
  HOT --> ICM
  PS --> ICM
  PM -.->|scoped| project
  MCP --> ICM
```

| Path | Purpose |
|------|---------|
| `skills/` | Playbook skills (slash commands) |
| `agents/` | `verifier`, `debugger`, `researcher` |
| `rules/` | Thin always-on kit pointer (persona stays in User Rules) |
| `hooks/` | Optional memory-candidate staging on session stop |
| `templates/` | Stack profiles for `/project-bootstrap` |
| `scripts/` | User-layer install + ICM seed helpers |
| `docs/` | ICM setup, MCP snippets, companion criteria, publish notes |
| `.cursor-plugin/plugin.json` | Cursor plugin manifest |
| `plugin.json` | Root metadata for Grok Build-style catalogs |

## Configuration

Key knobs (no secrets in the kit):

| Knob | Where | Notes |
|------|-------|-------|
| Plugin path | `~/.cursor/plugins/local/grok-kit` | Symlink from clone |
| Skills path | `~/.cursor/skills/<name>` | Symlinks into kit `skills/` |
| User MCP | `~/.cursor/mcp.json` | ICM-only by default after install |
| MCP archive | `~/.cursor/mcp-servers.archived.json` | Former globals for project restore |
| Permissions | `~/.cursor/permissions.json` | Stub allowlist includes `icm` |
| Hooks | `~/.cursor/hooks.json` | Stop hook stages memory candidates |
| Hot pin paths | `HOT_MEMORY_FILE` / `HOT_USER_FILE` | For seed script |
| Project MCP | `<repo>/.cursor/mcp.json` | Product servers only when needed |

Never store API keys or tokens in ICM topics, rules, or handoff files.

## FAQ / Troubleshooting

**Slash skills don't appear**  
Reload the window. Confirm skill symlinks under `~/.cursor/skills/` and plugin at `~/.cursor/plugins/local/grok-kit`. Re-run `./scripts/install-user-layer.sh`.

**Plugin not listed**  
Check the symlink target points at this clone. Legacy names `agent-kit` / `cursor-kit` under `plugins/local/` are removed by the install script.

**I need my old global MCP servers back**

```bash
cp ~/.cursor/mcp-servers.archived.json ~/.cursor/mcp.json
# or merge selected servers into a project's .cursor/mcp.json
# install also writes ~/.cursor/mcp.json.bak.grok-kit.<timestamp>
```

**ICM not found**  
Install the binary and run `icm init --mode mcp`. See [`docs/icm-setup.md`](docs/icm-setup.md).

**Should I run a detached companion daily?**  
No. Stay in Cursor for interactive work. Companions are eval/unattended only ([`docs/companion-agent.md`](docs/companion-agent.md)).

**Does this replace User Rules / persona?**  
No. The kit pointer is thin; persona and policy live in User Rules. `/memory-sync` and `/refine-harness` propose changes; they do not silently rewrite identity.

## Status / Roadmap

Honest status (see also [`docs/STATUS.md`](docs/STATUS.md) and [`docs/publish.md`](docs/publish.md)):

| Item | Status |
|------|--------|
| Local plugin via symlink / install script | Works today |
| Skills, agents, templates, ICM docs | In repo |
| Cursor Marketplace listing | Prep done; manual submit at [cursor.com/marketplace/publish](https://cursor.com/marketplace/publish) + review |
| Grok Build catalog | Prep done; PR to [xai-org/plugin-marketplace](https://github.com/xai-org/plugin-marketplace) with pinned `main` SHA |

Not in scope: becoming a full agent framework product, unsupervised harness mutation, or marketing as a design-workflow kit.

## Contributing

This is a personal harness kit published for reuse. PRs that keep skills lean (bulk in `references/`), stay accurate to install scripts, and avoid vendor-name spam in docs are welcome.

1. Fork and branch from `main`
2. Keep playbook skills thin; put long procedures in `references/`
3. Match skill names and install behavior in any README/docs edits
4. Open a PR with a clear why

Progress / stop rules for maintainers: [`GOAL_AND_LOOP.md`](GOAL_AND_LOOP.md).

## License

[MIT](https://github.com/ashishpatill/grok-kit/blob/main/LICENSE) © 2026 Ashish P
