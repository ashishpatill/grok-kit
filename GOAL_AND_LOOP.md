# Goal and Loop — grok-kit

## Goal

Ship an accurate, lean personal Cursor/agent harness kit: playbook skills, thin-parent orchestration, cost routing, ICM shared-memory bridge, project bootstrap, and user-layer install — without misrepresenting purpose or naming banned third-party vendors.

## In scope

- Progress authority (`GOAL_AND_LOOP.md`, `docs/STATUS.md`)
- Docs/skills/agents/plugin copy that matches what the tree actually contains
- Vendor-neutral wording in tree (no banned product names in new content)
- Install/symlink helpers and MCP snippets for ICM-first globals
- Land work via PR; merge only when explicitly requested

## Out of scope / frozen

- Rewriting git history to scrub old commit subjects
- Marketing as a design-workflow or “design superpower” kit
- Installing or operating a detached companion runtime as the daily driver
- Expanding into a full agent framework / marketplace product
- Silent identity or User Rules mutation

## Stop conditions

- Critical path Done → only soft-blocker / verify / metadata polish
- Do not expand into: companion product packaging, third-party vendor integrations by name, mega-skill dumps in always-on rules

## Definition of done

- [x] In-scope docs and progress authority present and accurate
- [x] No “design work” / design-superpower framing in kit-facing copy
- [x] Working tree free of banned vendor names in tracked content
- [x] PR #5 reviewed and merged to `main` (user-asked)
- [x] `grok-kit apply` adapts per project; tell-proof template; user + plugin auto-apply after `--i-consent`
- [x] Consented usage-learn: observe local skill/workflow names; adapt `grok-kit.json` only after `--improve` / `learn apply --i-consent`
- [x] Flagship session look: `/flagship` `/overview` `/visualise` (status + mermaid; host canvas if available)
- [x] No secrets committed; checks diagnosed or N/A documented

## Loop order

1. Inventory remaining
2. Implement next in-scope item
3. Commit semantically (granular)
4. PR → review → fix
5. Merge only if user asks
