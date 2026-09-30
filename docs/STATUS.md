# Status — grok-kit

**Updated:** 2026-09-30
**Authority:** this file (GOAL_AND_LOOP.md for stop rules; SETUP-STATUS.md for machine install)

## Done

- Phase 0 plan: Graph of bots (`docs/PLAN-graph-of-bots.md`) — nested org graph (node can become a subgraph), multi-bot edges, memory store contract. Plan only; runtime graph not shipped
- Phase 4 memory research pack (`docs/research/graph-of-bots-memory/`) — recommendation published; informed store decision
- Binding v2 (`docs/PLAN-bot-memory-graph-v2.md`) — **store locked: Neon + pgvector** cloud-primary; ICM local replica candidate; GitHub bot-memory audit export only; MCP-first; event-triggered daemon; no gatekeeping. IDL v2.1 **frozen 2026-09-28**
- **Single-daemon bot memory is usable on main** — store/recall MCP, human-gated `propose`, episodic write paths, hot-pin + `mirror_export`, presence + launchd wake. P0–P3 in `memory/TASKS.md` landed. #32 / #33 retired paper gates (G.2 PLAN-dh, A0.4 nomic A/B, P1.X6 / P2.C1 Moose real MCP)
- Bot memory world-ready README + synthetic console screenshots/walkthrough (`memory/README.md`, `docs/assets/bot-memory/`)
- Kit tree: skills, agents, rules, hooks, templates, scripts, MCP snippets
- Local plugin symlink + user-layer install script
- Companion criteria + ICM setup docs
- Progress stubs: `GOAL_AND_LOOP.md`
- Positioning corrected: harness kit (not design-workflow marketing)
- README install / setup / usage
- Marketplace prep: LICENSE, logo, `.cursor-plugin/plugin.json`, root `plugin.json`, `docs/publish.md`
- Verify ACI (`/verify-aci`, project `.cursor/verify/verify.sh`)
- Merge-state CI watcher (`/watch-ci`, status-once default, `--fixture` offline)
- Rubric verify (mechanical checklist + judgment leftovers)
- Thin `/route-task` + compiled `state-tools` for `/orchestrate-rlm`
- Dogfood on grok-kit: `~/.local/bin/grok-kit` PATH install, compiled bootstrap / apply / route-task / session-handoff / skill-curator, rubric auto-diff includes untracked files
- `grok-kit apply`: per-repo detection + thin generated project rule; tell-proof profile
- Install consent: `--i-consent` / `I CONSENT` before user-layer, MCP slim, or background project apply
- Usage learn (opt-in `--learn` / `--improve`): local skill/workflow names → proposals → `grok-kit.json` adaptations only after consent
- KV cache: always-on project rules stay byte-stable; learned workflows stay in JSON; no-op `--improve` ticks do not rewrite `.mdc` files
- Flagship session look: `/flagship` `/overview` `/visualise` (compiler + mermaid; host canvas if available)
- Code hygiene: `/code-hygiene` ranks stale/low-quality files; human decides scrap / fix / keep; never auto-delete
- Tell-proof UI contract (`.cursor/verify/ui-contract.json`) + `/rsi` review-before-ship
- PR #5 reviewed and merged to `main` (verify ACI, watch-ci, rubric, PATH CLI)
- README maps how grok-kit uses Cursor (skills, agents, rules, MCP, hooks, plugin, Optimize For) and Grok Build (same plugin tree, `grok plugin install`, CLI, no plugin-root MCP dump)
- README "What grok-kit is good at" explains the harness in plain language (commands, subset load, consent, cheap models, dual-host, prove-then-stop) without naming other kits

## In progress

- Marketplace submit (Cursor form + Grok catalog PR)

## Remaining (ordered)

1. Submit Cursor Marketplace form (manual account step)
2. Open Grok Build catalog PR with pinned `main` SHA
3. Soft-verify reload / slash skills (machine-local)

## Blocked

| Item | Need |
|------|------|
| Cursor Marketplace listing | Logged-in submit at cursor.com/marketplace/publish + review |
| Grok Build catalog listing | PR to xai-org/plugin-marketplace after main SHA known |

## Deferred

- N-daemon bidirectional sync (open PR #21) — leave #21 alone; do not merge or rebase
- Expanding companion packaging beyond criteria doc
- Rewriting historical commit subjects with old framing
