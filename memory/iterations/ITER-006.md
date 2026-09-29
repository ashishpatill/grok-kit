# Iteration 006 — P1.X4 sweeper zero-loss + P1.X7 no-gatekeeping (+ light G.2)

**Tasks:** X4 kill -9 → sweeper; X7 evidence-weighing spike; optional G.2 link note.  
**When:** 2026-09-29 IST · tip base `a562fcf` (X3 / PR #16).  
**Neon policy (steering):** permanent live data on bimlabz-bot-memory **`main` only** after CEO promotes p1-v1 → main. **No writes** to `p1-v1` / `p1-x4-*` / `p1-x5-*` as permanent store this session. Disposable branch `p1-x4-x7-20260929` (`br-plain-mode-b8x08nzs`) was created briefly then **left alone** (no further writes). Evidence completed on **stub**.

---

## P1.X4 — exit evidence (stub)

| Path | Role |
|------|------|
| `memory/workers/reconcile.mjs` | `runReconcileSweep`, `backfillEmbeddings`, `countPendingEmbeddings`, `adminCheckpoint` |
| `memory/daemon/index.mjs` | wake → `runReconcileSweep` |
| `memory/spikes/X4/kill9-sweeper.mjs` | staged commit → child `SIGKILL` → zero-loss → sweeper |
| `memory/spikes/X4/out/x4-kill9-sweeper-stub.json` | measured evidence |
| `memory/spikes/X4/RESULTS.md` | protocol + Neon pause note |

```
MEMORY_BACKEND=stub npm run x4:kill9
# ALL GREEN — 8/8 survive SIGKILL; checkpoint pending=0
npm run workers:smoke   # includes X4 helper asserts
```

## P1.X7 — exit evidence (stub)

| Path | Role |
|------|------|
| `memory/lib/evidence-weigh.mjs` | score/weigh; identity never a factor |
| `memory/lib/resolve-conflict.mjs` | supersede + review_items resolution |
| `memory/spikes/X7/no-gatekeeping.mjs` | concurrent two-bot `feature-*` conflict |
| `memory/spikes/X7/out/x7-no-gatekeeping-stub.json` | measured evidence |

```
npm run evidence-weigh:smoke
MEMORY_BACKEND=stub npm run x7:spike
# ALL GREEN — winner=stronger grounding; identity swap stable
```

## G.2 — light only (unchecked)

`memory/plan/G2-PLAN-dh-link.md` — links FINAL-PLAN-V2 vs in-repo plans; states PLAN-dh-* absent. **G.2 left unchecked.**

---

## Skipped / blocked (honest)

| Item | Status |
|------|--------|
| X1 Tailscale serve | Blocked — no daemon host |
| X2 systemd unit | Blocked — same |
| X6 real Moose MCP | Open — stand-in only |
| A0.2 500 real | **Not claimed** — repo yielded ~207 |
| X4/X7 live Neon on main | Deferred — wait CEO p1-v1 → main; do not use side branches as permanent store |
| G.2 full reconcile | Blocked — PLAN-dh files not in-tree |

Conformance: `npm run conformance:quiet` → **8/8 ALL GREEN**.

---

## Follow-up — live Neon main (same day)

After CEO cleanup: live data is on branch named **`main`** (`br-wandering-queen-b8sx7y0a`, 5206 baseline). Re-ran:

- `MEMORY_BACKEND=pg npm run x4:kill9` → `spikes/X4/out/x4-kill9-sweeper-pg.json` (6/6 zero-loss)
- `MEMORY_BACKEND=pg npm run x7:spike` → `spikes/X7/out/x7-no-gatekeeping-pg.json`

Post-spike counts: memories **5214** (= 5206 + 6 X4 + 2 X7 spike rows in disposable `feature-*` namespaces). No side branches created. Empty archive `main-empty-20260929` ignored.
