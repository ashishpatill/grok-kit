## Phase 4 addendum — Memory backend default (research locked 2026-09-28)

**Status:** Research recommendation published for Ashish to review — **not implemented**. Store choice (ICM/SQLite vs Neon+pgvector vs other) is **open** until Ashish decides.  
**Source pack:** [`docs/research/graph-of-bots-memory/`](./) (`SOURCE-MAP.md`, `MEMORY-RECOMMENDATION.md`).  
**Non-goals unchanged:** do not replace Evidence Loom claim-promote rules; do not divert DeepHarness tip work; do not dual-write hot `MEMORY.md` from multiple agent homes.

### Research recommendation (not a locked decision)

**Recommended candidate** for org-wide durable memory = Neon (serverless Postgres) + pgvector (Postgres extension for storing and searching embeddings — numeric fingerprints of text so bots can find “similar meaning,” not only exact keywords).

**Keep alongside (do not collapse):**

| Layer | Role |
|-------|------|
| Hot pin | Tiny always-loaded identity / prefs in `MEMORY.md` / `USER.md` |
| ICM (Intelligent Context Memory) | Local SQLite long-tail for Phase 3 and single-machine / laptop agents (`docs/icm-setup.md`) |
| Neon + pgvector | **Candidate** runtime source of truth once multi-machine / multi-bot share is required |
| `BIMLabz/bot-memory` GitHub YAML | Human **audit / craft view** (`happened` / `wrong` / `worked` / `next`) after measured outcomes — not the optimized bot fetch path |

Store contract from §3.2 stays: `store(namespace, text, metadata)`, `recall(namespace, query, k)`, `list_namespaces(bot_id)`.

### Why this default (plain language)

1. Ashish asked for database + vector as **primary**; GitHub as audit is OK.  
2. BIMLabz already runs Neon (e.g. SuperLearn) — prefer connectors on the existing stack over a new hosted-vector vendor alone.  
3. pgvector keeps facts, ownership, and similarity search in **one** database with normal backups and transactions (all-or-nothing writes), which shared features need.  
4. ICM-only cannot be the long-term org brain across many machines without sync fights.  
5. Hosted vector-only (Pinecone / Weaviate style) still needs a relational store for project/feature nodes and write permissions — extra system for little gain here.

### Org graph memory scopes (USP)

Memory is scoped to graph nodes, not only bots:

- **Bot** — private semantic / episodic / procedural-skills / goals-agendas  
- **Project** — crew memory (group of bots arranged for work)  
- **Shared feature** — first-class node (auth, monetization/billing, …) so many projects share one consistent truth  
- **Org** — roster-level prefs and non-negotiables  

Suggested namespaces (extend ICM topics): `bot-<id>.*`, `project-<slug>.*`, `feature-<slug>.*`, `org.*`, plus existing `preferences`, `decisions-<slug>`, `errors-resolved-<slug>`, `handoff-<slug>`, …

### Shared-feature consistency (no overwrite wars)

- Each `feature-<slug>` has **one authority** writer named in the org graph.  
- Other bots: **read** + propose changes via contracted handoff; authority alone `store`s.  
- Rows carry a **version**; conflicting updates fail closed (retry / human), not silent merge.  
- Full CRDT (fancy offline merge) is **out of scope** for Phase 4.  
- Craft YAML export remains measured-only; never a second live write of the same fact.

### Ingestion sketch (chat → durable memory)

1. Append **episodic** record of the interaction (no secrets).  
2. Summarize.  
3. Extract candidate durable facts.  
4. Dedupe / conflict: ADD, UPDATE (version bump), invalidate, or NOOP.  
5. Optional export to bot-memory craft after a **measured** outcome.

Goal: bots recall years-old decisions and mistake learnings instead of re-hallucinating or re-forgetting.

### Phase 4 exit criteria (Ashish chooses before coding)

- [ ] Ashish picks primary store: Neon + pgvector, ICM/SQLite-only, hybrid, or another option after reading this pack.  
- [ ] Phase 3 ICM wrapper skill works locally (existing Phase table).  
- [ ] Spike: two bots + one project namespace + one feature namespace with ACL reject on unauthorized write.  
- [ ] Document connection via existing Neon connector patterns; no secrets in store.  
- [ ] Confirm GitHub craft remains audit export only.

### Implementer pointer

Full taxonomy, comparison table, and source citations:  
[`MEMORY-RECOMMENDATION.md`](./MEMORY-RECOMMENDATION.md) and [`SOURCE-MAP.md`](./SOURCE-MAP.md).
