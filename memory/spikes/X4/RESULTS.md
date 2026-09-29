# P1.X4 RESULTS — kill -9 mid-write → sweeper zero-loss

**When:** 2026-09-29 IST  
**Plan:** FINAL-PLAN-V2 §13  
**Neon target:** bimlabz-bot-memory branch **`main`** only (`br-wandering-queen-b8sx7y0a`, default+primary). Do **not** create side branches. Ignore empty root archive `main-empty-20260929`.

## Verdict: PASS (stub + Neon main)

```
MEMORY_BACKEND=stub npm run x4:kill9
# → spikes/X4/out/x4-kill9-sweeper-stub.json

NODE_OPTIONS=--no-network-family-autoselection \
MEMORY_BACKEND=pg DATABASE_URL=… npm run x4:kill9
# → spikes/X4/out/x4-kill9-sweeper-pg.json
# Neon main: 6/6 survive SIGKILL; sweeper backfill; checkpoint clean
```

Also: `npm run workers:smoke` (reconcile/adminCheckpoint helpers).

## What was implemented

| Path | Role |
|------|------|
| `memory/workers/reconcile.mjs` | `runReconcileSweep`, `backfillEmbeddings`, `countPendingEmbeddings`, `adminCheckpoint` |
| `memory/daemon/index.mjs` | wake uses `runReconcileSweep` |
| `memory/spikes/X4/kill9-sweeper.mjs` | staged commit → child `SIGKILL` → zero-loss → sweeper |

## Protocol

1. Commit N staged rows (`embedding NULL`) + sync_log trigger.
2. Spawn child mid-backfill; parent `kill -9`.
3. All committed ids still present.
4. Sweeper discovers `embedding IS NULL`; backfill → `indexed`.
5. `adminCheckpoint({ ids })` clean.

## Neon note (Mac node pg)

Node Happy-Eyeballs/IPv6 can ETIMEDOUT to Neon; spikes set `ipv4first` + `setDefaultAutoSelectFamily(false)`. Prefer `NODE_OPTIONS=--no-network-family-autoselection` if needed. `psql` works without that flag.
