# Full replica + backup rhythm (P1.M8)

Source of truth: `memory/plan/FINAL-PLAN-V2.md` §5 (backups), §6 (local replica), §7 (`backup` worker).

## Roles (do not confuse them)

| Mechanism | What it is | What it is **not** |
|-----------|------------|--------------------|
| **Neon free PITR** | ~**6 hours** of point-in-time undo on the project | A backup strategy. Use only for incident rollback (“oops, undo that write”). |
| **Neon backup branch** | Instant copy-on-write clone **before every schema migration** | A weekly archive. Create → migrate on branch → verify → apply to target. |
| **Weekly `pg_dump`** | Logical dump of Neon → **daemon host** (or Mac stand-in until X1/X2) | A live replica. Retention **4 weeks** (rotate older dumps). |
| **`full` replica** | Daemon-host read cache of everything incl. vectors (P1); fed later by `sync_log` | A second writer. Writes always go through MCP/daemon → Neon. |

## Full replica on the daemon host (P1 plan)

P1 keeps a **`full`** sync profile on the daemon host (plan §6):

- Everything including vectors (SQLite + embedded vector index is the P2 ICM candidate; P1 may start as dump+restore standby).
- Single writer remains the daemon; the replica is a **read cache** and the backup landing zone.
- Devices track `last_seq` from `sync_log`; `recall()` may report replica lag (see P1.M9 cold-start contract).

**Host install blocked until X1/X2:** Tailscale serve wake + systemd unit/timer need a real always-on daemon host. Until then:

- Document the rhythm here.
- Run weekly dump dry-runs from an Ashish-controlled machine (this Mac is fine for dry-run evidence).
- Do **not** mark X1–X7 done without host evidence.

## Weekly `pg_dump` rhythm

1. Prefer the **direct** (unpooled) Neon connection string for dumps and migrations.
2. Dump custom format (`-Fc`) of database `bot_memory` on branch **`p1-v1`** (project `cold-lab-97058535`, branch id `br-wandering-queen-b8sx7y0a`) until production main is cut over.
3. Land files under `memory/ops/backups/` locally (gitignored) **or** `/tmp/memory-pgdump/` — never commit dumps or URLs with passwords.
4. Retention: keep **4** weekly dumps; delete older.
5. Name: `bot_memory-p1-v1-YYYYMMDD-HHMM.dump`.
6. After dump: record size + exit code in an ITER note (or ops log). Restore drill (X5) is a separate gate: `pg_restore` → fresh Neon branch → `admin_checkpoint` clean.

### Dry-run (documented commands)

```bash
# Never echo or commit DATABASE_URL. Export in the shell only.
export DATABASE_URL='postgresql://…'   # Neon MCP get_connection_string for p1-v1
# Optional: strip -pooler from host for a direct endpoint if dump complains.

cd memory
./ops/pg-dump-dry-run.sh
# or:
# OUT=ops/backups/bot_memory-p1-v1-$(date +%Y%m%d-%H%M).dump
# pg_dump "$DATABASE_URL" -Fc --no-owner --no-acl -f "$OUT"
# pg_restore -l "$OUT" | head   # TOC listing = restoreability smoke
```

Script exit evidence: non-zero exit on failure; on success prints dump path, byte size, and `pg_restore -l` row count.

**Client version:** Neon `p1-v1` is PostgreSQL **17**. Homebrew `pg_dump` 14 will refuse the dump — install `postgresql@17` / `libpq` ≥17, or set `PG_DUMP` to a 17.x binary (see ITER-003).

## Neon backup branch before migrations

Before applying any additive migration (e.g. `004-…sql`) to a live branch:

1. Create a Neon branch from the target (console or API) — copy-on-write snapshot.
2. Apply migration on the **backup/verify** branch first **or** keep the pre-migration branch as rollback handle.
3. Apply to `p1-v1` (or main later) on the **direct** connection only.
4. Verify `\dt` / row counts; only then discard or keep the backup branch per ops preference.

PITR (6h) is the last-resort incident undo if a bad write landed inside the window — not a substitute for the weekly dump or the pre-migration branch.

## Worker hook (later)

Plan §7 `backup` pg-boss job = weekly `pg_dump` → local replica host. Wire after X1/X2 host is available; until then this doc + `pg-dump-dry-run.sh` are the M8 deliverable.

## Checklist (M8 exit)

- [x] Ops doc: full replica + weekly dump + retention 4w + Neon backup branch + PITR caveat
- [x] Dry-run script / commands that dump Neon `p1-v1` to a local path
- [x] ITER note with exit evidence (size, TOC listing, exit 0)
- [ ] Host `full` replica install — **blocked** on daemon host (X1/X2)

## P1.X5 restore drill (2026-09-29)

- Created Neon branch `p1-x5-restore-20260929` (`br-restless-grass-b8xikkh4`) from **p1-v1** only (not `main`).
- CoW counts matched p1-v1; checkpoint `COUNT(*) WHERE embedding IS NULL` = 0.
- Destructive restore practiced **only** on that branch: `DROP SCHEMA public CASCADE` → `pg_restore` of M8 custom dump → memories=5206 / sync_log=5208 / staged_null_emb=0 / 0 `pg_restore` errors.
- Dump TOC lacked blackboard/outbox (pre-G1) → re-applied `004-blackboard-outbox.sql` after restore.
- Next weekly dump should be taken after G1 so restore brings graph tables without a follow-up migration.

## P2.R1 — per-device profiles (`hot` / `standard`)

Source: plan §6. Implementation: `memory/replica/`.

| Profile | Sync set | Substrate |
|---------|----------|-----------|
| `hot` | pinned + last-30d episodic + active `project-*` | SQLite + FTS5 (text) |
| `standard` | hot + semantic/procedural text | SQLite + FTS5 (text) |
| `full` | everything + vectors | **P1.M8** (not re-claimed) |

**Mechanism:** `pullSync` reads `sync_log WHERE seq > last_token`, filters by
profile, upserts into local SQLite. Watermark in `replica_meta.last_token`.
Single writer remains Neon/daemon — this module is a **read cache only**.

**Verify (Mac dry-run; no physical phone):**

```bash
cd memory
npm run replica:smoke
# optional live Neon:
# NODE_OPTIONS=--no-network-family-autoselection npm run replica:smoke -- --live
```

Evidence: `replica/evidence/p2-r1-smoke.json` (counts only — never commit `DATABASE_URL`).

Phone-over-Tailscale = same pull once a device can reach Neon/daemon on the mesh.
