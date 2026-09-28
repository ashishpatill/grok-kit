# Plan — Graph of Bots (inside grok-kit)

**Repo:** `ashishpatill/grok-kit`  
**Status:** plan only — not implemented  
**Audience:** Cursor / Grok Build coding agents + Grok Bot orchestrators  
**Date:** 2026-09-28 (Asia/Kolkata)  
**Owner ask (locked):** Ashish — arrange grok-kit as a flexible **organization graph** where each node is ideally a Grok Bot (or agent). Each node **can become a graph** (a nested crew / subgraph). Bots may connect to **multiple** other bots. Each bot keeps its own memory. Durable memory should live in a **database / vector store** (not only markdown in GitHub). Human checkpoints stay: apply / publish / pay.

This is **not** a third product. grok-kit stays a harness kit. The graph is wiring, skills, agents, docs, and a memory-backend contract inside this repo.

---

## 0. Research trail (continue from here — do not restart)

| Artifact | What it decided | Path / place |
|----------|-----------------|--------------|
| Ashish ask (Aug 2026) | Research how to orchestrate agent memories; optional Obsidian / advanced DBs / graph or memory engineering | CEO chat `[t133u]`/`[t134u]` |
| Org craft memory v0 | One private GitHub repo `BIMLabz/bot-memory`; per-bot folders; YAML `happened` / `wrong` / `worked` / `next`. **Explicitly skipped Obsidian and a local graph for v0** — markdown was source of truth | Skill: Bot GitHub memory; CEO memory 2026-08-26 |
| WikiSkill → bot-memory plans | Portable **packs** (filesystem / later MCP). Org YAML can be a *view* of a pattern, not the only store. Host options listed; **markdown enough for v0**; Graph/DB not required then | `/workspace/research/wikiskill/PLAN-dh-bot-memory.md`, `PLAN-dh-bot-memory-gepa.md` |
| Graph of bots narrative | Org graph (stable nodes) + work graph (per job) + context engineering + memory engineering + handoffs + human checkpoints. Memory = governed record, **not** a raw vector dump of chat | `/workspace/article/ARTICLE.md` |
| ICM in grok-kit | Shared **local SQLite** memory store for long-tail facts; hot pin stays small MEMORY/USER files; optional embeddings; `memory-sync` skill | `docs/icm-setup.md`, `skills/memory-sync/` |

**Honest gap:** there is no finished Research-group design yet for “node → subgraph + multi-parent edges + remote vector DB as the primary bot-memory store.” That is what this plan unparks. Prior work chose GitHub markdown for craft logs and ICM for local long-tail; we continue by **promoting the memory backend** and **encoding the expandable org graph in grok-kit**.

---

## 1. Goal (plain language)

Build kit artifacts so a coding agent can:

1. Declare an **org graph**: nodes (bots), edges (allowed connections with contracts), and **nested graphs** (a node that expands into its own crew).
2. Run a **work graph**: a temporary path for one job that may fan out across multiple edges.
3. Give each bot **scoped memory**: private long-tail in a store; craft log still human-readable.
4. Fail closed on handoffs (no invented ship status, no silent expensive models, no apply/publish/pay by bots).

**Done bar (later implementation PRs):** load grok-kit → read this plan + schemas/skills → instantiate one nested work-graph example end-to-end with memory read/write through the store contract — without inventing GitHub ship status.

---

## 2. Graph model (what “each node can become a graph” means)

### 2.1 Node

A node is ideally one Grok Bot / agent with:

- `id`, `role`, `one_job`
- `memory_scope` (which store topics / namespaces it may read/write)
- `edges_out` (who it may message / hand off to)
- optional `subgraph` — another graph (crew) this node owns

When `subgraph` is set, the node is both a **leaf worker to its parent** and a **coordinator inside its crew**. Example: DeepHarness node expands to Harness Engineer + TUI Specialist + Evals Expert + Product Ops.

### 2.2 Edge

Directed, typed, with a **contract** (required fields on every handoff). Multi-parent is allowed (one bot connects to many). No edge ⇒ no talk for that job.

Suggested edge types: `assign`, `research`, `review`, `ship_check`, `cost_route`, `publish_draft`, `human_gate`.

### 2.3 Work graph

Per job: select a path (or small DAG) through the org graph, including diving into subgraphs. Destroy or archive the work-graph instance when the job closes.

### 2.4 Kit artifacts to add (Phase 1+)

| Artifact | Purpose |
|----------|---------|
| `schemas/org-graph.schema.json` | Validate nodes/edges/subgraphs |
| `schemas/handoff.schema.json` | Required handoff payload |
| `examples/org-bimlabz.yaml` | Current BIMLabz roster as a graph (incl. DeepHarness / Research / bimrag / SuperLearn crews as subgraphs) |
| `skills/graph-handoff/SKILL.md` | How to send a contracted handoff |
| `skills/graph-expand/SKILL.md` | When/how a node expands into its subgraph |
| `docs/PLAN-graph-of-bots.md` | This file (implementer source of truth) |

---

## 3. Memory architecture (DB / vector store — not GitHub-only)

### 3.1 Layers (keep all three; do not collapse)

| Layer | What it is | Where |
|-------|------------|-----|
| Hot pin | Tiny always-loaded identity / prefs | MEMORY.md / USER.md (size-capped) |
| Long-tail store | Searchable durable facts per bot / project | **Primary:** ICM (SQLite, optional embeddings) already documented in grok-kit. **Later:** one remote DB or vector store behind the same API |
| Craft log (human view) | Measured `happened/wrong/worked/next` after real outcomes | `BIMLabz/bot-memory` markdown — remains the **audit view**, not the only runtime fetch path |

