# ITER-017 — P2.R1 replica profiles + sync_log pull

**When:** 2026-09-30 IST · base `b9f9916` (main).  
**Neon:** `bimlabz-bot-memory` **`main`** (`br-wandering-queen-b8sx7y0a`) — read-only pull.

## Goal

Ship plan §6 per-device replica profiles (`hot` / `standard`) and verify
`sync_log` delta pull into a local SQLite+FTS5 read cache. Mac dry-run OK;
no physical phone.

## Done

| Item | Change |
|------|--------|
| Profiles | `replica/profiles.mjs` — hot / standard / full (full = P1.M8, not re-claimed) |
| Substrate | `replica/sqlite-store.mjs` — `node:sqlite` + FTS5 (ICM-shaped; ICM binary out-of-tree) |
| Pull | `replica/pull.mjs` + `source.mjs` — `WHERE seq > last_token`, profile filter, watermark |
| CLI | `replica/cli.mjs` — fixture or `--live` pull into local `.db` |
| Smoke | `npm run replica:smoke` (+ optional `--live`) |
| Ops | `ops/replica-and-backup.md` P2.R1 section |
| Evidence | `replica/evidence/p2-r1-smoke.json` (counts only; no secrets) |

## Evidence

```bash
cd memory
npm run replica:smoke
NODE_OPTIONS=--no-network-family-autoselection npm run replica:smoke -- --live
```

Fixture: hot applied=5 skipped=4 watermark=10; standard expands; dry-run writes nothing; FTS5 hits.
Live Neon: first 800 `sync_log` deltas → hot local cache; watermark advanced; no `DATABASE_URL` in evidence.

## Not claimed

- Physical phone Tailscale pull (same code path; device not required for this slice)
- `full` replica host install (P1.M8 / X1–X2 host)
- A0.4 embedding A/B · G.2 WikiSkill/GEPA · P1.X6 / P2.C1 Moose real onboarding
