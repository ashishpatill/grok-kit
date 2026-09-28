# MEMORY-RECOMMENDATION — Graph of bots (BIMLabz)

**For:** Ashish (CEO) + implementers of `docs/PLAN-graph-of-bots.md` Phase 4  
**Date:** 2026-09-28 (Asia/Kolkata)  
**Scope:** Research + recommendation only. No code. Does not touch Evidence Loom claim-promote rules or DeepHarness tip work.

**Plain-language rule:** Every technical term is explained the first time it appears. Every acronym is spelled out once.

---

## One-sentence default (Phase 4)

**Default durable store = Neon (serverless Postgres already used at BIMLabz) + pgvector (Postgres extension that stores and searches “embeddings” — numeric fingerprints of text) as the primary long-tail memory; keep ICM (Intelligent Context Memory, local SQLite) for laptop / Phase-3 local share; keep GitHub `BIMLabz/bot-memory` YAML as the human audit view — not the runtime source of truth.**

---

## A) Memory taxonomy mapped to scopes

### What kinds of memory mean (plain language)

| Kind | Plain meaning | Everyday analogy |
|------|---------------|------------------|
| **Semantic** | Stable facts and meanings (“Clerk is our auth,” “Ashish prefers short memos”) | Encyclopedia entry |
| **Episodic** | Things that happened at a time (“On 2026-09-20 Research handed SuperLearn billing to Product Ops”) | Diary entry / meeting note |
| **Procedural / skills** | How to do work (SKILL.md playbooks, “when X fails, do Y”) | Recipe / muscle memory |
| **Goals / agendas** | What we are trying to achieve next (“Phase 4: pick remote store”; open agendas) | To-do list / OKRs |

These names follow common cognitive and agent-memory framing (facts vs events vs how-to vs intent). They map cleanly onto Letta’s core / recall / archival idea and Mem0’s “extract durable facts from chat,” without requiring those products.

### Who owns which scope in the org graph

Ashish’s USP: the graph is not bot-mesh only. **Projects** (groups of bots arranged for work) and **shared features** (auth, monetization/billing) are first-class nodes too.

| Scope | Node type | Semantic | Episodic | Procedural / skills | Goals / agendas |
|-------|-----------|----------|----------|---------------------|-----------------|
| **Bot** | One Grok Bot / agent | Own prefs, role facts, private decisions | Own chats, handoffs it sent/received, mistakes it made | Own skills under its pack / folder | Own agendas (`next` craft) |
| **Project** | Crew / work grouping (e.g. SuperLearn, DeepHarness subgraph) | Project decisions, stack choices, glossary | Job runs, ship checks, measured outcomes | Project-level skills (how *this* crew ships) | Project roadmaps / open asks |
| **Shared feature** | Capability node (auth, billing, deploy) used by many projects | Canonical feature facts (provider, env names *non-secret*, contracts) | Change log of feature decisions | Feature runbooks (how to rotate keys *process*, not the key) | Feature backlog owned by one authority bot |
| **Org** | BIMLabz root | Org-wide prefs, roster, non-negotiables | Org milestones / CEO gates | Org harness skills (grok-kit) | Company-level agendas |

**Edges matter:** a bot *attached* to a project may **read** project memory and **write** only into allowed namespaces (see section D). Shared-feature edges are **read-mostly** for consumer bots; **write** goes to the feature’s authority.

### Namespace sketch (extends ICM topics already in grok-kit)

Keep the PLAN store contract. Expand topics so scopes are explicit:

- `bot-<bot_id>.semantic|episodic|procedural|goals`
- `project-<slug>.semantic|episodic|procedural|goals`
- `feature-<slug>.semantic|episodic|procedural|goals`  ← **new, first-class**
- `org.semantic|…` plus existing: `preferences`, `workspace-routing`, `models`, `decisions-<slug>`, `errors-resolved-<slug>`, `handoff-<slug>`

Handoffs still pass `memory_refs` so the receiver knows which namespaces to recall (PLAN §4).

---

## B) Storage: what lives where

Think of four shelves. Do not collapse them (PLAN §3.1).

