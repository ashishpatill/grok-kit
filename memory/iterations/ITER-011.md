# Iteration 011 — P3.B1–B4 thin inter-bot bus scaffold

**When:** 2026-09-30 IST · base `dac817e` (main).  
**Neon:** `bimlabz-bot-memory` **`main` only** (`br-wandering-queen-b8sx7y0a`).

## Goal

A2A **vocabulary** scaffold (not full wire protocol): presence / message / task / wake.
MCP stays for memory/tools; bus is horizontal bot↔bot only.

## Done

| Item | Change |
|------|--------|
| P3.B1 | `daemon/presence.mjs` (reuse #21 shape) + `daemon_presence` on Neon main |
| P3.B2 | `bus/messages.mjs` — fail-closed `message.send` |
| P3.B3 | `bus/tasks.mjs` — lifecycle + outbox mirror |
| P3.B4 | `bus/wake.mjs` — `POST /wake` + `WAKE_TOKEN` nudge |
| Schema | `schema/migrations/005-inter-bot-bus.sql` applied to Neon main |
| Smoke | `npm run bus:smoke` stub + `--live` ALL GREEN |

## Evidence

```bash
cd memory && npm run bus:smoke
# ALL GREEN (stub)

NODE_OPTIONS=--no-network-family-autoselection npm run bus:smoke -- --live
# ALL GREEN — live B1/B2/B3 on Neon main; cleanup ok
```

Neon tables after 005: `daemon_presence`, `bus_messages`, `bus_tasks` (branch_id=`br-wandering-queen-b8sx7y0a`).

## Overlap with PR #21

Presence table + `presence.mjs` aligned with #21. **Not** included: `sync_state`, replica echo-guard, `sync.mjs` (X1/X2 sync stays on #21). #21 can rebase onto `daemon_presence` IF NOT EXISTS.

## Not claimed

X1 / X6 / A0.4 / S1 · full A2A wire · multi-vendor agent stack · Tailscale serve.
