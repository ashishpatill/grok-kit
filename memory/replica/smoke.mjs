#!/usr/bin/env node
/**
 * P2.R1 replica profiles + sync_log pull smoke.
 *
 * Default: fixture stub (no Neon, Mac dry-run OK; no physical phone).
 * Optional: --live pulls from Neon main into a temp SQLite hot replica.
 *
 *   node replica/smoke.mjs
 *   NODE_OPTIONS=--no-network-family-autoselection node replica/smoke.mjs --live
 *
 * Evidence JSON → replica/evidence/p2-r1-smoke.json (no secrets).
 */
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PROFILE_NAMES,
  assertProfile,
  matchesHot,
  matchesStandard,
  matchesProfile,
  storesVectors,
  describeProfile,
  openReplicaDb,
  closeReplicaDb,
  createStubSource,
  createPgSource,
  pullSync,
  ftsSearch,
  getLastToken,
  snapshotStats,
  getSearchBackend,
  probeFts5Available,
  probeFts5CompileOption,
} from './index.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(__dir, '..', 'package.json'));
const live = process.argv.includes('--live');
let failures = 0;
function assert(cond, label, extra = '') {
  if (cond) console.log(`  PASS ${label}`);
  else {
    failures += 1;
    console.log(`  FAIL ${label} ${extra}`);
  }
}

const NOW = new Date('2026-09-30T12:00:00.000Z');

console.log('P2.R1 replica profiles + sync_log pull smoke');

console.log('unit profiles:');
assert(PROFILE_NAMES.join(',') === 'hot,standard,full', 'profile names');
assert(describeProfile('hot').vectors === false, 'hot no vectors');
assert(describeProfile('standard').vectors === false, 'standard no vectors');
assert(storesVectors('full') === true, 'full stores vectors');
assert(describeProfile('full').note?.includes('P1.M8'), 'full not re-claimed');

let threw = false;
try {
  assertProfile('phone');
} catch {
  threw = true;
}
assert(threw, 'unknown profile throws');

const pin = {
  id: 'p',
  namespace: 'preferences',
  type: 'semantic',
  pinned: true,
  approval: 'live',
  created_at: '2026-01-01T00:00:00.000Z',
};
const epiRecent = {
  id: 'e1',
  namespace: 'handoff-x',
  type: 'episodic',
  pinned: false,
  approval: 'live',
  created_at: '2026-09-20T00:00:00.000Z',
};
const epiOld = {
  id: 'e0',
  namespace: 'handoff-old',
  type: 'episodic',
  pinned: false,
  approval: 'live',
  created_at: '2026-07-01T00:00:00.000Z',
};
const proj = {
  id: 'pr',
  namespace: 'project-grok-kit',
  type: 'semantic',
  pinned: false,
  approval: 'live',
  created_at: '2026-09-01T00:00:00.000Z',
  valid_to: null,
};
const sem = {
  id: 's',
  namespace: 'decisions-x',
  type: 'semantic',
  pinned: false,
  approval: 'live',
  created_at: '2026-08-01T00:00:00.000Z',
  valid_to: null,
};

assert(matchesHot(pin, { now: NOW }), 'hot: pinned');
assert(matchesHot(epiRecent, { now: NOW }), 'hot: recent episodic');
assert(!matchesHot(epiOld, { now: NOW }), 'hot: excludes old episodic');
assert(matchesHot(proj, { now: NOW }), 'hot: active project-*');
assert(!matchesHot(sem, { now: NOW }), 'hot: excludes lone semantic');
assert(matchesStandard(sem, { now: NOW }), 'standard: includes semantic');
assert(matchesProfile('full', epiOld, { now: NOW }), 'full: includes old episodic');

console.log('fixture pull (hot):');
const fixture = JSON.parse(readFileSync(join(__dir, 'fixtures/sync-feed.json'), 'utf8'));
const source = createStubSource(fixture);
const db = openReplicaDb(':memory:');
const hotResult = await pullSync({
  db,
  source,
  profile: 'hot',
  lastToken: 0,
  now: NOW,
});
assert(hotResult.ok, 'hot pull ok');
assert(hotResult.last_token_after === 10, `watermark 10 (got ${hotResult.last_token_after})`);
assert(hotResult.applied >= 3, `hot applied >=3 (got ${hotResult.applied})`);
assert(hotResult.skipped >= 1, `hot skipped non-hot (got ${hotResult.skipped})`);
assert(getLastToken(db) === 10, 'meta last_token=10');

const stats = snapshotStats(db);
assert(stats.pinned >= 1, `local pinned >=1 (got ${stats.pinned})`);
assert(stats.total >= 3, `local total >=3 (got ${stats.total})`);
// retired_pin applied then retired → should not remain
const retiredGone = !db.prepare('SELECT 1 FROM memories WHERE id = ?').get('retired_pin');
assert(retiredGone, 'retire removes from local cache');
// old episodic + lone semantic/procedural/goals should be absent from hot
assert(!db.prepare('SELECT 1 FROM memories WHERE id = ?').get('epi_old'), 'hot excludes epi_old');
assert(!db.prepare('SELECT 1 FROM memories WHERE id = ?').get('sem_fact'), 'hot excludes sem_fact');
assert(!db.prepare('SELECT 1 FROM memories WHERE id = ?').get('goals_x'), 'hot excludes goals');

const hits = ftsSearch(db, 'Asia OR Calcutta OR replica');
const backend = getSearchBackend(db);
assert(hits.length >= 1, `text search finds hot text via ${backend} (got ${hits.length})`);

