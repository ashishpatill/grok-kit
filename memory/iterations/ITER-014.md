# Iteration 014 — Poison red-team smoke (P3.P1) + light reflective stub (P3.R1)

**When:** 2026-09-30 IST · base `2a925e4` (main).  
**Neon:** `bimlabz-bot-memory` **`main` only** (`br-wandering-queen-b8sx7y0a`).

## Goal

Ship deferred **P3.P1**: deliberately inject plausible-but-poison / adversarial
candidate memories and prove they land in the human queue or consolidate
NOOP/DELETE — never silent auto-promote into pinned/identity. Optional light
reflective stub only if poison ships clean.

## Done

| Item | Change |
|------|--------|
| P3.P1 | `lib/propose-route.mjs` + MCP wire; `spikes/P3P1/poison-redteam.mjs` |
| Harden | `preferences` namespace → `identity-ns-human-always` (even unpinned + fake grounding) |
| P3.R1 | `lib/reflective-stub.mjs` light extract; must human-gate |
| Smoke | `npm run propose-route:smoke`, `npm run poison:smoke` (+ optional `--live`) |

## Evidence

```bash
cd memory
npm run propose-route:smoke
npm run poison:smoke
# live Neon main (disposable ns + cleanup):
# NODE_OPTIONS=--no-network-family-autoselection npm run poison:smoke -- --live
```

## Not claimed

X1 Tailscale serve · X6 Moose real · A0.4 embedding A/B · G.2 · full ExpeL deepen · Tailscale on consolidate.
