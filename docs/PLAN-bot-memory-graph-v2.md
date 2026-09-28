# Bot Memory + Graph of Agents — Build Plan v2
**For:** Ashish (BIMLabz) · **Date:** 2026-09-28 · **Status:** PLAN ONLY, no code written. v2 incorporates Ashish's binding decisions (2026-09-28), his own plan found in grok-kit PR #9, and new delta research on NeonDB / event-triggered daemons / Tailscale.

**Reading guide:** §1 lists everything that changed from v1 and why. If you read v1, §1 + §5–§8 + §14 + §17 are the new material; taxonomy, honesty model, and graph design carry over with small updates.

---

## 1. What changed from v1 and why

| # | v1 | v2 | Why |
|---|---|---|---|
| 1 | SQLite + LanceDB, zero-daemon, local-first | **NeonDB (serverless Postgres) + pgvector, cloud-first**; local replica as read cache | **Ashish's binding decision** — one shared cloud memory for all devices/bots |
| 2 | Always-on-ish daemon assumed | **Event-triggered daemon**: sleeps; wakes on memory events or schedule; hosts its own worker agents | **Ashish's decision** + Neon scale-to-zero economics (idle daemons burn CU-hours) |
| 3 | Wake via Postgres LISTEN/NOTIFY considered | **Webhook wake + reconcile sweep**; LISTEN/NOTIFY rejected | Research: NOTIFY is a live signal — lost while asleep; needs a permanent direct connection that fights scale-to-zero |
| 4 | LanceDB native hybrid (dense + Tantivy BM25 + RRF) | **tsvector + GIN + pgvector, hand-fused RRF (k=60) in SQL**; `lakebase_text` BM25 behind a capability flag | pgvector has no sparse; ParadeDB `pg_search`/`pg_bm25` **removed for new Neon projects (Mar 2026)** — dead end on Neon |
| 5 | Moose interface unspecified | **MCP-first**: stdio for local clients, SSE/HTTP over Tailscale for remote; file-drop = MCP ingest tool; minimal HTTP (wake + health only) | **Ashish's decision** (MCP required; HTTP only if necessary — wake endpoint makes it necessary but tiny) |
| 6 | Model tier open (Ollama-first vs Grok API) | **OpenRouter cheap-tier cost routing** for all internal/consolidation LLM calls | **Delegated to us — decided** (consistent with his GrokKit cost-routing work) |
| 7 | Memory sharing open (shared vs per-bot namespaces) | **One shared memory for all bots** (Grok bot + Moose), daemon-managed | **Ashish's decision** |
| 8 | — | **Ashish's own plan incorporated** (see §3) | Found in grok-kit PR #9; treated as an additional instruction per his request |
| 9 | Embeddings: MiniLM 384-dim local, nomic via Ollama fallback | **MiniLM-L6-v2 384-dim, computed in-daemon** (zero API cost); storage math forces the choice (see §5) | Free-tier 0.5 GB cannot hold 10⁵ × 1536-dim f32 (586 MiB vectors alone) |
| 10 | Backups: restic cron | **pg_dump rhythm to local replica host + Neon branches**; 6-hour free PITR = incident-undo only | Neon's free PITR window is 6 hours — not a backup strategy |
| 11 | Taxonomy: 5 types; scopes global/node_local/edge; no write-permission model beyond the daemon | **+ `goals` type** (intent/agendas); **+ `feature-*` and `org.*` namespaces**; **feature-authority model reinterpreted per Q6**: no privileged writers — any bot may write with cited grounding; conflicts resolve via evidence-weighing (§10); optimistic `version` retained for conflict detection; advisory stewards optional | **Ashish's research pack** (`docs/research/graph-of-bots-memory/`) — shared features as first-class nodes is the org-graph USP; v2 had no permission model for them |
| 12 | Dedup/consolidation described in prose | **Canonical ingestion op-set: ADD / UPDATE / DELETE / NOOP** (Mem0 pattern) for every candidate fact | Research pack §E + Mem0 paper — gives the dedup/consolidation workers a crisp, testable contract |
| 13 | `vector(384)` f32 embeddings | **`halfvec(384)`** — ~50% storage (Neon blog); 10⁵ records ≈ 73 MiB | Neon's own guidance; doubles free-tier headroom, keeps the 768-dim A/B option cheap to adopt later |
| 14 | Local replica: bespoke SQLite read cache | **ICM (SQLite + FTS5 + sqlite-vec) as the candidate replica substrate** on devices | Research pack keeps ICM for Phase-3/local; convergent — ICM's shape matches the `hot`/`standard` profiles |
| 15 | Trust tiers for bots (5 verified contributions to graduate; provisional Moose; instant demotion on fabrication) | **No trust tiers, no per-bot access/authority levels.** Symmetric memory access for all bots; a decision's legitimacy comes from cited grounding in shared learnings, never from identity or tier; the autonomy matrix is bot-agnostic | **Ashish's decision (Q6)** — "I don't want gatekeeping"; authority comes from the source of truth, not from identity |

---

## 2. Binding decisions (Ashish, 2026-09-28 — recorded)

