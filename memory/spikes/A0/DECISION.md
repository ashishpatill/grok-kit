# A0.6 — Stay / Kill decision

**Decision: STAY**

**Gate (plan §14):** stay if hybrid recall@10 ≥ 0.7 AND p95 < 500 ms; kill if recall@10 < 0.6 on both legs.

| Metric | Result | Gate |
|--------|-------:|------|
| Hybrid RRF recall@10 | **0.94** | ≥ 0.7 ✅ |
| Hybrid p95 latency | **5.13 ms** | < 500 ms ✅ |
| Keyword recall@10 | 0.72 | — |
| Vector recall@10 | 0.72 | — |

**When:** 2026-09-28 (IST). See `RESULTS.md` for full table, corpus notes, and caveats.

**Caveats (honest):**
- Corpus was **5 001 synthetic** MiniLM-384 rows on Neon branch `p0-spike` (legacy spike schema). 500 real bot-memory rows **not** imported (no `BIMLabz/bot-memory` access).
- Embedding A/B vs nomic-768 **not run** (deferred; MiniLM-only path).
- STAY is for architecture (halfvec HNSW + tsvector + RRF-SQL works; latency fine). Confirm on real corpus / v1.sql re-seed before treating as production-final.

**Next:** land B0/C0 adapted to `v1.sql`; re-seed A0 corpus against v1 as follow-up.
