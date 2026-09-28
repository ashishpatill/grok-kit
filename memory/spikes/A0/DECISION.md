# A0.6 — Stay / Kill decision

**Decision: STAY**

**Gate (plan §14):** stay if hybrid recall@10 ≥ 0.7 AND p95 < 500 ms; kill if recall@10 < 0.6 on both legs.

| Metric | Synthetic (prior) | Real corpus confirm | Gate |
|--------|------------------:|--------------------:|------|
| Hybrid RRF recall@10 | **0.94** | **1.00** (50 gold windows) | ≥ 0.7 ✅ |
| Hybrid p95 latency | **5.13 ms** | **11.48 ms** | < 500 ms ✅ |
| Keyword recall@10 | 0.72 | 0.84 | — |
| Vector recall@10 | 0.72 | 0.82 | — |

**When:** 2026-09-28 (IST). See `RESULTS.md` for full tables.

**Corpus notes:**
- Synthetic: 5 001 MiniLM-384 rows on Neon `p0-spike` (legacy spike schema).
- Real: Ashish export `real-corpus.jsonl` — **204** unique atomic memories (not 500; repo yield). Seeded into the same Neon branch (`author=import:real-corpus`); total rows 5 206. Artifacts: `spikes/A0/out/a0-real-bench.json`.
- Real queries are distinctive windows taken from gold row text (not hand paraphrases) — easier than adversarial paraphrases; still confirms hybrid beats each leg alone on real BIMLabz learnings.

**Still open / deferred:**
- Embedding A/B vs nomic-768 not run (A0.4).
- Re-seed + re-bench against authoritative `schema/v1.sql` (script: `spikes/A0/scripts/seed_real_v1.mjs`) when a v1 Neon branch exists.
- Tailscale wake remains P1.

**Next:** freeze gate (Ashish signs IDL v2.1) then P1.
