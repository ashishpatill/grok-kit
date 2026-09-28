# v3 Unified Frozen IDL — Agent Memory (Track A implements, Track B consumes)

Status: FROZEN pending Ashish sign-off. After sign-off, no signature changes without a v4 and both-track sign-off.
Date: 2026-09-28. Reconciles Track A (memory service) and Track B (agent graph) interface contracts.

## 1. Divergence decision log (one line each)

- **D1 recall shape → Track A envelope wins.** `recall()` returns `{status, memories, stats}`; the cold-start contract is non-negotiable (agents must surface "no memory found," never hallucinate). Track B's bare `ScoredMemory[]` is rejected.
- **D2 MemoryType → Track A wins; no "identity" type.** Identity/preference = `type="semantic"` + `pinned=true` (human-write-only when true). `"working"` is kept (Track B's omission was an oversight — node scratch needs it). `"reflective"` is reserved: `propose()`/`remember()` reject it with `VALIDATION` until P3. Added `pinned_only` to `recall()` so Track B can do identity recall within Track A's model.
- **D3 curator verbs → NO `curate()` tool; Track B's four verdicts map onto Track A's tools.** approve → `promote()` / `review_decide(approve)`; merge → propose-time auto dedup-merge (rule A1) or `review_decide("edit", new_text=<merged>)`; reject → `reject_proposal()`; contest → new `contest()` tool (below).
- **D4 `contest()` and `recordUsage()` ADDED** (genuine Track B gaps). Full signatures below. Verified contribution := `recordUsage` with `outcome="success"` AND non-empty `evidence_refs`. Trust-tier graduation (Track B registry): 5 verified contributions by one node. ExpeL-style voting: strength update on every usage + auto-contest when fail-rate ≥ 0.5 over ≥ 3 uses.
- **D5 ProposalStatus → Track A's vocabulary wins** (`pending|auto_approved|human_approved|rejected|expired`). Track B's lifecycle words move to record/conflict level: "merged" → `auto_approved` + `record.merged_into`; "superseded" → `record.superseded_by`; "contested" → `ConflictRecord.status="open"`; "staged" → `pending`; "approved" → `human_approved`/`auto_approved`.
- **D6 `promote()` keeps `decided_by`.** Track B's curator acts as service account `svc:curator`. Procedural or pinned proposals decided by anyone except `human:ashish` → `HUMAN_ONLY` error.
- **D7 `remember()` direct-write allowlist = (scope ∈ {node_local, edge}) × (type ∈ {working, episodic}).** Everything else (any global write, any semantic/procedural/pinned write, node_local semantic) → `USE_PROPOSE`. Track A's "episodic only" wording extended to working (node scratch is the same trust class).
- **D8 `review_list` generalized** to `review_list({status: "pending"|"decided"|"all", item_kind?: "proposal"|"conflict"})`; `review_decide(item_id, …)` accepts proposal or conflict ids. One queue, two item kinds.
- **D9 Events extended:** added `memory.contested`, `memory.retired`, `memory.usage_recorded`. Track B's daemon subscribes; no polling required.

## 2. Unified IDL (TypeScript)

### 2.1 Primitives and enums

```ts
type Ulid = string;            // time-ordered unique id
type IsoTs = string;           // ISO-8601 UTC
type NodeId = string;          // e.g. "node:coder-3"
type EdgeId = string;          // e.g. "edge:node-a->node-b"
type DecidedBy = string;       // "human:ashish" | "svc:curator" | NodeId

type MemoryType   = "working" | "episodic" | "semantic" | "procedural" | "reflective";
type MemoryScope  = "global" | "node_local" | "edge";
type RecallStatus = "cold_start" | "thin" | "ok";
type ProposalKind = "promote" | "supersede" | "merge" | "retire";
type ProposalStatus = "pending" | "auto_approved" | "human_approved" | "rejected" | "expired";
type ConflictStatus = "open" | "upheld" | "dismissed";
type UsageOutcome  = "success" | "fail";
type Origin        = "internal" | "external";
type IndexStatus   = "pending" | "indexed" | "archive_pending" | "archived"; // §4
```

### 2.2 Records

```ts
interface Provenance {
  source_session: string;
  trajectory_ref?: string;
  author: NodeId | "human:ashish";
  origin: Origin;
  created_at: IsoTs;
  embedding_model: string;
  evidence_refs?: string[];
  import_batch?: string;
}

interface ScoreBreakdown { // read-only, populated on recall
  vector: number; recency: number; strength: number; pin_boost: number;
}

interface UsageSummary {
  uses: number; successes: number; verified_uses: number; fail_rate: number;
}

interface MemoryRecord {
  id: Ulid;
  type: MemoryType;
  scope: MemoryScope;
  node_id?: NodeId;
  edge_id?: EdgeId;
  text: string;                 // atomic: one claim per record
  importance: number;           // 1..10
  strength: number;             // Ebbinghaus S, 0..10
  last_recalled_at?: IsoTs;
  valid_from: IsoTs;
  valid_to?: IsoTs;
  approval: "live" | "staged";  // staged = created via proposal, awaiting decision
  superseded_by?: Ulid;
  merged_into?: Ulid;           // set when dedup-merged away (rule A1)
  contested?: boolean;          // true while an open conflict exists
  pinned: boolean;              // identity/preference marker; human-write-only when true
  links: Ulid[];
  provenance: Provenance;
  score_breakdown?: ScoreBreakdown;
  usage?: UsageSummary;
}

interface ConflictRecord {
  conflict_id: Ulid;
  record_id: Ulid;
  raised_by: NodeId | "human:ashish" | "system:auto-vote";
  reason: string;
  evidence_refs?: string[];
  status: ConflictStatus;
  created_at: IsoTs;
  decided_by?: DecidedBy;
}

interface ReviewItem {
  item_id: Ulid;                            // proposal_id or conflict_id
  item_kind: "proposal" | "conflict";
  kind: ProposalKind | "contest";
  type?: MemoryType;
  text?: string;
  pinned?: boolean;
  status: ProposalStatus | ConflictStatus;
  created_at: IsoTs;
  evidence_refs?: string[];
  record_id?: Ulid;                         // target for supersede/retire/contest
}

interface UsageStat {
  memory_id: Ulid;
  by_node?: NodeId;
  uses: number; successes: number; verified_uses: number; fail_rate: number;
}
```

### 2.3 Tools — reads

```ts
function recall(args: {
  query: string;
  memory_types?: MemoryType[];
  scope?: MemoryScope;
  node_id?: NodeId;
  edge_id?: EdgeId;
  time_range?: { from?: IsoTs; to?: IsoTs };
  as_of?: IsoTs;                    // point-in-time recall over valid_from/valid_to
  k?: number;                       // default 8
  min_strength?: number;
  include_archived?: boolean;       // default false; archived served from SQLite only
  pinned_only?: boolean;            // default false — identity/preference recall (D2)
  include_contested?: boolean;      // default true — contested rows returned with flag
  caller_node_id: NodeId;           // required: audit trail on every read
}): {
  status: RecallStatus;             // cold_start: 0 eligible records in scope (agent MUST
                                    //   surface "no memory found"); thin: 1-2 candidates; ok: 3+
  memories: MemoryRecord[];         // staged (approval!="live") rows NEVER returned here
  stats: { candidates: number };    // candidates considered post-filter
};

function get(id: Ulid, caller_node_id: NodeId): MemoryRecord;
// Point read from SQLite — authoritative regardless of index_status (§4).

function stats(scope?: MemoryScope): {
  counts: Record<MemoryType, number>;
  oldest: IsoTs | null;
  newest: IsoTs | null;
  store_status: { sqlite_rows: number; index_vectors: number; pending_index: number; ok: boolean };
};

function usage_stats(filter?: { memory_id?: Ulid; by_node?: NodeId }): UsageStat[];
```

### 2.4 Tools — writes

```ts
function remember(args: {
  text: string;
  type: MemoryType;                 // "reflective" → VALIDATION until P3
  scope?: MemoryScope;              // default "node_local"
  node_id?: NodeId;
  edge_id?: EdgeId;
  importance?: number;              // default 5
  evidence_refs?: string[];
  origin?: Origin;                  // default "internal"
  caller_node_id: NodeId;
}): { id: Ulid; status: "written" }
 | { error: "USE_PROPOSE" | "SCOPE_DENIED" | "VALIDATION"; detail: string };
// Direct-write allowlist (D7): scope ∈ {node_local, edge} AND type ∈ {working, episodic}.
// Anything else — any global write, any semantic/procedural/pinned write — returns USE_PROPOSE.

function propose(args: {
  kind: ProposalKind;
  type: MemoryType;                 // "reflective" → VALIDATION until P3
  text: string;
  pinned?: boolean;                 // identity/preference → forces human-only path
  supersedes_id?: Ulid;             // required when kind == "supersede"
  evidence_refs?: string[];
  importance?: number;
  valid_to?: IsoTs;
  caller_node_id: NodeId;
}): {
  proposal_id: Ulid;
  decision: "auto_approved" | "queued_for_review";
  record_id?: Ulid;                 // present when auto_approved (live) or staged
  merged_into?: Ulid;               // present when rule A1 dedup-merged
  detail?: string;
};
// Scope of the resulting record is ALWAYS global.
// AUTO-APPROVE RULES (evaluated inside propose(), in order; config in §2.6):
//   A1 dedup_merge: max cosine sim ≥ 0.92 vs an active same-type record → merge into it
//       (append links/evidence, bump importance), decision auto_approved, merged_into set.
//   A2 evidence_backed: evidence_refs.length ≥ 2 → auto_approved.
//   A3 ttl_retire: kind == "retire" and target record expired (valid_to passed) → auto_approved.
// HUMAN-ALWAYS: type == "procedural" OR pinned == true → auto rules DISABLED, always
//   queued_for_review; only "human:ashish" may decide (else HUMAN_ONLY).

function promote(
  proposal_id: Ulid,
  decided_by: DecidedBy,            // Track B curator passes "svc:curator"
  note?: string
): { record_id: Ulid }
 | { error: "NOT_FOUND" | "ALREADY_DECIDED" | "HUMAN_ONLY"; detail: string };
// Human path: Ashish via CLI review. Curator path: svc:curator may promote/reject any
// non-procedural, non-pinned proposal.

function reject_proposal(proposal_id: Ulid, decided_by: DecidedBy, reason: string): { ok: true };

function supersede(
  id: Ulid,
  new_text: string,
  reason: string,
  evidence_refs?: string[],
  caller_node_id?: NodeId
): { old_id: Ulid; new_id: Ulid; proposal_id: Ulid };
// Creates a "supersede" proposal + STAGED new record (approval="staged", invisible to
// recall, visible via get). On approval: new record goes live, old row archived with
// superseded_by=new_id. Event: memory.superseded.

function contest(
  record_id: Ulid,
  reason: string,
  evidence_refs?: string[],
  caller_node_id: NodeId
): { conflict_id: Ulid; status: "contested" };
// Sets record.contested=true, inserts a ConflictRecord into the single review queue
// (visible in review_list as item_kind="conflict"), emits memory.contested.
// Resolution via review_decide(conflict_id, "approve"|"reject", {decided_by}):
//   approve → contest UPHELD → record retired (event memory.retired).
//   reject  → contest DISMISSED → contested flag cleared.
//   "edit" on a conflict → VALIDATION error.

function recordUsage(args: {
  memory_id: Ulid;
  outcome: UsageOutcome;
  by_node: NodeId;
  note?: string;
  evidence_refs?: string[];        // trajectory/step refs
}): {
  memory_id: Ulid; uses: number; successes: number;
  verified_uses: number; strength: number; contested: boolean;
};
// Appends a usage event (SQLite table memory_usage). verified := outcome=="success"
//   AND evidence_refs non-empty. VERIFIED CONTRIBUTION (D4) := a verified usage event;
//   5 verified contributions by one node ⇒ Track B registry graduates it to trusted tier.
// ExpeL-style voting: strength += +0.5 on success / −1.0 on fail (clamp 0..10).
// Auto-vote: if uses ≥ 3 AND fail_rate ≥ 0.5 → contested=true, conflict queued with
//   raised_by="system:auto-vote", event memory.contested. Emits memory.usage_recorded.
```

### 2.5 Tools — review queue (single queue, owned by Track A)

```ts
function review_list(filter?: {
  status?: "pending" | "decided" | "all";   // default "pending"
  item_kind?: "proposal" | "conflict";
}): ReviewItem[];

function review_decide(
  item_id: Ulid,                            // proposal_id or conflict_id
  decision: "approve" | "reject" | "edit",
  opts?: { new_text?: string; decided_by: DecidedBy; note?: string }
): { ok: true } | { error: "NOT_FOUND" | "ALREADY_DECIDED" | "HUMAN_ONLY" | "VALIDATION"; detail: string };
// proposal + approve ≡ promote(); proposal + reject ≡ reject_proposal();
// proposal + edit (new_text required) ≡ approve with replaced text — the curator-merge path (D3).
// conflict + approve → upheld → record retired; conflict + reject → dismissed → flag cleared.
// Procedural/pinned items: decided_by must be "human:ashish".

function admin_checkpoint(): { snapshot_path: string; ok: boolean };
// SQLite VACUUM INTO snapshot + manifest {embedding_model, index_version}. LanceDB is
// NOT snapshotted (rebuildable). Recovery = restore SQLite → full re-index (§4).
```

### 2.6 Config (service-level, not per-call)

```ts
interface MemoryServiceConfig {
  dedup_sim_threshold: number;   // default 0.92 (rule A1)
  min_evidence_auto: number;     // default 2    (rule A2)
  reinforce_success: number;     // default +0.5 (recordUsage)
  penalize_fail: number;         // default -1.0 (recordUsage)
  auto_contest_min_uses: number; // default 3
  auto_contest_fail_rate: number;// default 0.5
  recall_default_k: number;      // default 8
}
```

### 2.7 Events (SSE stream from memory service; Track B daemon subscribes)

```ts
type MemoryEvent =
  | { name: "memory.proposed";       proposal_id: Ulid; kind: ProposalKind; type: MemoryType }
  | { name: "memory.promoted";       proposal_id: Ulid; record_id: Ulid }
  | { name: "memory.superseded";     old_id: Ulid; new_id: Ulid; proposal_id: Ulid }
  | { name: "memory.contested";      conflict_id: Ulid; record_id: Ulid; reason: string }
  | { name: "memory.retired";       record_id: Ulid; reason: string }
  | { name: "memory.usage_recorded"; memory_id: Ulid; by_node: NodeId; outcome: UsageOutcome; verified: boolean }
  | { name: "review.decided";        item_id: Ulid; item_kind: "proposal"|"conflict";
                                     decision: "approve"|"reject"|"edit"; decided_by: DecidedBy };
```

## 3. Joint assumptions — confirmed post-reconciliation

- [x] **Single review queue owned by Track A.** All proposals and conflicts live in the memory service's queue (`review_list`/`review_decide`); Track B holds no separate queue.
- [x] **Track B's curator is a client.** It calls `propose()` / `promote()` / `reject_proposal()` / `contest()` / `recordUsage()` as `svc:curator` and subscribes to review outcomes via the event stream (no `curate()` tool exists).
- [x] **Auto-approve rules live inside `propose()`** (A1 dedup merge, A2 evidence-backed, A3 TTL retire — §2.6 for thresholds).
- [x] **Procedural + pinned writes are human-always.** Auto-approve disabled; `promote()`/`review_decide()` on such items require `decided_by="human:ashish"`.

## 4. Crash-consistency protocol — SQLite (system of record) + LanceDB (index)

No distributed transaction spans both stores. Ordering + a startup sweeper give exactly-once indexing semantics.

**Invariants**
- I1: A SQLite row is committed *before* its vector is written. A vector never exists without a committed row.
- I2: `recall()` only serves rows with `index_status='indexed'` (joins vector hits to SQLite, drops others). `get()` reads SQLite directly — authoritative regardless of `index_status`.
- I3: Only the memory-service process writes `memory.sqlite` (WAL mode, `BEGIN IMMEDIATE`).

**Write path (every mutation: remember/propose-auto/promote/supersede/contest-flag/recordUsage-strength)**
1. `BEGIN IMMEDIATE` → INSERT/UPDATE row, set `index_status='pending'` (new/changed row) or `'archive_pending'` (row being superseded/retired/merged-away) → `COMMIT`. Durable in SQLite now.
2. Outside the txn: upsert vector into LanceDB keyed by record id (idempotent), or delete vector for archive transitions.
3. `BEGIN IMMEDIATE` → set `index_status='indexed'` (or `'archived'`) → `COMMIT`.

**Startup sweeper** (runs before the MCP server accepts traffic):
```
SELECT id, index_status FROM memories WHERE index_status IN ('pending','archive_pending');
for each: pending         → embed + upsert vector → mark 'indexed'
          archive_pending → delete vector        → mark 'archived'
```
Idempotent: re-running is safe (LanceDB upsert/delete by id). `admin_checkpoint()` additionally asserts `sqlite_rows == index_vectors + pending_index`; mismatch is logged and the rows re-queued as `pending`.

**Crash windows**
- Crash between 1→2: row is `pending` in SQLite, no vector → sweeper re-indexes. No loss.
- Crash between 2→3: vector present, row still `pending` → sweeper upserts again (idempotent). No dupes.
- By I1 the reverse (vector without row) is impossible, so the index is always rebuildable from SQLite.
- Recovery from snapshot: restore SQLite via `admin_checkpoint()` artifact → mark all rows `pending` → sweeper full re-index.

## 5. Process topology

```
┌─────────────────┐  spawns / task I/O   ┌──────────────────────────┐
│ Cursor sessions │◄─────────────────────►│ graph-daemon (Node, B)   │
│ (node executors │  daemon API only;     │ owns graph.sqlite (WAL): │
│  e.g. node:     │  daemon injects       │ blackboard / outbox /    │
│  coder-3)       │  caller_node_id       │ registry / tasks         │
└─────────────────┘                       └────────────┬─────────────┘
                                                      │ MCP client (SSE)
                                                      │ + event-stream subscriber
                                                      ▼
                                         ┌──────────────────────────┐
                                         │ memory-service (Node, A) │
                                         │ owns memory.sqlite (WAL, │
                                         │ single writer) + LanceDB │
                                         │ (embedded, same process) │
                                         │ review queue + usage log │
                                         └────────────┬─────────────┘
                                                      ▲ ▲
                                     CLI review ──────┘ │ (human:ashish)
                                     admin.checkpoint ──┘   stdio transport
```

- **Processes (2):** `memory-service` (Track A: SQLite + LanceDB, MCP server, review queue) and `graph-daemon` (Track B: board/outbox/registry, curator module as `svc:curator`). No other process touches either SQLite file.
- **Communication:** MCP over **SSE/HTTP** daemon→service (request/response tools + `MemoryEvent` subscription stream). **stdio** for local CLI/dev against the service. Cursor sessions never call the memory service directly — all memory calls go through the daemon, which stamps `caller_node_id`.
- **Single-writer discipline:** `memory.sqlite` ← memory-service only; `graph.sqlite` ← graph-daemon only. Cross-store reads are via MCP, never file access.
- **Event flow:** service emits `MemoryEvent`s on SSE → daemon relays outcomes to blackboard/outbox → nodes observe. Curator decisions (`promote`/`review_decide`) flow daemon→service as `svc:curator`.

## 6. Joint milestone map

- **P0 — parallel spikes** (no cross-dependency):
  - A0: SQLite schema + MCP skeleton + `recall()` envelope stub (cold-start path demonstrable).
  - B0: daemon skeleton + blackboard/outbox/registry + one Cursor-session node stub running a task.
  - Exit: both spikes demo against the v3 signatures (mocks allowed behind the signature).
- **FREEZE GATE — serial.** Ashish signs this v3 IDL → it becomes the build contract. Any later signature change requires a v4 + both-track sign-off.
- **P1 — parallel prototypes** (both code against frozen v3):
  - A1: full tool surface, dual-write + sweeper (§4), auto-approve rules, CLI review queue, `admin.checkpoint`, contract conformance suite.
  - B1: daemon↔service MCP wiring, curator client (propose/promote/contest/recordUsage), trust-tier registry, node executor protocol.
  - **P1 exit gates (serial checks):** (i) conformance suite green on both tracks; (ii) dual-write crash test — `kill -9` mid-write → sweeper recovers with zero loss; (iii) **Moose-interface decision recorded — BLOCKS graph P2.**
- **P2 — integrations (serial on P1 exit):** multi-node graph runs against live memory; ExpeL voting loop + auto-contest live; trust-tier graduation live; human review queue in daily ops.
- **P3 — joint consolidation:** `reflective` type activation, episodic→semantic distillation job, retention/TTL policies, docs + hardening.

## 7. Residual open questions for Ashish

1. **Moose interface** — is Moose a Track B graph node, a direct MCP client of the memory service, or does it get its own scope/namespace? (Blocks graph P2.)
2. **Curator authority** — confirm `svc:curator` may promote/reject non-procedural, non-pinned proposals without a human; procedural/pinned strictly `human:ashish`?
3. **Verified-contribution bar** — is `outcome=success + evidence_refs` the right bar, or should daemon-attested task success alone count? (Sets trust-tier velocity.)
4. **Embedding model + dedup threshold** — pick the embedding model now (default `dedup_sim_threshold=0.92`); changing the model later forces a full re-index.
5. **Retention defaults** — episodic TTL and working-memory eviction policy before the P1 build? (Drives `valid_to` defaults in schema.)
6. **Contested records in recall** — is include-with-flag (default true) acceptable, or should contested rows be excluded by default?
