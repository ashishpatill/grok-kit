# PR #10 review log — 2026-09-28 (CEO)

## Verdict
**Approve with fixes landed in follow-up commits.** P0 spikes are coherent; freeze gate cleared by Ashish ("Freeze IDL and P1").

## Analysis
| Area | Notes |
|------|-------|
| Schema v1 | Matches plan §12; TEXT ids, halfvec(384), index_status+approval, provenance JSONB, sync_log triggers. |
| A0 | Synthetic STAY 0.94 / 5 ms; real confirm 1.00 / 11.5 ms (window queries — honest caveat). |
| B0 | Localhost wake PASS; Tailscale deferred to P1 (correct). |
| C0 | v1-adapted MCP; round-trip artifact on legacy schema — re-run on v1 branch in P1. |
| Docs | Stale v3 IDL removed; FINAL-PLAN v2.1 binding. |

## Issues found → fixed
1. `seed_real_and_bench.mjs` corpus path broken relative to script dir → fixed.
2. MCP `store` accepted invalid type/scope (DB CHECK only) → validate in tool; accept `grounding_ids`.
3. No `package-lock.json` → add from verified install.
4. Freeze / P1 not recorded in TASKS after Ashish go → recorded + P1 checklist scaffolded.

## Residual (P1, not blocking merge of P0)
- Apply v1.sql on Neon branch `p1-v1` (or main when ready); re-seed 204 + synthetic.
- Hybrid recall in MCP (today keyword-only).
- Tailscale serve + systemd on daemon host.
- G.2 WikiSkill/GEPA reconcile **RETIRED 2026-09-30** — PLAN-dh sources never landed; FINAL-PLAN-V2 authoritative (`memory/plan/G2-PLAN-dh-link.md`).
