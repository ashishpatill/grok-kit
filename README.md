# grok-kit

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/ashishpatill/grok-kit/blob/main/LICENSE)
[![GitHub](https://img.shields.io/badge/github-ashishpatill%2Fgrok-kit-181717.svg?logo=github)](https://github.com/ashishpatill/grok-kit)

A personal harness for [Cursor](https://cursor.com) and [Grok Build](https://x.ai/cli). Same plugin in both: slash skills, three specialist agents, and a CLI that adapts to the repo you opened.

This is not a second IDE and not a model. Cursor is where I write code. Grok Build is the terminal agent. Grok 4.5 and Composer 2.5 are models I pick *inside* those hosts. grok-kit is the layer that makes their built-in skills, rules, MCP, hooks, and plugins actually get used, instead of every chat starting from scratch with a fat prompt.

You can clone this anywhere (local folder names like `cursor-kit` are fine). The plugin id is always `grok-kit`.

[Install](#install) · [What it is good at](#what-grok-kit-is-good-at) · [Cursor](#how-it-uses-cursor) · [Grok Build](#how-it-uses-grok-build) · [Usage](#usage) · [FAQ](#faq)

## Why it exists

Agent chats go sideways when every session is a new personality, the expensive model does the busywork, MCP schemas eat the context window, and "it's green" means a screenshot.

grok-kit exists so Cursor and Grok Build stay cheap, stable, and honest. It is a harness: a small set of skills, a CLI, and a few short rules that make the host you already have actually follow a loop.

Official Cursor Marketplace and xAI catalog listings are still a manual step (`docs/publish.md`). A clone works in both hosts today.

## What grok-kit is good at

grok-kit is good at a few jobs. It does them with commands you can rerun, not with a giant always-on prompt.

### Playbooks become commands

A long skill that only tells the agent a story is easy to skip. grok-kit compiles the important loops into a CLI. `grok-kit verify-aci` runs doctor, launch, and one real drive. `grok-kit watch-ci` asks whether GitHub will merge the PR, not whether a checkbox looks green. `grok-kit apply` looks at this repo and writes a small config for it.

You can run the same command tomorrow. The JSON is the answer. That is the proof, not a screenshot and not a promise in chat.

### It loads only what you asked for

Skills sit on disk until you type `/cost-check` or `/rsi`. Always-on rules stay a few short files. `grok-kit apply` turns on a subset for *this* repo. The rest wait.

That keeps the prompt small. Cursor and Grok Build can reuse the start of the prompt on the next turn only if those bytes did not change. grok-kit never puts dates, session dumps, or learned workflows into that prefix. If those files change every chat, you pay the whole start again.

### It asks before it writes

Turning the plugin on does not rewrite your home folder or other repos. User-layer install needs `--i-consent`. Background apply needs that same consent. Memory and harness tweaks are proposals. They do not silently edit your persona or skill files.

`/code-hygiene` ranks drift. You choose scrap, keep, or fix. Nothing auto-deletes. `/rsi` reviews before ship and does not merge. `/route-task` maps an intent onto skills, prints the steps, and leaves. It is not a sticky mode that stays on for the rest of the chat.

### Cheap work uses a cheap model

Day-to-day implement uses Auto Balance. Questions and nits use Cost or Composer 2.5. The `verifier` and `researcher` agents pin Composer. They never inherit Intelligence. Intelligence is for stuck debug or novel architecture, not "did CI pass?"

User-global MCP is ICM (shared local memory) only. Browser, database, deploy, and Tell stay in the project that needs them, so their schemas do not sit in every chat.

### Same kit in the editor and in the terminal

One clone is a Cursor plugin and a Grok Build plugin. After install, `grok-kit` is on PATH. Apply, verify, hygiene, and rsi work with the editor closed. You do not keep two harnesses in sync.

### Prove the change, then stop

One golden path for the claim, not ten parallel demos. Replace `drive()` in `.cursor/verify/verify.sh` with the command that proves *this* repo. A missing drive that still exits 0 is a lie. Children of `/orchestrate-rlm` return summaries only, depth 1. Durable facts go through `/memory-sync` as proposals. End a deep session with `/session-handoff`.

The loop is small on purpose: route the task, spend the right model, prove it, then stop.

## Install

```bash
git clone https://github.com/ashishpatill/grok-kit.git
cd grok-kit
./scripts/install-user-layer.sh --i-consent
# puts grok-kit on PATH as ~/.local/bin/grok-kit
grok-kit check
```

From a checkout without the PATH symlink: `node scripts/grok-kit.mjs check`.

Install refuses (exit 78) unless you pass `--i-consent` or type `I CONSENT` on a TTY. That is on purpose. Enabling the Cursor plugin without this script does not write `~/.cursor` or other repos.

### Cursor

Reload the window (Command Palette: Developer: Reload Window). Confirm `grok-kit` shows under plugins, then try:

```text
/cost-check
/plan-execute
/project-bootstrap
/verify-aci
/watch-ci
```

### Grok Build

Same clone. No catalog listing required:

```bash
grok plugin install /path/to/grok-kit --trust
# or: grok plugin install ashishpatill/grok-kit --trust
```

Reload plugins (`r` in the Plugins tab, or start a new session). Skills should show in the slash menu. After an xAI catalog listing exists, `grok plugin install grok-kit --trust` is the short form.

## How it uses Cursor

Cursor already ships skills, custom agents, rules, MCP, hooks, plugins, modes, and a models pool. grok-kit fills that in. It does not invent a parallel IDE.

| Cursor already has | What grok-kit does with it |
| --- | --- |
| Agent skills (`skills/*/SKILL.md`) | Playbooks live here. Type `/plan-execute`, `/cost-check`, `/rsi`, and so on. Bulk stays out of the always-on prompt. |
| Custom agents | Kit `agents/` (install copies to `~/.cursor/agents/`). `verifier`, `debugger`, `researcher` pin Composer. Review does not inherit Intelligence. |
| Rules (`alwaysApply` `.mdc`) | Three short files: kit pointer, user `~/.cursor/rules/grok-kit.mdc`, generated `.cursor/rules/grok-kit-project.mdc`. No timestamps, no learned dumps. |
| `AGENTS.md` | One screen. Skill names and the Cursor/Grok Build split. Long procedures stay in skills. |
| MCP | After consent, user-global MCP is ICM only. Product servers stay project-scoped. |
| Hooks | `sessionStart` runs `grok-kit apply --if-missing` plus a one-line status hint. `stop` is a memory nudge. Fail-open, keep it short. |
| Plugins | `.cursor-plugin/plugin.json` plus a symlink at `~/.cursor/plugins/local/grok-kit`. |
| Optimize For | `/cost-check`: Auto Balance to implement, Cost or Composer to ask and verify, Intelligence only when stuck. Prefer Grok 4.5 / Composer 2.5 for routine work. |
| Plan / Agent / Ask / Debug | Skills assume Agent to implement, Plan before multi-unit work, Ask when read-only. They do not fight the mode picker. |
| Explore | Use Cursor Explore for search. `/orchestrate-rlm` is depth 1, summary-only, and only when the parent cannot do the work. |
| Canvas (if your build has it) | `/visualise` emits mermaid. A screenshot is not proof. Tell-proof repos use `tell_proof_verify`. |
| Tell MCP | Project-scoped only. Never user-global. Never auto-apply `tell_apply`. |

Cursor Cloud Agents, Tab, and Browser stay host features. grok-kit does not wrap them as the daily loop. A detached companion is eval-only: [`docs/companion-agent.md`](docs/companion-agent.md).

## How it uses Grok Build

[Grok Build plugins](https://github.com/xai-org/grok-build/blob/main/crates/codegen/xai-grok-pager/docs/user-guide/09-plugins.md) are a directory of `skills/`, `agents/`, `hooks/hooks.json`, optional `plugin.json`, and optionally `commands/`, `.mcp.json`, `.lsp.json`. grok-kit ships the first four. One clone is a Grok plugin *and* a CLI that runs with Cursor closed.

| Grok Build already has | What grok-kit does with it |
| --- | --- |
| Plugin skills | Same `SKILL.md` files as Cursor. They show in Grok's slash menu. Scripts sit next to the skill. No extra `commands/` folder. |
| Plugin agents | Same `verifier` / `debugger` / `researcher`. If the short name collides, Grok qualifies it as `grok-kit:verifier`. |
| Plugin hooks | Same sessionStart apply + stop stub. Plugin root comes from the script path, `CURSOR_PLUGIN_ROOT`, or `GROK_PLUGIN_ROOT`. |
| `plugin.json` | Name, version, description. Grok can discover the directories even without it. |
| `grok plugin install` | Works from this repo today. Catalog listing is extra, not required. |
| `grok inspect` | Shows what loaded and roughly how many tokens it costs. That is why apply subsets features and always-on files stay tiny. |
| Terminal | `install-user-layer.sh` puts `grok-kit` on PATH (`~/.local/bin/grok-kit` -> `scripts/grok-kit.mjs`). Apply, verify, hygiene, rsi, flagship all work with no IDE. |
| `AGENTS.md` in the repo | `grok-kit apply` writes a thin project rule and keeps `AGENTS.md` one screen. Grok already reads it. |
| Plugin-root `.mcp.json` | We do not ship one. Product MCP stays in the project (`apply --write-mcp` only). Grok should not inherit a bloated `~/.cursor/mcp.json`. |

What grok-kit adds on top of both hosts (not a Cursor or Grok builtin):

- `grok-kit apply`: detect the stack, enable a subset, write `.cursor/grok-kit.json` and a thin project rule.
- `/cost-check` and the KV-cache notes: the host cache only hits if the always-on prefix did not change.
- ICM `/memory-sync` and `/session-handoff`: human-gated. No silent User Rules edits.
- `/rsi`: review before ship. Does not merge.
- `--learn` / `--improve`: opt-in, names only, never auto-edits persona or skill bodies.

## Usage

Typical loop:

1. `/route-task` (bug, feature, investigate, ship, hygiene) or `/plan-execute` when the work is fuzzy.
2. `/cost-check` before a large or expensive run.
3. Multi-package work: `/orchestrate-rlm`. Children return summaries only.
4. New repo: `grok-kit apply --root .`. Replace `drive()` in `.cursor/verify/verify.sh`. Follow enabled features in `.cursor/grok-kit.json` only.
5. After implement: `/verify-aci`, then `/rubric-verify`. If a PR is open, `/watch-ci --status-once`.
6. Drift: `/code-hygiene`. Read the ranked files, then scrap, keep, or fix.
7. Before ship: `/rsi`. Merge only if asked.
8. End of a deep session: `/session-handoff`. Durable facts go through `/memory-sync` as proposals.

```text
Skill  ->  single Agent  ->  Plan then Agent  ->  parallel Task (<=3-5)  ->  Best-of-N (rare)
```

Children stay depth 1. Pin Composer on verify and research. Do not inherit Intelligence for those.

| You are doing | Optimize For |
| --- | --- |
| Clarify, Q&A, nits | Cost or Composer 2.5 |
| Day-to-day implement | Balance (default) |
| Stubborn debug or novel architecture | Intelligence, only when needed |
| Verify / research subagents | Pin Composer |

Full matrix: [`skills/cost-check/SKILL.md`](skills/cost-check/SKILL.md).

### Skills

| Skill | When |
| --- | --- |
| `/cost-check` | Before a large run, or when picking Cost / Balance / Intelligence |
| `/plan-execute` | Ambiguous multi-file work. Plan first. |
| `/orchestrate-rlm` | Multi-package work. Thin parent, summary-only children. |
| `/project-bootstrap` | `grok-kit apply` writes `grok-kit.json` and a thin project rule. `bootstrap` is the low-level copier. |
| `/verify-aci` | Prove it: project `doctor` / `launch` / one `drive`. |
| `/rubric-verify` | Score a short repo-grounded checklist against the diff. |
| `/watch-ci` | PR merge-state, status-once. Not a green checkbox list. |
| `/route-task` | Map an intent onto kit skills. Not sticky. |
| `/memory-sync` | Seed or update ICM. Propose, never silent. |
| `/session-handoff` | End a deep session. Writes handoff plus ICM `handoff-<slug>`. |
| `/flagship` | Session start/end: overview plus visualise. |
| `/overview` | Compiled status: git, kit profile, handoff, recent commits. |
| `/visualise` | Mermaid of that status. Host canvas if available. |
| `/code-hygiene` | Rank stale or low-quality files. You decide. Never auto-delete. |
| `/rsi` | Review before ship: flagship + hygiene + prove-it. |
| `/refine-harness` | After a trajectory: at most 3 evidence-backed patches, human approve. |
| `/usage-learn` | After `install --learn`. Adapts `grok-kit.json` only with `--improve` or `learn apply --i-consent`. |
| `/skill-curator-manual` | Periodic skill inventory. Manual apply. |

### Agents

| Agent | Role |
| --- | --- |
| `verifier` | Readonly acceptance. Pin Composer. |
| `debugger` | Localize, minimal fix, verify. Stop after two failed hypotheses. |
| `researcher` | Readonly exploration. Summaries only. Pin Composer. |

## Tokens

The plain version of this is [What grok-kit is good at](#what-grok-kit-is-good-at). The short version: Cursor and Grok Build can reuse the *start* of the prompt on later turns only if those bytes did not change. grok-kit is built around that:

1. Subset, not a dump. `grok-kit apply` enables what this repo needs. The rest loads when you invoke a skill.
2. Stable always-on prefix. Generated `.cursor/rules/grok-kit-project.mdc` has no timestamps and no per-session text. `install --improve` will not rewrite it unless enabled features actually changed.
3. MCP slim. After `--i-consent`, user-global MCP is ICM only.
4. Cheap default routing. See the table above. Verifier and researcher pin Composer.
5. Short returns. Orchestration children summarize. Do not paste transcripts back into the parent.
6. Short memory. ICM holds the long tail. Keep hot MEMORY/USER small. Do not paste identity into always-on rules.

More: [`skills/cost-check/references/token-kv-cache.md`](skills/cost-check/references/token-kv-cache.md).

## Setup details

### What `--i-consent` writes

- Agents into `~/.cursor/agents/`
- User rule `~/.cursor/rules/grok-kit.mdc`
- Merge stop + sessionStart into `~/.cursor/hooks.json` (keeps your other events)
- Skill symlinks under `~/.cursor/skills/`
- Plugin symlink `~/.cursor/plugins/local/grok-kit`
- PATH symlink `~/.local/bin/grok-kit`
- Slim user MCP to ICM only (backs up `~/.cursor/mcp.json` first; skip with `--skip-mcp-slim`)
- Stub `~/.cursor/permissions.json` if missing
- `grok-kit apply` on the current git repo now, and on other git repos at sessionStart when they lack `.cursor/grok-kit.json`

Not included unless you pass extra flags:

- `--learn` records local command and slash-skill *names* (no file contents) and writes `.cursor/grok-kit-proposals.json`
- `--improve` implies `--learn`. sessionStart may adapt only `.cursor/grok-kit.json` (enabled features plus learned workflow bullets). Never User Rules, persona, or kit `SKILL.md`

Recorded at `~/.cursor/grok-kit-consent.json`. Revoke with `grok-kit consent revoke` (stops background apply; does not delete project files already written).

Plugin symlink only, no user-layer, no auto-apply:

```bash
mkdir -p ~/.cursor/plugins/local
ln -sfn /path/to/grok-kit ~/.cursor/plugins/local/grok-kit

for d in /path/to/grok-kit/skills/*; do
  ln -sfn "$d" ~/.cursor/skills/"$(basename "$d")"
done
```

### ICM

Shared local memory. Setup: [`docs/icm-setup.md`](docs/icm-setup.md).

```bash
icm init --mode mcp
icm init --mode skill   # optional
```

Keep user-global MCP ICM-only ([`docs/mcp-snippets/user-mcp.icm-only.json`](docs/mcp-snippets/user-mcp.icm-only.json)). Product MCP belongs in the project's `.cursor/mcp.json`.

```bash
export HOT_MEMORY_FILE="$HOME/path/to/MEMORY.md"
export HOT_USER_FILE="$HOME/path/to/USER.md"
./scripts/seed-icm-from-memory.sh
```

### Layout

```
skills/                     slash skills (SKILL.md + scripts)
agents/                     verifier, debugger, researcher
rules/                      thin always-on kit pointer
hooks/                      sessionStart apply-if-consent, stop memory stub
templates/                  stack profiles, including tell-proof
scripts/                    install, ICM seed, grok-kit.mjs dispatcher
.cursor/verify/             kit ACI (verify.sh, feature-map, rubric)
docs/                       ICM, MCP snippets, companion, publish
.cursor-plugin/plugin.json  Cursor plugin manifest
plugin.json                 Grok Build metadata
```

Key paths after install: plugin at `~/.cursor/plugins/local/grok-kit`, consent at `~/.cursor/grok-kit-consent.json`, user MCP at `~/.cursor/mcp.json`. Never put API keys in ICM topics, rules, or handoff files.

Machine-specific checklist if this host is already applied: [`docs/SETUP-STATUS.md`](docs/SETUP-STATUS.md).

## FAQ

**Slash skills don't appear.** Reload the window. Check `~/.cursor/skills/` and `~/.cursor/plugins/local/grok-kit`. Re-run `./scripts/install-user-layer.sh --i-consent`.

**Plugin not listed.** The symlink should point at this clone. The install script removes leftover names `agent-kit` / `cursor-kit` under `plugins/local/`.

**I need my old global MCP servers back.**

```bash
cp ~/.cursor/mcp-servers.archived.json ~/.cursor/mcp.json
# or merge selected servers into a project's .cursor/mcp.json
# install also writes ~/.cursor/mcp.json.bak.grok-kit.<timestamp>
```

**ICM not found.** Install the binary and run `icm init --mode mcp`. See [`docs/icm-setup.md`](docs/icm-setup.md).

**Does this work in Grok Build?** Yes. Same `skills/`, `agents/`, `hooks/hooks.json`, and `plugin.json`. `grok plugin install /path/to/grok-kit --trust` from the clone. Put `grok-kit` on PATH with the install script, or run `node scripts/grok-kit.mjs`.

**Should I run a detached companion every day?** No. Stay in Cursor to write code, or Grok Build in the terminal with the same kit. Companions are eval / unattended only ([`docs/companion-agent.md`](docs/companion-agent.md)).

**Does this replace User Rules / persona?** No. Persona stays in User Rules. `/memory-sync` and `/refine-harness` propose. They do not silently rewrite identity.

**Will grok-kit watch how I work and change itself?** Only if you opt in. `install --learn` logs skill and workflow names locally. `install --improve` (or `learn apply --i-consent`) can enable optional features you already use. It never rewrites User Rules or kit `SKILL.md`.

**Why not put every skill in always-on rules?** Because the host then re-pays the whole prompt on every chat. grok-kit keeps that prefix tiny and stable, and compiles the real loops into commands. The longer explanation is [What grok-kit is good at](#what-grok-kit-is-good-at).

## Status

See [`docs/STATUS.md`](docs/STATUS.md) and [`docs/publish.md`](docs/publish.md).

| Item | Status |
| --- | --- |
| Local plugin via symlink / install script | Works today |
| Skills, agents, templates, ICM docs | In repo |
| Cursor Marketplace listing | Prep done. Manual submit at [cursor.com/marketplace/publish](https://cursor.com/marketplace/publish) |
| Grok Build catalog | Prep done. PR to [xai-org/plugin-marketplace](https://github.com/xai-org/plugin-marketplace) with a pinned `main` SHA |

Not in scope: becoming a full agent-framework product, unsupervised User Rules / `SKILL.md` mutation, or marketing this as a design-workflow kit. Consented `install --improve` may adapt `grok-kit.json` only.

## Contributing

This is a personal harness published for reuse. PRs that keep skills lean (bulk in `references/`), stay accurate to the install scripts, and skip vendor-name spam are welcome.

1. Fork and branch from `main`
2. Keep playbook skills thin
3. Match skill names and install behavior in docs
4. Open a PR with a clear why

Maintainer stop rules: [`GOAL_AND_LOOP.md`](GOAL_AND_LOOP.md).

## License

[MIT](https://github.com/ashishpatill/grok-kit/blob/main/LICENSE) © 2026 Ashish P
