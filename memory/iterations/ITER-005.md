# Iteration 005 — P1.X3 conformance suite

**Tasks:** X3 thin conformance suite wrapping existing green stub smokes.

**When:** 2026-09-29 IST · tip base `5a029e9` (G2–G4 / X5 / PR #15).

---

## P1.X3 — exit evidence

| Path | Role |
|------|------|
| `memory/ops/conformance.mjs` | Thin runner: spawn each smoke, collect exit codes, print pass/fail summary |
| `memory/package.json` | `npm run conformance` (+ `conformance:quiet`) |

Suites (stub-only; no Neon / secrets):

| id | npm script | track |
|----|------------|-------|
| contract | `contract:smoke` | M9 |
| cli | `cli:smoke` | M5 |
| import | `import:smoke` | M6 |
| workers | `workers:smoke` | M7 |
| graph | `graph:smoke` | G1 |
| curator | `curator:smoke` | G2 |
| nodes | `nodes:smoke` | G3 |
| demo:stuck-debug | `demo:stuck-debug` | G4 |

```
npm run conformance
# ALL GREEN — 8/8 suites (~1.6s)
```

Flags: `--quiet` (less child stdout; still prints failure tails), `--only=<id>` (single suite).

---

## Skipped / blocked (honest — not claimed)

| Item | Status |
|------|--------|
| X1 Tailscale serve | Blocked — no always-on daemon host |
| X2 systemd unit | Blocked — same |
| X4 kill -9 sweeper | Open — not run this session |
| X6 real Moose MCP | Open — stand-in only (G3) |
| X7 no-gatekeeping spike | Open — not started |

Neon restore branch `p1-x5-restore-20260929` left in place (not deleted).
