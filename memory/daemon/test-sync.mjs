/**
 * X1+X2 sync smoke: one always-on store, one daemon replica.
 *
 * Scenario:
 *  1. 3 rows written to the STORE while the daemon is "offline".
 *  2. Daemon comes online -> pull() catches the replica up (no echo in sync_log).
 *  3. 2 rows written to the REPLICA (local bot writes).
 *  4. push() carries them to the store.
 *  5. Presence: beat() -> online; stale node -> offline.
 *  6. Conflict: same id updated on both sides -> newer updated_at wins.
 *  7. Second pull/push with no changes -> zero scans (cursor held).
 *
 * Usage:
 *   createdb sync_remote / sync_local, apply v1 + 002..005 to both, then
 *   STORE_URL=postgres://.../sync_remote REPLICA_URL=postgres://.../sync_local \
 *     node memory/daemon/test-sync.mjs
 */
import pg from 'pg';
import { beat, checkPresence } from './presence.mjs';
import { pull, push } from './sync.mjs';

const STORE_URL = process.env.STORE_URL;
const REPLICA_URL = process.env.REPLICA_URL;
if (!STORE_URL || !REPLICA_URL) { console.error('STORE_URL and REPLICA_URL required'); process.exit(1); }

const store = new pg.Pool({ connectionString: STORE_URL, max: 2 });
const replica = new pg.Pool({ connectionString: REPLICA_URL, max: 2 });
const NS = 'project-x1x2-smoke';
let failures = 0;
function assert(cond, label, extra = '') {
  if (cond) console.log(`  PASS ${label}`);
  else { failures++; console.log(`  FAIL ${label} ${extra}`); }
}

async function clean() {
  for (const p of [store, replica]) {
    await p.query(`DELETE FROM memories WHERE namespace = $1`, [NS]);
    await p.query(`DELETE FROM sync_log WHERE memory_id LIKE 'x1x2-%'`);
    await p.query(`DELETE FROM daemon_presence WHERE node LIKE 'x1x2-%'`);
  }
  await replica.query(`DELETE FROM sync_state WHERE key LIKE '%->%'`);
}

function memRow(id, text, updatedAt = null) {
  return {
    id, namespace: NS, type: 'semantic', text,
    provenance: { origin: 'x1x2-smoke' },
    ...(updatedAt ? { updated_at: updatedAt } : {}),
  };
}
async function insertMem(pool, row) {
  const cols = Object.keys(row);
  const vals = Object.values(row).map((v) => typeof v === 'object' && v !== null && !(v instanceof Date) ? JSON.stringify(v) : v);
  await pool.query(
    `INSERT INTO memories (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')})`,
    vals);
}

await clean();

// ---- 1+2. store writes while daemon offline; pull catches up -----------------
console.log('pull (offline catch-up):');
await insertMem(store, memRow('x1x2-a', 'Store-side learning A'));
await insertMem(store, memRow('x1x2-b', 'Store-side learning B'));
await insertMem(store, memRow('x1x2-c', 'Store-side learning C'));
const pr1 = await pull(store, replica);
assert(pr1.scanned === 3 && pr1.applied === 3, 'pull scanned+applied 3', JSON.stringify(pr1));
{
  const r = await replica.query(`SELECT id FROM memories WHERE namespace = $1 ORDER BY id`, [NS]);
  assert(r.rows.map((x) => x.id).join(',') === 'x1x2-a,x1x2-b,x1x2-c', 'replica has all 3 rows');
  const echo = await replica.query(`SELECT count(*)::int AS n FROM sync_log WHERE memory_id LIKE 'x1x2-%'`);
  assert(echo.rows[0].n === 0, 'no echo in replica sync_log (guard works)', `n=${echo.rows[0].n}`);
}

// ---- 3+4. replica writes; push carries them -----------------------------------
console.log('push (local writes up):');
await insertMem(replica, memRow('x1x2-d', 'Replica-side learning D'));
await insertMem(replica, memRow('x1x2-e', 'Replica-side learning E'));
const pu1 = await push(replica, store);
assert(pu1.scanned === 2 && pu1.applied === 2, 'push scanned+applied 2', JSON.stringify(pu1));
{
  const r = await store.query(`SELECT id FROM memories WHERE id IN ('x1x2-d','x1x2-e') ORDER BY id`);
  assert(r.rows.map((x) => x.id).join(',') === 'x1x2-d,x1x2-e', 'store has pushed rows');
  const echo = await store.query(`SELECT count(*)::int AS n FROM sync_log WHERE memory_id IN ('x1x2-d','x1x2-e')`);
  assert(echo.rows[0].n === 0, 'no echo in store sync_log', `n=${echo.rows[0].n}`);
}

// ---- 5. presence ----------------------------------------------------------------
console.log('presence:');
await beat(store, 'x1x2-daemon-1', 'test', { shard: 'a' });
const on = await checkPresence(store, 'x1x2-daemon-1', 300);
assert(on.online === true, 'fresh heartbeat reads online');
const off = await checkPresence(store, 'x1x2-daemon-2', 300);
assert(off.online === false && off.lastBeat === null, 'unknown node reads offline');
await store.query(`UPDATE daemon_presence SET last_beat = now() - interval '1 hour' WHERE node = 'x1x2-daemon-1'`);
const stale = await checkPresence(store, 'x1x2-daemon-1', 300);
assert(stale.online === false && stale.ageSecs > 300, 'stale heartbeat reads offline');

// ---- 6. conflict: newer updated_at wins ------------------------------------------
console.log('conflict (newer wins):');
await insertMem(store, memRow('x1x2-f', 'Store version', new Date('2026-01-01T00:00:00Z')));
await insertMem(replica, memRow('x1x2-f', 'Replica version', new Date('2026-06-01T00:00:00Z')));
const pu2 = await push(replica, store);
assert(pu2.applied >= 1, 'push applied replica row', JSON.stringify(pu2));
{
  const r = await store.query(`SELECT text FROM memories WHERE id = 'x1x2-f'`);
  assert(r.rows[0].text === 'Replica version', 'newer (replica) version won on store');
}
const pr2 = await pull(store, replica);
{
  const r = await replica.query(`SELECT text FROM memories WHERE id = 'x1x2-f'`);
  assert(r.rows[0].text === 'Replica version', 'replica kept newer version after pull');
}

// ---- 7. idle cycles scan nothing ---------------------------------------------------
console.log('idle:');
const pr3 = await pull(store, replica);
const pu3 = await push(replica, store);
assert(pr3.scanned === 0 && pu3.scanned === 0, 'idle pull/push scan zero', JSON.stringify({ pr3, pu3 }));

await clean();
await store.end();
await replica.end();
console.log(failures === 0 ? 'ALL GREEN' : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
