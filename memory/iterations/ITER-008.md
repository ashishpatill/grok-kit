# Iteration 008 — X1+X2: daemon service + presence + bidirectional sync

**Task:** The real X1+X2 per Ashish (2026-09-29): one combined system, not two
separate tasks. One account = one always-on memory store (Neon); N daemons can
be added/removed, each with its own local replica. The daemon runs as a managed
service, wakes on bot ping (webhook) and on its own schedule, heartbeats
presence, and syncs bidirectionally (pull store→replica, push replica→store)
with offline catch-up.
**When:** 2026-09-29 IST · tip base `73b0e64` (main, PR #18).

## Goal
A daemon host can be set up from this repo alone: service files, presence
heartbeats, and replica sync that converges after offline periods — with one
store serving many daemons.

## Plan
1. Migration `005-daemon-presence.sql`: `daemon_presence` (one row per daemon
   node, on the always-on store) + `sync_state` (per-daemon cursors, kept in the
   daemon's LOCAL replica) + echo-guard on the v1 sync trigger (additive
   `CREATE OR REPLACE`; v1.sql untouched).
2. `memory/daemon/presence.mjs`: `beat()` + `checkPresence()` (staleness ⇒ offline).
3. `memory/daemon/sync.mjs`: `pull()`/`push()` over `sync_log.seq` cursors;
   newer `updated_at` wins; applies run in a transaction with
   `SET LOCAL sync.is_replica_apply=1` so synced rows never re-enter sync_log.
4. `memory/daemon/index.mjs`: wake cycle = heartbeat → pull → push → drain jobs;
   `REMOTE_DATABASE_URL` enables replica mode, unset = single-DB back-compat.
5. Service files: `systemd/` (service + wake service + 15-min timer + wake.sh)
   and `launchd/` (daemon plist + 15-min wake plist) — host still undecided, so both.
6. `memory/daemon/test-sync.mjs`: two-DB smoke (offline catch-up both ways,
   presence online/stale/unknown, conflict newer-wins, echo-guard, idle zero-scan).

## Exit condition
- [x] test-sync ALL GREEN (13/13) on fresh local PG16 + pgvector 0.8.1
- [x] daemon boots with REMOTE_DATABASE_URL; /wake runs syncPhase (heartbeat +
      pull/push) before draining — verified live: store row pulled to replica
- [x] PR opened, unmerged

## Evidence
`STORE_URL=.../sync_remote REPLICA_URL=.../sync_local node memory/daemon/test-sync.mjs`
→ ALL GREEN: offline catch-up pull (3/3, no echo), push (2/2, no echo),
presence online/stale/unknown, conflict newer-wins both directions, idle
zero-scan. Daemon integration: `POST /wake` → `sync.enabled=true`,
`beat=ok`, live store write pulled to replica on wake (1/1).

## Out of scope
Choosing the daemon host (needs Ashish) · Tailscale serve wiring on the host ·
bot-side routing (local daemon vs Neon direct) · daemon-to-daemon push (star
topology through the store for now) · merging (Ashish's call).