Ashish’s ask: runtime fetch should be optimized for bots. That means the **store** is the runtime source; GitHub craft YAML is the governed human/audit export (or a view), matching the WikiSkill plan line: YAML can be a view of a pattern, not the store.

### 3.2 Store contract (implement behind one interface)

Minimum operations coding agents must implement against:

- `store(namespace, text, metadata)`
- `recall(namespace, query, k)`
- `list_namespaces(bot_id)`

Namespaces (align with ICM topics): `preferences`, `project-<slug>`, `decisions-<slug>`, `errors-resolved-<slug>`, `handoff-<slug>`, `bot-<bot_id>`.

Rules:

- One write path per fact (no dual-write hot MEMORY from multiple homes).
- No secrets in the store.
- Craft log writes still require a **measured** outcome before YAML hits bot-memory.
- Vector embeddings are optional in Phase 1 (ICM supports `--no-embeddings`); enable when recall quality needs them.
- Phase 4 research (see [`docs/research/graph-of-bots-memory/`](research/graph-of-bots-memory/README.md)): compare ICM/SQLite, Neon + `pgvector`, hybrid, and alternatives; Ashish picks **one** primary durable store before implementation. Until then, treat the pack recommendation as a candidate, not decided.
- Namespaces include **bot**, **project**, and **feature** scopes (shared capabilities), not only per-bot topics — see the research pack for the full sketch.

### 3.3 Existing kit pieces (do not rebuild)

- `docs/icm-setup.md`
- `skills/memory-sync/SKILL.md`
- Bot GitHub memory skill / `BIMLabz/bot-memory`

---

## 4. Handoff contract (every edge)

Every handoff must carry at least:

- `job_id`, `from_node`, `to_node`
- `ask` (one sentence)
- `evidence` (links / SHAs / file paths — no vibes)
- `must_not` (fail-closed list)
- `memory_refs` (store namespaces the receiver should recall)
- `human_gate` if apply / publish / pay is next

Receivers fail closed if evidence is missing.

---

## 5. Phases

| Phase | Deliverable | Owner type |
|-------|-------------|-------------|
| **0** | This plan committed in `docs/PLAN-graph-of-bots.md` + README/STATUS pointers | Docs (this PR) |
| **1** | `org-graph` + `handoff` schemas; `examples/org-bimlabz.yaml` with at least one nested subgraph (DeepHarness or Research) | Coding agent |
| **2** | `graph-handoff` + `graph-expand` skills; wire to Grok Bot messaging / Cursor handoff patterns already in kit | Coding agent |
| **3** | Memory: document + thin wrapper skill so every bot uses ICM (or the chosen store) via the store contract; craft log remains export/view | Coding agent |
| **4** | Memory backend research pack landed in [`docs/research/graph-of-bots-memory/`](research/graph-of-bots-memory/README.md) (taxonomy, option compare, shared-feature ACL sketch). **Store choice is open for Ashish:** ICM/SQLite-only vs Neon + pgvector vs hybrid vs other — the pack’s Neon+pgvector hybrid is a **candidate recommendation only**, not a locked decision. Memory scopes are not bot-only: **project** nodes (crews) and **shared-feature** nodes (auth, billing, …) are first-class graph nodes with their own namespaces. CEO gates before any implementation spike | Research Delegation + CEO |
| **5** | One end-to-end demo path in docs (paper → nested research subgraph → Product Ops ship check) with store recalls shown | Docs + coding agent |

Do **not** start Phase 4 implementation until Phase 3 works locally.

### Phase 4 — memory backend (research pack; choice open)

Read [`docs/research/graph-of-bots-memory/README.md`](research/graph-of-bots-memory/README.md) before picking a store. Summary:

- **Open for Ashish:** primary durable store = ICM/SQLite-only, Neon + pgvector, hybrid (Neon primary + ICM local + GitHub audit), or another option after reading the pack.
- **Not decided:** [`MEMORY-RECOMMENDATION.md`](research/graph-of-bots-memory/MEMORY-RECOMMENDATION.md) proposes Neon + pgvector as the default **candidate**; CEO approval still required.
- **First-class nodes:** memory is scoped to **bots**, **projects** (crews), **shared features** (canonical auth/billing/deploy truth), and **org** — not a flat bot mesh only.
- Paste-ready detail: [`PHASE4-ADDENDUM.md`](research/graph-of-bots-memory/PHASE4-ADDENDUM.md); citations: [`SOURCE-MAP.md`](research/graph-of-bots-memory/SOURCE-MAP.md).

---

## 6. Non-goals

- Not a marketplace of bots.
- Not replacing Grok Bot’s built-in chat memory with a second hot pin.
- Not auto-posting, auto-applying, or auto-paying.
- Not inventing DeepHarness / SuperLearn ship metrics.
- Not dual-writing the same fact to ICM and hot MEMORY from two agent homes.

---

## 7. Verify (for implementers)

- [ ] `docs/PLAN-graph-of-bots.md` present and linked from README + STATUS
- [ ] Schema validates `examples/org-bimlabz.yaml` including one nested `subgraph`
- [ ] Handoff skill refuses missing `evidence`
- [ ] Memory skill can `store` + `recall` against ICM (or stub) for `bot-<id>`
- [ ] bot-memory craft write still measured-only

---

## 8. Pointers

- Narrative (story, not SoT): CEO box `/workspace/article/ARTICLE.md`
- WikiSkill memory packs: `/workspace/research/wikiskill/PLAN-dh-bot-memory.md`
- ICM: `docs/icm-setup.md`
- Phase 4 memory research pack: `docs/research/graph-of-bots-memory/`
- Prior org decision: markdown craft in `BIMLabz/bot-memory`; DB/graph deferred — **this plan unparks the deferred store + expandable graph inside grok-kit**
