# Local replica profiles (P2.R1)

Read-cache on devices. **Neon/daemon = single writer.** Devices pull deltas from
`sync_log` (`WHERE seq > last_token`) and never write to the replica as a second
source of truth.

## Profiles (plan §6)

| Profile | What syncs | Vectors |
|---------|------------|---------|
| `hot` | pinned + last-30d episodic + active `project-*` | no |
| `standard` | hot + full semantic/procedural text | no |
| `full` | everything incl. vectors | yes — **P1.M8**, not re-claimed here |

Substrate: minimal SQLite via `node:sqlite` (ICM-shaped; ICM binary stays
out-of-tree as the Phase-3 long-tail tool). Prefer FTS5 when the host Node build
has `ENABLE_FTS5`; otherwise fall back to portable LIKE text search so smoke is
not Mac-only (some Cursor cloud Node 22 builds ship `ENABLE_FTS5=0`).

## Commands

```bash
cd memory
npm run replica:smoke          # fixture stub (Mac dry-run; no phone)
npm run replica:smoke -- --live  # optional Neon pull (needs DATABASE_URL)

# Pull into a local DB file
node replica/cli.mjs --profile hot --db /tmp/replica-hot.db --fixture replica/fixtures/sync-feed.json
NODE_OPTIONS=--no-network-family-autoselection \
  node replica/cli.mjs --profile hot --db /tmp/replica-hot.db --live --limit 800
```

Evidence (no secrets): `replica/evidence/p2-r1-smoke.json`.

Local DB files / `replica/out/` are gitignored.

## Phone / Tailscale

Physical phone pull over Tailscale is the same `pullSync` path once a device
holds a Tailscale IP to Neon/daemon. This slice verifies the hot-set pull on
Mac (stub + optional live Neon). No physical phone required for P2.R1 exit.
