# P1.X7 RESULTS — No-gatekeeping spike

**When:** 2026-09-29 IST  
**Plan:** FINAL-PLAN-V2 §10 + Q6  
**Neon target:** bimlabz-bot-memory **`main`** only (`br-wandering-queen-b8sx7y0a`). No side branches.

## Verdict: PASS (stub + Neon main)

```
npm run evidence-weigh:smoke
MEMORY_BACKEND=stub npm run x7:spike
# → spikes/X7/out/x7-no-gatekeeping-stub.json

NODE_OPTIONS=--no-network-family-autoselection \
MEMORY_BACKEND=pg DATABASE_URL=… npm run x7:spike
# → spikes/X7/out/x7-no-gatekeeping-pg.json
# concurrent feature-auth-* writes; stronger grounding wins; loser superseded
```

## What was implemented

| Path | Role |
|------|------|
| `memory/lib/evidence-weigh.mjs` | score/weigh; bot identity never a factor |
| `memory/lib/resolve-conflict.mjs` | supersede losers; review_items resolution |
| `memory/spikes/X7/no-gatekeeping.mjs` | two-bot concurrent `feature-*` conflict |

## Proof points

1. Concurrent writes from two bots into one `feature-auth-*` namespace.
2. Evidence-weigh picks stronger grounding — not identity/tier (swap stable).
3. Loser superseded (invalidate-don't-delete); resolution provenance logged.