| Shelf | What it holds | Technology | Cost (relative) | Latency (feel) | Multi-agent writes | Privacy | Backup |
|-------|---------------|------------|-----------------|----------------|--------------------|---------|--------|
| **Hot pin** | Tiny always-loaded identity / prefs | `MEMORY.md` / `USER.md` (size-capped) | Free / disk | Instant (already in prompt) | **Dangerous** if many writers — **one write path only** (ICM doc rule) | Local to agent home; no secrets | Git of agent home if any |
| **Long-tail primary** | Searchable durable facts, summaries, learnings | **Neon + pgvector** (recommended) | Neon compute + storage + embedding API calls | Network RTT + SQL; typically hundreds of ms–low seconds with HNSW index | Postgres **transactions** + row locks / version columns | Project/branch ACLs; never store secrets | Neon PITR / snapshots |
| **Local long-tail (dev / Phase 3)** | Same facts while offline or single machine | **ICM SQLite** (+ optional embeddings) | Local disk | Very fast on one machine | File locks; **not** org multi-machine share | Machine-local | Copy the SQLite file |
| **Audit / craft view** | Measured `happened / wrong / worked / next` for humans | GitHub `BIMLabz/bot-memory` markdown/YAML | GitHub storage | Slow for bots (API + parse) | PR / commit discipline | Private repo | Git history |

### What goes on which shelf (decision table)

| Content | Primary home | Also |
|---------|--------------|------|
| Persona, user prefs that must always be present | Hot pin | Mirror durable copy in long-tail semantic |
| Years of agent↔agent and user↔agent interactions (raw or near-raw) | Long-tail **episodic** table (blob or object pointer + metadata) | Optional cold archive later |
| Summaries + durable facts + “errors resolved” | Long-tail semantic (rows + embeddings) | Craft YAML export when **measured** |
| Skills / procedural | Pack filesystem + long-tail pointers | bot-memory / WikiSkill pack view |
| Goals / agendas | Long-tail goals rows | Craft `next` field as view |
| Shared feature canonical truth | Long-tail `feature-*` with ACL | Audit export after change |

**Vector store** here means: a place that stores **embeddings** (lists of numbers that capture “meaning” of a sentence) so you can ask “find text like this” without exact keywords. **pgvector** puts those embeddings in the same Postgres database as your normal tables — so one backup, one access-control story, one join from “fact” to “who owns it.”

---

## C) Compare options for BIMLabz — pick one Phase 4 default

| Option | Fit for many bots + project nodes | Multi-machine share | ACL / ownership for shared features | Stack fit | Main risk |
|--------|-----------------------------------|---------------------|-------------------------------------|----------|-----------|
| **ICM / SQLite + embeddings only** | Good on one laptop; weak as org brain | Poor (file sync fights) | App-level only | Already in grok-kit Phase 3 | Becomes “each machine has a different truth” |
| **Neon + pgvector** | Strong: namespaces as rows + vector search in one DB | Strong (hosted) | SQL roles / row policies / app ACLs | **Already on Neon (SuperLearn)**; prefer connectors | Need schema + embedding pipeline discipline |
| **Hosted vector only (Pinecone / Weaviate)** | Good search | Strong | Weak alone — you still need SQL for graph nodes, ACL, versions | New vendor + second system of truth | Split-brain; higher ops |
| **Hybrid (recommended)** | Best | Strong | Strong | Neon primary + ICM local cache + GitHub audit | Must not dual-write hot pin; sync rules needed |

### Phase 4 default pick

**Hybrid with Neon + pgvector as PRIMARY durable runtime store.**

**Why (CEO-relevant):**

1. Ashish already wants **DB + vector as primary**; GitHub audit OK — matches PLAN §3 and this ask.
2. Org already runs **Neon** for SuperLearn → reuse account, branching, backups, connectors instead of a new memory SaaS.
3. **pgvector** (Neon docs) gives similarity search **inside** Postgres with ACID (Atomicity, Consistency, Isolation, Durability — “either the whole write lands or none does”), which shared-feature authority needs.
4. **ICM stays** for Phase 3 / local coding agents (PLAN: do not start Phase 4 implement until Phase 3 works locally).
5. **bot-memory GitHub** stays the measured craft **view** (WikiSkill plan + prior CEO choice), not the fetch path bots optimize for.
6. Hosted-vector-only fails the “shared feature consistency” USP unless you also build the relational graph elsewhere — wasted cost.

**Explicit non-picks for default:** Mem0/Zep/Letta as *hosted* products (patterns yes, new SaaS no); full GraphRAG as chat memory (corpus indexer, wrong shape); ICM-only for org-wide years of multi-bot history.

---

## D) Shared features stay consistent (no bot overwrites another)

