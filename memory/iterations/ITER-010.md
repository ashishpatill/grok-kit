# Iteration 010 — P2.K4 refine-harness cites memory IDs

**When:** 2026-09-30 IST · base `e0a80fc` (main).  
**Neon:** `bimlabz-bot-memory` **`main` only** (`br-wandering-queen-b8sx7y0a`). Read-only recall for smoke — no propose/store writes this pass.

## Done

| Item | Change |
|------|--------|
| P2.K4 | `refine-harness` patches require `memory_ids` (≥1 recalled TEXT id) |
| Scripts | `cite-patches.mjs` + unit test + `cite-smoke.mjs` (offline + live recall) |
| TASKS | K4 checked; P3.B1–B4 thin inter-bot bus bullets drafted (docs only) |

## Evidence

```bash
node --test skills/refine-harness/scripts/cite-patches.test.mjs
# 11/11 pass

NODE_OPTIONS=--no-network-family-autoselection \
DATABASE_URL=… node skills/refine-harness/scripts/cite-smoke.mjs
# ALL GREEN — cited ns=project-grok-kit (read-only recall)
```

## Not claimed

X1 / X6 / A0.4 / S1 (Ashish live gate still open) · no full A2A bus · PR #21 presence/sync still open.