console.log('portable LIKE fallback (force no FTS5):');
const dbLike = openReplicaDb(':memory:', { forceLikeSearch: true });
assert(getSearchBackend(dbLike) === 'like', 'forceLikeSearch → like backend');
const likePull = await pullSync({
  db: dbLike,
  source,
  profile: 'hot',
  lastToken: 0,
  now: NOW,
});
assert(likePull.ok, 'like-backend hot pull ok');
const likeHits = ftsSearch(dbLike, 'Asia OR Calcutta OR replica');
assert(likeHits.length >= 1, `LIKE search finds hot text (got ${likeHits.length})`);
closeReplicaDb(dbLike);

console.log('incremental pull (no new deltas):');
const again = await pullSync({ db, source, profile: 'hot', now: NOW });
assert(again.deltas_seen === 0, 'second pull idle');
assert(again.last_token_after === 10, 'watermark unchanged');

console.log('standard expands over hot:');
const dbStd = openReplicaDb(':memory:');
const stdResult = await pullSync({
  db: dbStd,
  source,
  profile: 'standard',
  lastToken: 0,
  now: NOW,
});
assert(stdResult.applied > hotResult.applied, 'standard applies more than hot');
assert(dbStd.prepare('SELECT 1 FROM memories WHERE id = ?').get('sem_fact'), 'standard has semantic');
assert(dbStd.prepare('SELECT 1 FROM memories WHERE id = ?').get('proc_how'), 'standard has procedural');
assert(!dbStd.prepare('SELECT 1 FROM memories WHERE id = ?').get('goals_x'), 'standard excludes goals');

console.log('dry-run hot (no write):');
const dbDry = openReplicaDb(':memory:');
const dry = await pullSync({
  db: dbDry,
  source,
  profile: 'hot',
  lastToken: 0,
  now: NOW,
  dryRun: true,
});
assert(dry.dry_run === true, 'dry_run flag');
assert(dry.applied >= 3, 'dry applied count');
assert(getLastToken(dbDry) === 0, 'dry-run does not advance watermark');
assert(snapshotStats(dbDry).total === 0, 'dry-run writes nothing');

closeReplicaDb(db);
closeReplicaDb(dbStd);
closeReplicaDb(dbDry);

/** @type {object} */
let liveEvidence = { ran: false };

if (live) {
  console.log('live Neon hot pull:');
  if (!process.env.DATABASE_URL) {
    try {
      const dotenv = await import('dotenv');
      dotenv.config({ path: join(__dir, '..', '.env.local') });
    } catch {
      /* optional */
    }
  }
  if (!process.env.DATABASE_URL) {
    assert(false, 'DATABASE_URL required for --live');
  } else {
    const pg = require('pg');
    const pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      max: 2,
      connectionTimeoutMillis: 20_000,
    });
    try {
      const pgSource = createPgSource(pool);
      const liveDb = openReplicaDb(':memory:');
      // Cap batch so smoke stays fast; hot filter still applies.
      const livePull = await pullSync({
        db: liveDb,
        source: pgSource,
        profile: 'hot',
        lastToken: 0,
        now: new Date(),
        limit: 800,
      });
      const liveStats = snapshotStats(liveDb);
      assert(livePull.ok, 'live pull ok');
      assert(livePull.source_kind === 'neon', 'source neon');
      assert(livePull.deltas_seen > 0, `live deltas >0 (got ${livePull.deltas_seen})`);
      assert(livePull.last_token_after > 0, 'live watermark advanced');
      assert(liveStats.total >= 1, `live local rows >=1 (got ${liveStats.total})`);
      // Hot set should prefer pinned / project / recent episodic — at least one class present
      const hotish = liveStats.pinned + liveStats.episodic + liveStats.project;
      assert(hotish >= 1, `live hot-ish classes >=1 (got ${hotish})`);
      liveEvidence = {
        ran: true,
        source_kind: livePull.source_kind,
        deltas_seen: livePull.deltas_seen,
        applied: livePull.applied,
        skipped: livePull.skipped,
        retired: livePull.retired,
        last_token_after: livePull.last_token_after,
        source_max_seq: livePull.source_max_seq,
        replica_lag: livePull.replica_lag,
        stats: liveStats,
        note: 'Mac dry-run + live Neon pull; no physical phone. Phone Tailscale path = same pull over mesh when device present.',
      };
      closeReplicaDb(liveDb);
    } finally {
      await pool.end();
    }
  }
}

const ftsProbe = probeFts5CompileOption();
const evidence = {
  task: 'P2.R1',
  when: new Date().toISOString(),
  host: process.env.GROK_REPLICA_SMOKE_HOST || (process.platform === 'darwin' ? 'mac-dry-run' : 'cloud-node'),
  phone: false,
  node: process.version,
  platform: process.platform,
  sqlite_fts5_compileoption: ftsProbe,
  search_backend_default: backend,
  search_backend_forced_like: 'like',
  profiles: PROFILE_NAMES.map((p) => describeProfile(p)),
  fixture: {
    hot_applied: hotResult.applied,
    hot_skipped: hotResult.skipped,
    hot_last_token: hotResult.last_token_after,
    standard_applied: stdResult.applied,
    dry_run_applied: dry.applied,
  },
  live: liveEvidence,
  secrets: false,
  note:
    'Mac Node often ENABLE_FTS5=1 so open+FTS schema succeeds; some Cursor cloud Node 22 builds have ENABLE_FTS5=0 (error: no such module: fts5). Store detects and falls back to LIKE text search; smoke forces LIKE path so green is not Mac-only.',
  status: failures === 0 ? 'GREEN' : 'RED',
};

mkdirSync(join(__dir, 'evidence'), { recursive: true });
const evidencePath = join(__dir, 'evidence/p2-r1-smoke.json');
writeFileSync(evidencePath, JSON.stringify(evidence, null, 2) + '\n');
console.log(`evidence → ${evidencePath}`);

console.log(failures === 0 ? '\nALL GREEN' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
