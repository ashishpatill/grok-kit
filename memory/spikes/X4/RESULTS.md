# P1.X4 RESULTS — kill -9 mid-write → sweeper zero-loss

**When:** 2026-09-29 IST  
**Plan:** FINAL-PLAN-V2 §13  
**Evidence backend:** **stub** (default). Live Neon writes paused until CEO promotes `p1-v1` → bimlabz-bot-memory **`main`**. Side branches (`p1-x4-*`, `p1-x5-*`, etc.) are **not** the permanent store — do not leave production data only there.

## Verdict: PASS (stub)

```
MEMORY_BACKEND=stub npm run x4:kill9
# ALL GREEN — P1.X4 kill -9 sweeper zero-loss
# evidence → spikes/X4/out/x4-kill9-sweeper-stub.json
```

Also covered by `npm run workers:smoke` (reconcile/adminCheckpoint/backfill helpers).

## What was implemented

| Path | Role |
|------|------|
| `memory/workers/reconcile.mjs` | `runReconcileSweep`, `backfillEmbeddings`, `countPendingEmbeddings`, `adminCheckpoint` |
| `memory/daemon/index.mjs` | wake uses `runReconcileSweep` |
| `memory/spikes/X4/kill9-sweeper.mjs` | commit staged → child `SIGKILL` → zero-loss assert → sweeper backfill → checkpoint |

## Protocol (proven on stub)

1. Commit N staged rows (`embedding NULL`) + sync_log.
2. Spawn child mid-backfill; parent `kill -9`.
3. All committed ids still present (zero loss).
4. Sweeper discovers `embedding IS NULL`; backfill → `indexed`.
5. `adminCheckpoint({ ids })` clean.

## Neon / branch policy (2026-09-29 steering)

- Permanent live data target: **`main` only** (after CEO promotion).
- Do **not** treat `p1-v1` / `p1-x4-*` / `p1-x5-*` as permanent.
- If disposable branch `p1-x4-x7-20260929` was created earlier, leave it alone — no further writes; finish stub evidence only.
- Re-run `MEMORY_BACKEND=pg` against **main** only when promotion lands.