1. **Storage:** cloud-first on **NeonDB** (serverless Postgres). Local replica/cache with dynamic sync.
2. **Moose's interface:** **MCP required.** File-drop happens through MCP tools. HTTP only where necessary.
3. **Daemon:** event-triggered, not always-listening. Wakes when something lands in memory, runs processing jobs, sleeps; self-wakes on schedule. **Hosts its own worker agents** (organize memories, push to vector index, consolidation). MCP connects to the daemon. Reachable over the **Tailscale mesh** so all devices share one memory.
4. **Local replica:** keep a local replica/cache of cloud memory; sync strategy dynamic per project/agent/runtime need.
5. **Memory sharing:** **one shared memory** for Grok bot + Moose, daemon-managed.
6. **Model tier:** OpenRouter cheap-tier routing for internal/consolidation LLM calls (decided by delegation).
7. **Triage:** dynamic, not a fixed weekly budget. Tasks needing Ashish's approval or judgment route to him (batched, async); tasks the agent can handle are handled autonomously and logged, with a weekly digest for visibility. No fixed 30-minute cap — time varies by task.
8. **Autonomy:** task-class-based, not a fixed level — and adaptive over time. Money / sensitive / breaking / destructive changes → human approval always. Safe technical improvements (dedup, indexing, organizing, archiving, well-evidenced promotions) → agent autonomous. Each task class earns autonomy through demonstrated reliability; failures contract it; Ashish reviews the matrix.
9. **Memory format:** condensation-first. Chats are distilled into learnings, never stored raw — the store must stay real-time at 10⁵–10⁶ records over 2–3 years (p95 recall < 500ms). Raw trajectories kept only as compressed pointers.
10. **Source of truth:** memory is never displayed as "disputed". Originals are immutable and always preserved (named invariant). Contradiction triggers a truth-weighing resolution: the agent weighs evidence for old vs new, determines truth, and updates/improves the learning via the supersede chain. One evolving learning per concept — never duplicate documents.

### Governance detail (decisions 7–10 expanded)

**Dynamic triage routing:**
- **Needs Ashish → ask:** anything requiring his judgment, approval gates (money, sensitive, breaking, procedural/pinned writes), contradictions the agent cannot resolve with confidence.
- **Agent handles → do + log:** routine memory ops, auto-approve-lane promotions, consolidation, indexing, backups, mirror exports.
- **Visibility:** weekly digest of autonomous actions (what was done, what was auto-approved) so nothing happens blind. Ashish spends time only where his judgment is required — no fixed time budget.

**Task-based autonomy matrix (bot-agnostic — identical for every bot; no per-bot tiers):**
| Task class | Examples | Policy |
|---|---|---|
| Financial | API spend, paid tiers, anything involving money | Human approval always |
| Sensitive / breaking | schema migrations, publish/release, identity changes, anything that could break apps later | Human approval always |
| Destructive | deletes, retiring pinned/procedural memories | Human approval always |
| Procedural / pinned writes | new skills, workflows, preference changes | Human approval always |
| Learning promotion | new learnings | Auto-approve if high-evidence + no contradiction (rules A1–A3); else human review |
| Routine memory ops | dedup merges, embedding backfill, indexing, organizing, archiving, backups, mirror export | Agent autonomous |

**Adaptive autonomy:** each task class carries a track record (volume, error rate, human overrides). As a class demonstrates reliability over time, its autonomy expands (wider auto-approve rules); on failures it contracts. The daemon logs the evidence behind every change; Ashish reviews and adjusts the matrix. Autonomy is earned per task class, never granted globally.

**Condensation requirement (scale):** the store is designed for 2–3 years of operation at 10⁵–10⁶ memory records with real-time retrieval (p95 < 500ms). The write path distills chats into atomic learnings; raw material is compressed with pointer references only. The consolidation worker (§7) is the enforcement mechanism: it distills, merges duplicates, and archives. Learning drives task progress — retrieval feeds the agent loop, it doesn't just accumulate.
11. **Research-pack authority model adopted, reinterpreted per Q6 (decision 12):** shared features are first-class memory scopes (`feature-*`); no privileged writers — any bot may write with cited grounding; conflicts resolve via evidence-weighing (§10); optimistic versioning retained for conflict detection. The pack's open store choice is resolved by decision 1 (NeonDB).
12. **No gatekeeping (Q6 answered):** no trust tiers, no per-bot access or authority levels. All bots have symmetric access to the shared memory — a learning lives in the store, not in any agent, and is available to every agent or to none. A bot's decision/action is legitimate iff it is grounded in shared learnings it cites (memory IDs recorded in provenance) — authority comes from the source of truth, not from identity. The autonomy matrix (§2.8) is bot-agnostic: it governs task classes, never bot identities. Consequence: the feature-authority write ACL is reinterpreted as advisory stewardship (a named point of responsibility, not a gatekeeper); conflicting writes resolve through the evidence-weighing resolution workflow (§10).

---

## 3. Ashish's own plan — found and incorporated

**Found:** `docs/PLAN-graph-of-bots.md` ("Plan — Graph of Bots (inside grok-kit)"), open PR #9 on `ashishpatill/grok-kit` ([PR #9](https://github.com/ashishpatill/grok-kit/pull/9)). His WikiSkill/GEPA research notes live in the **private** `BIMLabz/bot-memory` repo — not accessible; see §17 for what's needed.

