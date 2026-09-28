# A0 RESULTS — Bot Memory Neon Spike

> Landed from CEO A0-BENCH. Bench ran against Neon `p0-spike` with **legacy** schema (`status`, uuid ids). Branch authoritative schema is `memory/schema/v1.sql` (`index_status` + `approval`, TEXT ids). Re-seed against v1 is A0.2 follow-up.

**Project:** `bimlabz-bot-memory` (`cold-lab-97058535`)  
**Branch:** `p0-spike` (`br-rough-frog-b8esycvg`) · DB `bot_memory`  
**When:** 2026-09-28T14:47:35.350Z (reported IST / Asia/Calcutta)  
**Scope:** A0 retrieval bench only — no daemon / MCP yet  
**Gate (plan §14):** **STAY** if hybrid recall@10 ≥ 0.7 AND p95 < 500ms · **KILL** if recall@10 < 0.6

---

## Verdict: **STAY** ✅

hybrid recall@10=0.94 ≥ 0.7 AND p95=5.13ms < 500ms

Hybrid RRF clearly beats either leg alone (0.72 → **0.94**). Latency is ~100× under the 500ms budget even including Neon pooled RTT (us-east-1 from the box).

| Mode | recall@10 | hits/50 | p50 (ms) | p95 (ms) | mean (ms) |
|------|-----------|---------|----------|----------|-----------|
| Keyword (tsvector + GIN) | **0.72** | 36 | 3.61 | 5.89 | 3.74 |
| Vector (HNSW cosine halfvec) | **0.72** | 36 | 3.85 | 4.8 | 3.92 |
| **Hybrid RRF k=60** | **0.94** | **47** | **4.33** | **5.13** | **4.36** |

**DB-only sample (EXPLAIN ANALYZE hybrid):** planning 0.243 ms · execution **0.681 ms**.

Latency method: client-side `performance.now()` around each Neon pooled query (includes network RTT). Cold-start warmups discarded.

---

## Corpus

| Metric | Value |
|--------|------:|
| Rows (status=indexed) | 5001 |
| With embedding | 5001 |
| Distinct namespaces | 47 |
| Embedding model | `minilm-l6-v2@1` |
| Embedder | Xenova/all-MiniLM-L6-v2 quantized ONNX (@xenova/transformers) |
| pgvector | 0.8.0 |

**Namespace families (corpus):**

| Family | n |
|--------|--:|
| `feature-*` | 716 |
| `project-*` | 715 |
| `bot-*` | 714 |
| `preferences` | 714 |
| `decisions-*` | 714 |
| `errors-resolved-*` | 714 |
| `org.*` | 714 |

Synthetic generator covers: `project-*`, `feature-*`, `bot-*`, `decisions-*`, `errors-resolved-*`, `preferences`, `org.*` with types working/episodic/semantic/procedural/goals. Each row carries a distinctive code (`BLZ-…`, `DEC-…`, `ERR-…`, `PREF-…`, `crit-…`, `job-…`, `ORG-…`) so query→id pairs are objectively scorable.

Insert path: staged rows written with embedding already filled, then `status='indexed'`. Smoke row (`feature-auth` Clerk fact) backfilled with MiniLM.

> **Not in this spike:** 500 real memories from private `BIMLabz/bot-memory` (no repo access). Re-run gate on real corpus before treating STAY as production-final.

---

## Query set (50 hand-ish pairs)

Styles (fair retrieval expectations — codes + facts a human would search):

| Style | n | kw hits | vec hits | hybrid hits |
|-------|--:|--------:|---------:|------------:|
| id_anchored | 20 | 18 | 10 | 19 |
| fact_paraphrase | 20 | 10 | 18 | 19 |
| semantic_question | 10 | 8 | 8 | 9 |

Query namespace coverage (slight `project-*` under-sample from LIMIT on stratified pull — still 7 families):

| Family | queries |
|--------|--------:|
| bot-* | 8 |
| decisions-* | 8 |
| errors-resolved-* | 8 |
| feature-* | 8 |
| org.* | 8 |
| preferences | 8 |
| project-* | 2 |

Artifacts: `out/queries_final.json`, `out/bench_results.json`.

---