Problem in plain language: Auth and billing must be the **same story** in SuperLearn and another project. If Harness Engineer and SuperLearn bot both “remember” different Clerk setups, the org graph lies.

### Recommended rules (Phase 4 — keep simple)

1. **Feature-node authority**  
   Each shared feature has exactly one **authority** bot (or human role) named in the org graph YAML. Only that authority may **write** `feature-<slug>.*` namespaces. Other bots get **read** (and propose via handoff).

2. **Write ACLs (Access Control Lists — who may write what)**  
   Store metadata: `owner_scope`, `writer_bot_ids[]`, `readers[]`. Reject `store()` if caller not in writers. Aligns with PLAN `memory_scope` on nodes.

3. **Single-writer + version** (default concurrency)  
   Every durable fact row has `version` (integer) or `updated_at` + `etag`. Writers send “update if version = N.” On conflict → fail closed; handoff asks authority to merge.  
   Prefer this over full **CRDT** (Conflict-free Replicated Data Type — fancy merge math for offline edits) in Phase 4 — CRDT is overkill until many offline writers exist.

4. **No dual-write of the same fact**  
   One write path into Neon (or ICM locally). Hot pin updated from **one** home only (ICM setup rule). Craft YAML is **export after measured outcome**, not a second live write.

5. **Propose / accept for cross-project changes**  
   Consumer bot opens a handoff edge `feature_change` with evidence → authority accepts → single write. Mirrors human apply/publish/pay gates.

6. **Optional later:** soft delete / `valid_from`–`valid_to` on facts (Zep-style temporal invalidation) for “we used Stripe, now Lemon Squeezy” without erasing history.

**Do not** let every project bot freely `UPDATE` shared semantic memory. That is how years-old work gets re-hallucinated.

---

## E) Ingestion: chat → summaries → durable facts

Pipeline (inspired by Mem0 extract/update and Letta summarize/evict; implemented against **our** store contract — not a vendor lock-in):

```
Raw interaction (user↔agent or agent↔agent)
        │
        ▼
1. Persist episodic record (append-only; pointer + metadata; no secrets)
        │
        ▼
2. Summarize turn / job (short; may replace older summary in hot or project pin)
        │
        ▼
3. Extract candidate facts (preferences, decisions, errors, goals)
        │
        ▼
4. Dedupe against existing (embedding similarity + keyword + same namespace)
        │
        ├─ ADD    → new row + embed
        ├─ UPDATE → version bump if richer / corrected
        ├─ DELETE / invalidate → contradict old fact (keep history row if temporal)
        └─ NOOP   → discard noise
        │
        ▼
5. Optional craft export → bot-memory YAML only if measured outcome (happened/wrong/worked/next)
```

### Rules that stop re-forgetting / re-hallucinating

| Step | Rule |
|------|------|
| **Dedupe** | Before ADD, `recall` top-k similar in same namespace; if same meaning → NOOP or UPDATE |
| **Conflict** | Contradictions do not silent-overwrite shared feature rows; authority + version |
| **Forget** | Soft-forget: mark `superseded_by` / `invalid_at`; hard-delete only for secrets/PII mistakes |
| **Measured craft** | GitHub YAML still requires real outcome (existing bot-memory / WikiSkill gate) |
| **No secrets** | PLAN + Mem0 docs agree: never store credentials |
| **Sleep / batch OK** | Heavy extract can run async (Letta “sleep-time” idea) so live bots stay snappy |

Episodic raw stays so you can re-summarize years later. Semantic store is what bots `recall` first. Procedural updates still obey DeepHarness / WikiSkill **measured** gates — this pack does not invent self-graded lessons.

---

## Alignment checklist with existing PLAN

- [x] Three layers kept (hot / long-tail / craft audit)
- [x] Store contract unchanged in spirit (`store` / `recall` / `list_namespaces`)
- [x] ICM remains Phase 3 local path
- [x] Phase 4 picks **one** remote primary: Neon + pgvector (hybrid with ICM + GitHub)
- [x] Projects + shared features as memory scopes (USP)
- [x] Evidence Loom / DeepHarness tip work untouched

---

## CEO decision needed

1. Approve **Neon + pgvector primary** (this rec) vs stay ICM-only until multi-machine pain is proven.  
2. Name **authority bots** for shared features (auth, billing) in `examples/org-bimlabz.yaml` when Phase 1 lands.  
3. Authorize a small Phase 4 **spike** (schema + 2 bots writing project + feature namespaces) before full implement — PLAN already says CEO gates Phase 4.