**Adopted into v2:**
- **Three-layer memory model** (his framing, kept): (1) *hot pin* — tiny always-loaded identity/prefs (MEMORY.md/USER.md); (2) *long-tail store* — searchable durable facts, now NeonDB behind one API; (3) *craft log* — the private markdown repo as the **audit view**, "not the only runtime fetch path." His line "YAML can be a view of a pattern, not the store" is exactly v1's export-only mirror — convergent, kept.
- **Bot-facing store contract** `store(namespace, text, metadata)` / `recall(namespace, query, k)` / `list_namespaces(bot_id)` — layered **over** the richer IDL (§12), not replacing it. Simple surface for bots; full machinery underneath.
- **His namespace scheme adopted as canonical:** `preferences`, `project-*`, `decisions-*`, `errors-resolved-*`, `handoff-*`, `bot-*` — mapped to (scope, type, bot_id) triples in the schema.
- **His rules kept:** one write path per fact; no secrets in the store; craft-log writes require a *measured* outcome; human checkpoints on apply/publish/pay.
- **His handoff contract folded into the edge envelope:** `job_id`, `from_node`, `to_node`, `ask`, `evidence` (links/SHAs/paths — no vibes), `must_not` (fail-closed), `memory_refs`, `human_gate`.
- **His Phase-2 question** ("compare Neon + pgvector vs hosted vector DBs vs ICM — remote only if local insufficient") is **resolved by his own decision**: NeonDB. No further comparison needed.

**Where v2 improves on his plan (per his instruction to improve where research suggests it):**
- His plan left embeddings "optional in Phase 1" — v2 makes them **required from day one** on the Neon path: without vectors there is no semantic recall, and the storage math (below) shows 384-dim fits the free tier.
- His plan had no wake/consolidation mechanics — v2 adds the event-triggered daemon + worker-agent design (§7).
- His plan had no crash-consistency story — v2's single-writer + in-column vectors + sweeper (§13) is simpler than anything his plan sketched, because pgvector keeps vectors in the row (no dual-store divergence).
- His plan deferred "node → subgraph + remote vector DB as primary" as an honest gap — v2 closes it: subgraph nesting kept from v1, NeonDB is the primary.

### Research pack — found and incorporated (2026-09-28)

**Found:** `docs/research/graph-of-bots-memory/` on the same branch (`README.md`, `MEMORY-RECOMMENDATION.md`, `PHASE4-ADDENDUM.md`, `SOURCE-MAP.md`) — Ashish's Phase-4 memory research, written the same day as v2. Its open store choice ("ICM/SQLite-only vs Neon + pgvector vs hybrid") is **resolved by his binding NeonDB decision**; the recommendation's hybrid default (Neon primary + ICM local + GitHub audit) converges with v2's architecture.

**Adopted into v2.1:**
- **Shared features as first-class memory scope** with the authority model — **reinterpreted per Q6 (no gatekeeping)**: `feature-*` namespaces remain the canonical scope for shared features, but there is no privileged writer; any bot may write provided it cites grounding learnings, and conflicting writes resolve through the evidence-weighing resolution workflow (§10). Optimistic versioning retained for conflict *detection*. The org graph may name an advisory steward per feature (point of responsibility, not a gatekeeper) (§4, §11, §12).
- **`goals` as a memory type** (intent/agendas) alongside the v2 types.
- **`feature-*` and `org.*` namespaces** added to the canonical scheme.
- **Ingestion op-set ADD / UPDATE / DELETE / NOOP** as the contract for dedup/consolidation workers.
- **ICM as the candidate local-replica substrate** for device profiles (its SQLite + FTS5 + sqlite-vec shape matches `hot`/`standard`).
- **halfvec(384)** for the embedding column (~50% storage win per Neon).
- **P1 exit criterion:** two bots + one project namespace + one feature namespace, with an ACL-reject test on unauthorized write (from the addendum's Phase-4 exit criteria).

**Where v2.1 improves on the pack (per his instruction):**
- The pack's authority model stopped at "fail closed, ask authority to merge" — v2 routes unresolvable conflicts into the **source-of-truth resolution workflow** (§10) with evidence-weighing, not just a merge request.
- The pack kept episodic raw "so you can re-summarize years later" — v2's **condensation requirement** (§2.9) is stricter: raw is compressed pointers only, learnings are distilled at write time, because the scale target (10⁵–10⁶ records, real-time) demands it.
- The pack's "optional later" temporal validity is **in v2 from day one** (`valid_from`/`valid_to` bi-temporal columns).
- External grounding added from the pack's source map: Mem0's ~91% p95 latency win, Zep's LongMemEval numbers, LangGraph's PostgresStore precedent, A-MEM's link-and-evolve (independent convergence with §10's one-evolving-learning-per-concept).

---

## 4. Memory taxonomy (kept from v1)

**v2.1:** working, episodic, semantic, procedural, **goals** (intent/agendas — from the research pack), reflective (deferred to P3); identity/preference as `pinned=true` on semantic. See v1 §1 for the paper grounding (CoALA 2309.02427, Generative Agents 2304.03442, MemGPT 2310.08560, Reflexion 2303.11366, Voyager 2305.16291, MemoryBank 2305.10250, Mem0 2504.19413, Zep/Graphiti 2501.13956, A-MEM 2502.12110, Sleep-time Compute 2504.13171).

