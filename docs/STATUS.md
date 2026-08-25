# Status — grok-kit

**Updated:** 2026-08-25
**Authority:** this file (GOAL_AND_LOOP.md for stop rules; SETUP-STATUS.md for machine install)

## Done

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
- PR #5 reviewed and merged to `main` (verify ACI, watch-ci, rubric, PATH CLI)

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

- Expanding companion packaging beyond criteria doc
- Rewriting historical commit subjects with old framing
