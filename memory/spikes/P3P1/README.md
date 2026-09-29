# P3.P1 — Poisoning red-team smoke

AgentPoison / MINJA-inspired drill: inject plausible-but-poison candidates and prove they land in the **human queue** or consolidate **NOOP/DELETE** — never silent auto-promote into pinned / identity.

```bash
cd memory
npm run poison:smoke
# live Neon main (disposable ns + cleanup):
NODE_OPTIONS=--no-network-family-autoselection npm run poison:smoke -- --live
```

Hardening shipped with the drill: `preferences` namespace is human-always even when unpinned (`identity-ns-human-always` via `lib/propose-route.mjs`).