**v2 addition — namespace mapping** (Ashish's scheme → storage):

| Namespace | Maps to | Notes |
|---|---|---|
| `preferences` | type=semantic, scope=global, pinned=true | Human-write-only |
| `project-*` | type=semantic/episodic, scope=global, bot_id=project | Per-project shared facts |
| `decisions-*` | type=episodic, scope=global | Timestamped, append-only |
| `errors-resolved-*` | type=episodic, scope=global | Verify-loop outcomes, high importance |
| `handoff-*` | type=working/episodic, scope=edge | Pairwise rooms, auto-expire or summarize on close |
| `bot-*` | type=any, scope=node_local | Per-bot private scratchpad inside the shared DB |
| `feature-*` | type=any, scope=global, namespace=feature-\<slug\> | **No-gatekeeping** (Q6): any bot may write, but writes must cite grounding learnings; conflicting writes resolve via the resolution workflow (§10), never by privilege; optimistic `version` for conflict detection; optional advisory steward named in org graph |
| `org.*` | type=semantic/goals, scope=global | Org-wide prefs, roster, non-negotiables; human-gated writes |

---

## 5. Storage architecture v2 — NeonDB cloud-primary

**Stack:** NeonDB Postgres 16+, `pgvector` 0.8.x, `pg_trgm` for fuzzy complement. One database, vectors **in-column** — no second store, no dual-write divergence.

### Schema (core)

```sql
CREATE EXTENSION vector;
CREATE EXTENSION pg_trgm;

CREATE TABLE memories (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type          text NOT NULL,   -- working|episodic|semantic|procedural|goals|reflective
  scope         text NOT NULL,   -- global|node_local|edge
  namespace     text NOT NULL,   -- preferences|project-*|decisions-*|errors-resolved-*|handoff-*|bot-*
  bot_id        text,            -- owning/calling node (NULL for global)
  text          text NOT NULL,
  text_tsv      tsvector GENERATED ALWAYS AS (to_tsvector('english', text)) STORED,
  embedding     halfvec(384),    -- NULL until embed-worker fills it; fp16 ≈ 50% of f32 storage (Neon), HNSW-supported
  embedding_model text,          -- e.g. 'minilm-l6-v2@1' — recorded from day one
  importance    smallint,        -- 1..10, cheap-model scored
  strength      real,            -- Ebbinghaus strength, ranking signal
  status        text NOT NULL DEFAULT 'staged',  -- staged|indexed|archived (no 'contested' state: contradictions go through the resolution workflow, §10)
  pinned        boolean DEFAULT false,
  -- provenance (NOT NULL enforced: writes without provenance are rejected)
  source_session text NOT NULL, trajectory_ref text,
  author        text NOT NULL,   -- node_id or 'human:ashish'
  origin        text NOT NULL,   -- internal|external
  valid_from    timestamptz DEFAULT now(),
  valid_to      timestamptz,     -- NULL = currently valid
  superseded_by uuid REFERENCES memories(id),
  version       integer NOT NULL DEFAULT 1,  -- optimistic concurrency; conflicts → resolution workflow (§10)
  created_at    timestamptz DEFAULT now()
);
CREATE INDEX ON memories USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 128);
CREATE INDEX ON memories USING gin (text_tsv);
CREATE INDEX ON memories (namespace, status, created_at);

-- change feed for replica sync + daemon wake
CREATE TABLE sync_log (
  seq       bigserial PRIMARY KEY,
  memory_id uuid NOT NULL REFERENCES memories(id),
  op        text NOT NULL,       -- insert|update|supersede|retire|contest
  ts        timestamptz DEFAULT now()
);

-- review queue (single, daemon-owned)
CREATE TABLE review_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,            -- proposal|resolution
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  created_at timestamptz DEFAULT now()
);

-- (no namespace ACL table: per Q6 there are no per-bot access levels; conflict detection via version, resolution via the §10 workflow)
```

### Key engineering decisions (delta-research grounded)

- **Embedding dims fixed at 384** (MiniLM-L6-v2, in-daemon ONNX via transformers.js, zero API cost), stored as **`halfvec(384)`** — fp16, ~50% of f32 storage per Neon's guidance, HNSW-supported. Storage math: 10⁵ × 384 × 2 B ≈ **73 MiB** — comfortable headroom inside Neon's 0.5 GB free tier for text + indexes. nomic-embed-text 768-dim stays a spike-stage A/B option (10⁵ × 768 × 2 B ≈ 147 MiB still fits as halfvec; adopt only on measured recall@10 delta > 0.05).
- **HNSW tuning:** `m=16`, `ef_construction=128`, query-time `hnsw.ef_search=100`. Set `hnsw.iterative_scan` if WHERE-filtered HNSW queries under-return vs LIMIT.
- **Hybrid search:** keyword leg = `text_tsv @@ plainto_tsquery` + `ts_rank_cd`; vector leg = HNSW cosine; **fuse ranks with RRF k=60 in SQL** (fuse ranks, not raw scores — cosine is bounded [0,1] and clusters, `ts_rank_cd` is unbounded). `pg_trgm` on `text` as a fuzzy complement for typo tolerance. No `pg_bm25`/ParadeDB — unavailable to new Neon projects. `lakebase_text` (true BM25) behind a **capability flag**, adopted only after its GA status on Neon projects is confirmed; the RRF-SQL shape doesn't change, only the keyword leg's ranking function.
- **Branches for every schema migration:** instant copy-on-write clone with production-like data; migrate on the branch, verify, then apply to main. **Migrations always on the direct (unpooled) connection string.**
- **Connections:** daemon's normal traffic on the **pooled** (`-pooler`) URL; a dedicated **direct** connection only where session state is needed. `connect_timeout` 10–15 s with retry/backoff (scale-to-zero suspends terminate connections; first-query wake is 300–500 ms).
- **Backups:** Neon's free PITR = **6 hours** (incident-undo only, not a backup). v2 backup rhythm: **weekly `pg_dump` → local replica host** (retention 4 weeks) + a **Neon backup branch before every migration**. Recommendation: budget the Launch plan (7-day PITR, $0.20/GB-month history) once the corpus is load-bearing — see Q9 in QUESTIONS-V2.md.

---

## 6. Local replica + dynamic sync

The replica is a **read cache**, not a second source of truth. Single writer (the daemon) → no merge conflicts, ever.

- **Mechanism:** devices pull deltas from `sync_log` (`WHERE seq > last_token`). The daemon is the sync authority.
- **Sync profiles** (chosen per device at runtime — this is the "dynamic" part):
  | Profile | What syncs | For |
  |---|---|---|
  | `hot` | pinned + last-30d episodic + active `project-*` namespaces | Phone / low-storage devices |
  | `standard` | hot + full semantic/procedural (text only, no vectors) | Laptop, fast text search |
  | `full` | everything incl. vectors (SQLite + embedded vector index) | Daemon host (doubles as the backup target) |
- **Triggers:** on daemon wake (push notification to devices), on schedule (daily), on explicit pull. Offline-first reads served from the replica; **writes always go through the daemon** (MCP), never to the replica directly.
- **Phasing:** P1 = `full` replica on the daemon host (backup story); P2 = per-device profiles.
- **ICM convergence (research pack):** ICM (local SQLite + FTS5 + optional sqlite-vec — already the Phase-3 local memory in grok-kit) is the candidate substrate for the on-device replica; its shape matches the `hot`/`standard` profiles. P2 evaluates ICM-as-replica fed by the daemon's `sync_log` change feed, rather than a bespoke SQLite cache. Single-writer discipline is unchanged: devices never write to the replica directly.

---

## 7. Daemon design v2 — event-triggered, worker agents, Tailscale

### Components

1. **`memory-mcp`** — the MCP server. stdio for local clients (Cursor spawns on demand); SSE/HTTP for remote clients (Moose) over the Tailscale mesh. Hosts the memory tools (§12). Write path: validate → `INSERT` memory row + `sync_log` entry + enqueue pg-boss job **in one transaction** → respond. Then it nudges the daemon awake (webhook) and returns — it never waits for processing.
2. **`memory-daemon`** — the background processor. **Sleeps by default** (zero DB connections while asleep — this is what lets Neon scale to zero). On wake: connect (pooled) → **reconcile sweep** (claim orphaned pg-boss jobs, backfill `WHERE embedding IS NULL`) → drain the job queue with its worker agents → close connections → sleep.

### Wake triggers
- **Webhook** (primary): `POST https://<daemon>.tailnet:8443/wake` with a bearer token, fired by `memory-mcp` after writes and by any device client. Served via `tailscale serve --bg` (tailnet-only HTTPS — never `funnel`/public).
- **Scheduled self-wake**: systemd timer on the daemon host (e.g. nightly 02:00 for consolidation). Long intervals only — anything ≤5 min would pin Neon compute awake and burn CU-hours.
- **Manual**: `memory wake` CLI over the tailnet.

### Worker agents (pg-boss job handlers, all idempotent)
| Job | Does |
|---|---|
| `embed_memory` | Compute MiniLM embedding, `UPDATE memories SET embedding` (idempotent by id) |
| `score_importance` | Cheap-model 1–10 importance via **OpenRouter cheap tier** |
| `dedup_check` | Classify every candidate into **ADD / UPDATE / DELETE / NOOP** (Mem0 op-set): sim≥0.92 → UPDATE/merge, ≥2-evidence → ADD fast-lane, contradiction → resolution workflow (§10), noise → NOOP, TTL-expired → DELETE/retire |
| `consolidate` | Sleep-time job: reflection, ExpeL insight extraction, decay + archive, usage voting |
| `mirror_export` | DB → markdown → commit to the private bot-memory repo (**export-only**; corrections via `supersede()`) |
| `backup` | Weekly `pg_dump` → local replica host |

pg-boss (Node, MIT) on the same Neon DB: `SKIP LOCKED` claiming, transactional enqueue, `retryLimit`/`retryDelay`/`expireInMinutes`, singleton/jobKey dedup, dead-letter inspection. **Why not LISTEN/NOTIFY for wake:** NOTIFY is a live signal — lost while the daemon sleeps — and holding a LISTEN subscription needs a permanent direct connection that fights scale-to-zero. Webhook + reconcile sweep is the sound shape.

### Crash recovery
Daemon dies mid-job → pg-boss lease expires → job re-claimable on next wake (at-least-once; handlers idempotent). Daemon host runs under `systemd Restart=always`. Startup invariant: **reconcile sweep before serving**.

### Tailscale
Daemon host = one always-available tailnet node (home mini-PC / Mac — not the phone). Stable `100.x` IP + MagicDNS; tailnet ACL locked to Ashish's devices; bearer token on the wake endpoint as the app-layer check (Tailscale identity gets you to the door, the token proves the caller is his write path).

---

## 8. MCP-first interface

**Two layers:**
- **Bot-facing (simple, from Ashish's plan):** `store(namespace, text, metadata)` · `recall(namespace, query, k)` · `list_namespaces(bot_id)` · **`ingest_file(namespace, filename, content_base64, metadata)`** — this is the file-drop path: files enter memory through an MCP tool, no separate channel. `store()` stamps `caller_node_id` and requires cited grounding (the memory IDs the write is based on); the daemon remains the single writer to Neon, but no bot is privileged over another.
- **Daemon-facing (full IDL, v1 §6 kept):** `remember`, `propose` (auto-approve A1/A2/A3; procedural + pinned = human-always), `promote`/`reject_proposal` (curator as `svc:curator`), `supersede`, `resolve_contradiction` (truth-weighing workflow per §10 — replaces the old `contest` concept; contradictions are resolved, never displayed as "disputed"), `recordUsage` (feeds the per-task-class reliability track record for adaptive autonomy — bot-agnostic), `review_list`/`review_decide`, `admin_checkpoint`, `get`, `stats`. The daemon translates bot-facing calls into IDL calls, stamping `caller_node_id`.

**HTTP: minimal by design** — wake endpoint + `/health` only, tailnet-only. (This is the "build HTTP only if necessary" answer: necessary, but tiny.)

**Cold-start contract kept:** `recall()` returns `{status: cold_start|thin|ok, …}` — agents surface "no memory found," never hallucinate memories.

---

## 9. Model tier — decided: OpenRouter cheap-tier routing

All internal/consolidation LLM calls (importance scoring, dedup judgments, consolidation reflection, ExpeL extraction) route through **OpenRouter with cheap-tier cost routing** — cheapest capable model first, consistent with his GrokKit cost-routing work. Embeddings stay local (MiniLM ONNX in-daemon, $0). No Ollama daemon required on the memory path. Per-call model + cost logged alongside the memory it touched (provenance includes inference cost — fits the honesty model).

---

## 10. Honesty model — source of truth (revised per Ashish 2026-09-28)

**Core principle: memory is the source of truth, and the original is never lost.** Named invariant: every source record is immutable and preserved with full provenance. If an interpretation turns out wrong, the original is still there to re-derive from — the catastrophic case (wrong interpretation + lost original) is structurally impossible.

- **Provenance as schema constraint** (writes without it rejected) · **append-only everything** · invalidate-don't-delete with `superseded_by` chains · the markdown repo as **export-only mirror**.
- **No "disputed" display state.** Contradiction is not a label on a memory — it is a **resolution workflow**: when new information contradicts a stored learning, the agent weighs the evidence for old vs new (recency, source reliability, corroboration, provenance), determines which is true (or merges them), and updates/improves the learning through the supersede chain. Full history preserved; the concept's current truth always points at the latest resolution.
- **One evolving learning per concept** — memories are not duplicate documents. A repeat observation reinforces (strength +) rather than duplicating; a conflicting observation triggers resolution, not a second competing record.
- **Resolution routing (ties to governance §2):** high-confidence resolutions with strong evidence → agent resolves autonomously and logs; low-confidence or sensitive contradictions → human review queue. Procedural/pinned contradictions → human always.
- **Grounded action, no gatekeeping (Q6):** any bot may act on any learning it can retrieve — learnings live in the shared store, not in agents. An action's legitimacy comes from the grounding it cites (memory IDs recorded in provenance), never from the bot's identity or tier. There are no per-bot access levels. Fabrication is handled by invalidating the *learning* (evidence check + resolution workflow), not by demoting the *bot*.
- Write gates by type (episodic/node-local automatic; global semantic via `propose()`; procedural + pinned = human always) · wrong-learning drill as a P2 exit criterion · internal recall benchmark (50–100 hand-checked pairs) re-run on every retrieval change.

---

## 11. Agent graph design (kept from v1, updated for shared memory)

- **Substrate:** minimal TypeScript orchestrator (~300 lines) — registry + dispatch + pause/resume for consent gates. One TS stack with GrokKit. LangGraph upgrade path with written triggers (>15 nodes, multi-day durable waits, hot-path fan-out).
- **Topology: blackboard-first** — the shared board is the shared-memory surface; the board now lives **on Neon** (a `blackboard` table), not SQLite. Supervisor = deterministic routing function; "event bus" = the outbox table on Neon.
- **Memory scopes in one shared DB:** GLOBAL (propose→curate→promote only) · NODE-LOCAL (`bot-*` namespace, `bot_id`-filtered — private scratchpad inside the shared store) · EDGE-SCOPED (`handoff-*`, auto-expire or summarize on close) · **FEATURE-SCOPED** (`feature-*`: canonical truth for shared features — auth, billing, deploy; any bot may write provided it cites grounding learnings; conflicting writes resolve via the resolution workflow (§10), never by privilege; the org graph may name an advisory steward per feature — a point of responsibility, not a gatekeeper) · **PROJECT-SCOPED** (`project-*`: the crew's bots read/write per the autonomy matrix). Scoped retrieval enforced server-side.
- **Node contract:** `node_id`, role/goal/backstory, `capabilities[]`, `model_policy` (OpenRouter cheap-tier per node), `tools[]`, `memory_scopes`, `consent_gates[]`, `verify_hooks[]`, `lifecycle`. Nodes may nest as subgraphs (his plan's crew expansion).
- **Edges typed with his handoff contract:** `task`, `handoff`, `verdict`, `memory_diff` (→ `propose()`), `consult` — envelope carries `msg_id, trace_id, from_node, ts, provenance_chain` **plus** his `job_id, ask, evidence, must_not, memory_refs, human_gate`. Edges carry **references, never memory dumps**.
- **Learning propagation:** propose → curate (rotating duty; deterministic fast-path auto-approve) → promote (only write path to global). Gossip notifies about learnings, never carries them.
- **Learning loops:** v1 ships the FAST loop only (Reflexion attempt→verify→reflect — GrokKit's verify loops already are this). Medium (Voyager skill promotion) and slow (Generative-Agents reflection) move to P3 with explicit triggers.
- **Failure modes + mitigations** (kept): poisoning (AgentPoison 2407.12784, MINJA 2503.03704) · runaway feedback loops · stale learnings (bi-temporal validity) · contradiction storms · context bloat · eval collapse — see v1 §5.

---

## 12. IDL v2 — frozen build contract

v1's IDL stands, with these v2.1 amendments: **`namespace` is a first-class parameter** (`preferences`, `project-*`, `decisions-*`, `errors-resolved-*`, `handoff-*`, `bot-*`, plus **`feature-*`** and **`org.*`** from the research pack); bot-facing `store/recall/list_namespaces/ingest_file` layered on top; `scope` retained for node_local/edge isolation inside the shared DB; **`type` gains `goals`**; `store()` requires cited grounding memory IDs (no per-bot access levels — Q6); facts carry optimistic **`version`** (conflict detection → resolution workflow). Config kept: dedup_sim 0.92, min_evidence_auto 2, reinforce +0.5 / penalize −1.0, recall k=8. **This IDL freezes at the P0 exit gate** — Ashish signs it before P1.

---

## 13. Crash consistency v2 (single writer, in-column vectors)

Simpler than v1 — pgvector keeps vectors **in the row**, so there is no dual-store divergence to manage:
1. `memory-mcp` commits in one Neon transaction: memory row (`embedding=NULL`, `status='staged'`) + `sync_log` entry + pg-boss job enqueue.
2. Daemon wakes, worker claims job (`SKIP LOCKED`), computes embedding, `UPDATE … SET embedding=…, status='indexed'` — idempotent by id.
3. Daemon startup **sweeper**: backfill `WHERE embedding IS NULL`; requeue orphaned jobs.
4. `admin_checkpoint()`: `SELECT count(*) FROM memories WHERE embedding IS NULL` = 0 AND pg-boss dead-letter empty.
5. Replica staleness is bounded and explicit: every replica tracks `last_seq`; `recall()` on a device can report replica lag.

---

## 14. Phased build plan v2

### P0 — Parallel spikes (1–2 weeks)
- **A0 (Neon spike):** schema on a **Neon branch** (not main); 5k synthetic + 500 real memories from the bot-memory repo; 50 hand-built queries measuring recall@10, p50/p95 latency; embedding A/B (MiniLM-384 local vs nomic-768); RRF-SQL hybrid vs keyword-only baseline. **Stay if** recall@10 ≥ 0.7 AND p95 < 500ms; **kill trigger:** < 0.6 on both → the corpus/queries are the problem, stop.
- **B0 (daemon spike):** wake via tailnet webhook → drain one pg-boss job → sleep; systemd timer self-wake; cold-start chain timed (webhook → first Neon row < 2 s target).
- **C0 (MCP spike):** stdio `memory-mcp` serving `store`/`recall` against the Neon branch; one Cursor session round-trip.
- **FREEZE GATE (serial):** Ashish answers QUESTIONS-V2.md + signs IDL v2. Later changes need written sign-off.

### P1 — Prototypes (3–4 weeks)
- **Memory:** full schema + provenance/validity/review tables on Neon main; `memory-mcp` (all tools) + CLI twin; import pipeline (bot-memory repo + ICM → seeded memories, content-hash dedup, contradictions → review queue); worker agents (embed, score, dedup, mirror, backup); `full` replica on daemon host; cold-start contract live.
- **Graph:** TS orchestrator + blackboard/outbox on Neon; curator client; 3 nodes (grok-coder-01, verifier-01, curator-01) + scripted Moose stand-in over MCP; stuck-debug round-trip.
- **Exit gates:** conformance suite green · `kill -9` mid-write → zero loss on restart · restore drill (pg_dump → fresh branch → checkpoint clean) succeeds · **Moose's real MCP onboarding recorded** (no longer a stand-in) · **no-gatekeeping spike:** two bots writing concurrently to one `feature-*` namespace; conflicting writes resolve through the resolution workflow (evidence-weighing) with full provenance — proving consistency without privilege.

### P2 — Integrations (2–3 weeks, serial on P1 gates)
- GrokKit: `memory-sync` writes via `propose()`; `session-handoff` emits episodes; verify-loop outcomes auto-emit episodic records; `refine-harness` cites memory IDs.
- Moose onboards behind the frozen contract; first real cross-system learning promoted and reused.
- Per-device replica profiles (`hot`/`standard`) live; dynamic sync verified (phone pulls hot-set over Tailscale).
- **Wrong-learning drill:** deliberately propose a plausible-but-false learning → must land in the human queue, never auto-promote. **Exit:** drill passes + Ashish approves gate behavior live.

### P3 — Consolidation + hardening (ongoing)
- Scheduler: consolidation job (decay + archive, `as_of` time-travel, reflective-type activation, ExpeL extraction + usage voting); medium learning loop (Voyager skill promotion) with standing eval set (15–30 regression tasks) gating promotions; poisoning red-team exercises.
- **Exit:** 4 weeks non-decreasing eval pass rates; one stale learning correctly retired; one red-team false learning caught; node #4 bootstraps from a distillation pack routinely.

---

## 15. Explicit non-goals (v1–P2)

No graph database (LadybugDB only on the 4+-hop trigger) · no sparse vectors (pgvector has none; tsvector leg covers exact-token) · no `pg_bm25`/ParadeDB (unavailable on Neon) · no LISTEN/NOTIFY wake path · no bidirectional git sync · no multi-user/multi-tenant SaaS · no cloud/vendor APIs in the critical path (OpenRouter is used, but every call is cheap-tier and logged; embeddings stay local) · no weight updates or fine-tuning · no autonomous skill or identity mutation · no self-modifying code · no sub-50ms latency SLA · no LangGraph until ADR triggers fire · no graph-initiated action while Ashish is offline (only consolidation runs autonomously).

---

## 16. Open questions → QUESTIONS-V2.md

Decided: storage (NeonDB) ✓ · Moose interface (MCP) ✓ · daemon shape (event-triggered) ✓ · memory sharing (one shared) ✓ · model tier (OpenRouter cheap) ✓ · triage (dynamic, §2.7) ✓ · autonomy (task-class-based + adaptive, §2.8) ✓ · condensation-first scale requirement (§2.9) ✓ · source-of-truth resolution model (§2.10, §10) ✓ · backup default: weekly pg_dump to daemon host (adjustable) ✓ · no gatekeeping — no trust tiers, no per-bot access/authority levels (§2.12) ✓.
All five questions answered.

---

## 17. What I need from Ashish

1. **Freeze-gate sign-off** on the IDL v2.1 (§12) before P1 starts — all five governance questions are answered; this is the last gate before the P0 spikes.
2. **The WikiSkill/GEPA plans**: they live in the private `BIMLabz/bot-memory` repo, which I can't read. Either grant read access or paste/export the two docs (`PLAN-dh-bot-memory.md`, `PLAN-dh-bot-memory-gepa.md`). The grok-kit PR #9 plan **was found and is incorporated above** — but if the WikiSkill/GEPA docs contain memory-design specifics beyond it, I should fold those in too.
2. **Name feature stewards (advisory)** (from the research pack, reinterpreted per Q6): when the org graph lands (P2), name a point of responsibility for each shared feature (`feature-auth`, `feature-billing`, …) — a human role or a bot node. Advisory only, not a gatekeeper. Not blocking for P0/P1.

---

## 18. Sources (v1's §11 stands; new in v2)

**NeonDB:** neon.com/docs/extensions/pgvector · neon.com/docs/postgres/backup-restore/history-window · neon.com/docs/connect/connection-pooling · neon.com blog "CommSync Runs Text, Vector, and Hybrid Search" (Lakebase Search) · neondatabase/agent-skills hybrid-search.md · pgvector upstream (HNSW 2,000-dim ceiling on `vector` type).
**Daemon/queues:** pg-boss README (timgit/pg-boss — SKIP LOCKED, transactional enqueue, scheduling) · Graphile Worker docs · Postgres LISTEN/NOTIFY production notes (lossy-signal semantics).
**Tailscale:** tailscale.com/docs (`serve --bg` for tailnet-only HTTPS; ACL/grant policy; MagicDNS).
**Ashish's plan:** `ashishpatill/grok-kit` PR #9, `docs/PLAN-graph-of-bots.md` (found 2026-09-28; incorporated §3).
**Research pack source map additions** (from `docs/research/graph-of-bots-memory/SOURCE-MAP.md`): Mem0 paper (2504.19413) reports **~91% lower p95 latency** vs full-context — external grounding for the condensation requirement (§2.9); Zep/Graphiti (2501.13956) LongMemEval accuracy gains up to **18.5%**, ~90% latency cut — grounding for episodic+semantic+temporal design; LangGraph `PostgresStore` (namespaced `put`/`search`) — production precedent for namespace+Postgres matching our store contract; Letta MemFS (git-backed memory files, commits as version history) — precedent for the GitHub audit view; A-MEM (2502.12110) link-and-evolve notes — independent convergence with §10's one-evolving-learning-per-concept; Neon blog "don't use vector, use halfvec" — ~50% storage saving, adopted for the embedding column.
