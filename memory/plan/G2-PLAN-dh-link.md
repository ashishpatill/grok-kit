# G.2 — WikiSkill / GEPA docs reconcile (light note)

**Status:** partial / blocked on missing sources  
**When:** 2026-09-29 IST  
**Gate:** Freeze G.2 in `memory/TASKS.md` — *not* fully checked; this is the cheap link note only.

## What exists in-tree

| Doc | Role |
|-----|------|
| `memory/plan/FINAL-PLAN-V2.md` | **Authoritative** build plan (IDL v2.1, §10 honesty / evidence-weighing, §13 crash consistency, Q6 no-gatekeeping) |
| `docs/PLAN-bot-memory-graph-v2.md` | Mirror / earlier copy of the same v2 plan |
| `docs/PLAN-graph-of-bots.md` | Graph-of-bots harness plan; cites WikiSkill paths historically |
| `docs/research/graph-of-bots-memory/*` | Research pack that informed Neon + feature-* scopes |

## What does **not** exist in this repo

The freeze gate names:

- `PLAN-dh-bot-memory.md`
- `PLAN-dh-bot-memory-gepa.md`

Those were referenced as living under private `BIMLabz/bot-memory` / `/workspace/research/wikiskill/` (see FINAL-PLAN-V2 §17 and `docs/PLAN-graph-of-bots.md`). **They are not present in `ashishpatill/grok-kit`.** A full reconcile cannot invent their contents.

## Linkage (without inventing PLAN-dh content)

- FINAL-PLAN-V2 already folded what was findable from `docs/PLAN-graph-of-bots.md` (PR #9 lineage) and the research pack.
- WikiSkill themes that *are* reflected in FINAL-PLAN-V2 without needing the private files: craft YAML as **export/view**, measured procedural gates, packs as a portability idea — not as the runtime fetch path (Neon is).
- GEPA-specific design notes remain **unknown** until the PLAN-dh-gepa source is exported into the tree.

## Exit for a full G.2 check

1. Paste or grant read access so `PLAN-dh-bot-memory.md` + `PLAN-dh-bot-memory-gepa.md` land under e.g. `docs/research/wikiskill/`.
2. Diff against FINAL-PLAN-V2 §3 / §10 / §11; fold any missing memory-design specifics.
3. Then check G.2 in TASKS with a pointer to the diff note.

Until then: **leave G.2 unchecked**; authoritative plan remains FINAL-PLAN-V2.
