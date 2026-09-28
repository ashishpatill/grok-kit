# SOURCE-MAP — Graph-of-bots memory research

**Audience:** Ashish (BIMLabz) + coding agents updating `docs/PLAN-graph-of-bots.md`  
**Date:** 2026-09-28 (Asia/Kolkata)  
**Rule:** Only cite what was actually read. No invented benchmarks. Numbers below are from the cited paper/docs only.

---

## Internal (BIMLabz / grok-kit) — must align

| Source | URL / path | What we took |
|--------|------------|--------------|
| PLAN — Graph of Bots (PR branch) | GitHub `ashishpatill/grok-kit` `docs/PLAN-graph-of-bots.md` ref `docs/graph-of-bots-plan` | Org graph + nested subgraphs; three memory layers (hot pin / long-tail store / craft audit); store contract `store` / `recall` / `list_namespaces`; Phase 4 = research one remote DB vs ICM; namespaces already listed |
| ICM setup (main) | GitHub `ashishpatill/grok-kit` `docs/icm-setup.md` ref `main` | Intelligent Context Memory (ICM) = shared local SQLite long-tail; hot pin = MEMORY.md / USER.md; topics `preferences`, `workspace-routing`, `project-<slug>`, `models`, `decisions-<slug>`, `errors-resolved-<slug>`, `handoff-<slug>`; optional embeddings; **no dual-write** hot MEMORY from multiple agent homes |
| ICM product | https://github.com/rtk-ai/icm | Local-first SQLite + FTS5 + optional sqlite-vec; MCP/CLI; same DB file shared across tools |
| WikiSkill → bot-memory plan | `/workspace/research/wikiskill/PLAN-dh-bot-memory.md` | Markdown craft can be a **view** of a pattern; packs; measured-only skill compile; YAML `happened/wrong/worked/next` |
| Prior org craft | `BIMLabz/bot-memory` (referenced in PLAN) | Per-bot GitHub YAML craft; v0 chose markdown over Obsidian/graph DB |

---

## Paper / system sources — external

| Source | URL | What we took (no invented numbers) |
|--------|-----|-------------------------------------|
| **MemGPT → Letta** (memory hierarchy) | Paper framing via Letta docs; https://www.letta.com/blog/agent-memory/ ; https://www.letta.com/blog/memgpt-and-letta/ | **Core / recall / archival** tiers = hot pin vs searchable transcript vs processed long-tail. Self-editing memory blocks. OS metaphor: limited context window managed like RAM. |
| **Letta MemFS** | https://docs.letta.com/concepts/memfs/ | Git-backed memory files; `system/` stays in prompt; shared memory for multi-agent; commits = version history — informs our **GitHub audit view** + versioned facts, not the runtime primary store |
| **A-MEM** (Agentic Memory) | https://arxiv.org/abs/2502.12110 ; NeurIPS 2025 proceedings PDF | Zettelkasten-style atomic notes with keywords/tags; **link + evolve** existing notes when new memories arrive — informs linking across bot/project namespaces and “memory evolution,” not a product pick |
| **Mem0** (how it works + paper) | https://docs.mem0.ai/core-concepts/how-it-works ; https://arxiv.org/html/2504.19413v1 | Messages → **extract facts** → dedupe/embed → search with filters (`user_id` / `agent_id`). Operations ADD / UPDATE / DELETE / NOOP. Paper reports LOCOMO LLM-as-Judge gains and **~91% lower p95 latency** vs full-context (their Table 2 / abstract). **Ingestion pipeline pattern** we adapt; we do **not** adopt Mem0 hosted as BIMLabz default |
| **Zep / Graphiti** | https://arxiv.org/abs/2501.13956 | Temporal knowledge graph: episode + semantic entity + community layers; fact invalidation over time. Their reported DMR **94.8% vs MemGPT 93.4%**; LongMemEval accuracy gains up to **18.5%** and latency cut ~**90%** vs full-context baseline (their Tables 1–2). Pattern for **episodic raw + semantic facts + time validity** — optional later graph layer, not Phase 4 default |
| **Microsoft GraphRAG** | https://microsoft.github.io/graphrag/ ; paper “From Local to Global” https://arxiv.org/abs/2404.16130 | Extract entities/relationships → community hierarchy → **community summaries** for global questions. Use for **org/project holistic recall** later; too heavy as primary chat-memory store for Phase 4 |
| **LangGraph Store** | https://docs.langchain.com/oss/python/langgraph/add-memory | Short-term = checkpointer (thread); long-term = namespaced Store `put` / `search`; PostgresStore + optional semantic index. Confirms **namespace + Postgres** is a proven production pattern close to our store contract |
| **Neon pgvector** | https://neon.com/docs/extensions/pgvector ; https://neon.com/guides/ai-embeddings-postgres-search ; https://neon.com/blog/dont-use-vector-use-halvec-instead-and-save-50-of-your-storage-cost | Vectors live **inside** Postgres with ACID, joins, backups. HNSW / IVFFlat indexes; `halfvec` ~**50%** storage vs full `vector` (Neon blog claim). Fits org already on Neon (SuperLearn) |
| **pgvector upstream** | https://github.com/pgvector/pgvector | Distance ops, index limits — technical reference for implementers |
| **Cognitive taxonomy** (framing only) | Survey / industry summaries citing Tulving + CoALA-style agent memory (e.g. overview articles; not used as benchmark) | Names we use: **semantic** (facts), **episodic** (events/transcripts), **procedural** (skills/how-to), **goals/agendas** (intent). Working/hot memory = always-loaded pin |

---

## Explicitly *not* used as product default

| Option | Why cited but not default |
|--------|---------------------------|
| Pinecone / Weaviate (hosted vector-only) | Strong search; splits truth from relational ACL/ownership unless you also run a SQL DB — extra vendor for BIMLabz when Neon already covers both |
| Mem0 Platform / Zep hosted | Good patterns; adds third-party memory SaaS and lock-in; Ashish asked for connectors on stack he already has |
| Full GraphRAG index as runtime bot memory | Batch corpus index, not multi-writer agent chat memory |
| Replacing Evidence Loom claim rules | Out of scope (hard constraint) |
| Diverting DeepHarness tip track | Out of scope (hard constraint) |

---

## Gaps (honest)

1. No BIMLabz-measured latency/cost bake-off of ICM vs Neon on real multi-bot traffic yet (Phase 4 research gate still needs a small CEO-approved spike).
2. ICM architecture.md / product.md were found via search listing; primary alignment used grok-kit `docs/icm-setup.md` + GitHub ICM README synthesis.
3. Pinecone/Weaviate pricing/latency not re-fetched line-by-line — comparison is architectural (split-brain vs single Postgres), not a price table.
4. CoALA / Tulving used only as plain-language type names; no claim that BIMLabz memory “implements” those papers.