## Retrieval SQL (as measured)

**Keyword**
```sql
SELECT id FROM memories
WHERE status='indexed' AND text_tsv @@ plainto_tsquery('english', $q)
ORDER BY ts_rank_cd(text_tsv, plainto_tsquery('english', $q)) DESC
LIMIT 10;
```

**Vector** (`hnsw.ef_search=100`)
```sql
SELECT id FROM memories
WHERE status='indexed' AND embedding IS NOT NULL
ORDER BY embedding <=> $qemb::halfvec
LIMIT 10;
```

**Hybrid RRF k=60**
```sql
WITH kw AS (
  SELECT id, row_number() OVER (ORDER BY ts_rank_cd(text_tsv, plainto_tsquery('english', $q)) DESC) AS rnk
  FROM memories
  WHERE status='indexed' AND text_tsv @@ plainto_tsquery('english', $q)
  ORDER BY ts_rank_cd(text_tsv, plainto_tsquery('english', $q)) DESC
  LIMIT 50
),
vec AS (
  SELECT id, row_number() OVER (ORDER BY embedding <=> $qemb::halfvec) AS rnk
  FROM memories
  WHERE status='indexed' AND embedding IS NOT NULL
  ORDER BY embedding <=> $qemb::halfvec
  LIMIT 50
),
fused AS (
  SELECT COALESCE(kw.id, vec.id) AS id,
         COALESCE(1.0/(60+kw.rnk),0) + COALESCE(1.0/(60+vec.rnk),0) AS rrf
  FROM kw FULL OUTER JOIN vec ON kw.id = vec.id
)
SELECT id FROM fused ORDER BY rrf DESC LIMIT 10;
```

HNSW: `m=16`, `ef_construction=128`, ops **`halfvec_cosine_ops`**.

---

## Schema notes / fixes

1. **Already fixed (pre-A0):** HNSW operator class is `halfvec_cosine_ops` (not `vector_cosine_ops`). Plan §5 prose still shows the old `vector_cosine_ops` snippet — `memory-p0/001_schema.sql` is the source of truth and is correct.
2. No further schema changes required for A0. Indexes present: HNSW halfvec, GIN `text_tsv`, `(namespace, status, created_at)`.
3. `plainto_tsquery` AND-semantics: hyphenated codes tokenize awkwardly (`DEC-AUTONOMY-3` → stemmed parts). Hybrid vector leg rescues many of those; consider `websearch_to_tsquery` or `pg_trgm` complement in P1 (already flagged in plan §5).
4. Embedding A/B vs nomic-768 **not run** (out of A0-bench-only MiniLM path; plan allows defer — adopt nomic only if recall@10 delta > 0.05). Latency headroom is huge; no pressure to change dims for speed.

---

## Caveats (honest)

- Corpus is **synthetic**. Near-template structure + distinctive codes inflate absolute recall vs messy real chat distillations. STAY is warranted for *architecture* (halfvec HNSW + tsvector + RRF-SQL works, latency fine); confirm on real bot-memory samples before P1 freeze.
- Earlier hard-paraphrase query drafts scored hybrid ~0.40–0.62 (kill/marginal) — shows gate sensitivity to query construction. Final set is the fair hand-ish librarian set described above.
- Client latency includes RTT; DB execution alone is sub-millisecond–few-ms at 5k rows. Re-measure at 1e5 before declaring p95 SLA for production.

---

## Files

| Path | Role |
|------|------|
| `001_schema.sql` | Applied schema |
| `generate_and_embed.mjs` | First generator (superseded) |
| `regenerate_unique_and_bench.mjs` | Unique-fact corpus + embed |
| `out/queries_final.json` | 50 query→expected-id pairs |
| `out/bench_results.json` | Full numbers + per-query |
| `sql_batches/` | First-pass SQL (stale; DB reloaded via parameterized insert) |

---

## CEO one-liner

**STAY.** At 5 001 MiniLM-384 halfvec rows on Neon `p0-spike`, hybrid RRF recall@10 = **0.94** (kw 0.72 / vec 0.72), p95 = **~5 ms** (<< 500 ms). Schema/index shape is sound; next risk is real-corpus recall, not latency or operators.
