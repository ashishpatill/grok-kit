# Iteration 012 — P3.C1 Mem0 consolidation slice

**When:** 2026-09-30 IST · base `0f8c9a2` (main).  
**Neon:** `bimlabz-bot-memory` **`main` only** (`br-wandering-queen-b8sx7y0a`).

## Goal

Next unblocked P3 consolidation slice per FINAL-PLAN-V2 §7 / §14:
Mem0-style ADD / UPDATE / DELETE / NOOP for candidate facts, bi-temporal
`valid_from`/`valid_to`, nightly Mac launchd path (document; no Tailscale).

## Done

| Item | Change |
|------|--------|
| Classify | `workers/classify.mjs` — pure ADD/UPDATE/DELETE/NOOP + `applyOp` |
| Dedup | `workers/dedup.mjs` — bi-temporal neighbors; `apply` flag applies UPDATE/DELETE |
| Consolidate | `workers/consolidate.mjs` + `run-consolidate.mjs` CLI |
| Dispatch | `consolidate` / `consolidate_memories` kinds |
| Launchd | `ai.botmemory.consolidate.plist` @ 02:00 local + `consolidate.sh` + INSTALL §5 |
| Smoke | `npm run consolidate:smoke` stub + `--live` |
| TASKS | P3.C1 checked with evidence |

## Evidence

```bash
cd memory && npm run consolidate:smoke
# ALL GREEN — P3.C1 consolidate smoke

NODE_OPTIONS=--no-network-family-autoselection npm run consolidate:smoke -- --live
# ALL GREEN — live DELETE on expired valid_to; cleanup ok
```

## Not claimed

X1 Tailscale serve · X6 Moose real · A0.4 embedding A/B · S1 Ashish live gate ·
ExpeL extraction · reflective-type activation · Voyager skill promotion ·
poisoning red-team · Tailscale on consolidate path.
