# P1.X7 RESULTS — No-gatekeeping spike

**When:** 2026-09-29 IST  
**Plan:** FINAL-PLAN-V2 §10 + Q6  
**Evidence backend:** **stub** (default). Live Neon paused until CEO promotes p1-v1 → **main**.

## Verdict: PASS (stub)

```
npm run evidence-weigh:smoke   # ALL GREEN
MEMORY_BACKEND=stub npm run x7:spike
# ALL GREEN — evidence → spikes/X7/out/x7-no-gatekeeping-stub.json
```

## What was implemented

| Path | Role |
|------|------|
| `memory/lib/evidence-weigh.mjs` | score + weigh; bot identity never a factor |
| `memory/lib/resolve-conflict.mjs` | supersede losers; review_items resolution |
| `memory/spikes/X7/no-gatekeeping.mjs` | two bots concurrent `feature-*` writes → evidence-weighing |

## Proof points

1. Concurrent writes from two bots into one `feature-auth-*` namespace.
2. Conflicting claims → weigh → stronger grounding wins (not identity/tier).
3. Identity-swap unit stable.
4. Loser superseded (invalidate-don't-delete); resolution provenance logged.

## Neon note

Do not write X7 live data to side branches. Optional `MEMORY_BACKEND=pg` only against **main** after promotion.
