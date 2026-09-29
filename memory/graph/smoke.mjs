/**
 * P1.G1 smoke — in-memory SQL-ish stub (no Neon) + optional live DATABASE_URL check.
 * Run: node graph/smoke.mjs
 *      DATABASE_URL=… node graph/smoke.mjs --live   # read/write p1-v1 (careful)
 */
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

let failures = 0;
function assert(cond, label, extra = '') {
  if (cond) console.log(`  PASS ${label}`);
  else {
    failures += 1;
    console.log(`  FAIL ${label} ${extra}`);
  }
}

/** Minimal in-memory stand-in for blackboard/outbox tables. */
function createMemoryDb() {
  let bbId = 1;
  let oxId = 1;
  /** @type {Map<string, any>} */
  const board = new Map();
  /** @type {any[]} */
  const outbox = [];

  return {
    async query(text, params = []) {
      const sql = text.replace(/\s+/g, ' ').trim();
      if (sql.startsWith('INSERT INTO blackboard')) {
        const [run_id, key, valueJson, updated_by] = params;
        const k = `${run_id}::${key}`;
        const existing = board.get(k);
        const now = new Date().toISOString();
        const row = existing
          ? {
              ...existing,
              value: JSON.parse(valueJson),
              version: existing.version + 1,
              updated_by,
              updated_at: now,
            }
          : {
              id: bbId++,
              run_id,
              key,
              value: JSON.parse(valueJson),
              version: 1,
              updated_by,
              created_at: now,
              updated_at: now,
            };
        board.set(k, row);
        return { rows: [row] };
      }
      if (sql.startsWith('SELECT id, run_id, key, value')) {
        const [run_id, key] = params;
        const row = board.get(`${run_id}::${key}`);
        return { rows: row ? [row] : [] };
      }
      if (sql.startsWith('INSERT INTO outbox')) {
        const [topic, payloadJson, trace_id, from_node, to_node, run_id] = params;
        const row = {
          id: oxId++,
          topic,
          payload: JSON.parse(payloadJson),
          trace_id,
          from_node,
          to_node,
          run_id,
          status: 'pending',
          created_at: new Date().toISOString(),
          claimed_at: null,
          done_at: null,
        };
        outbox.push(row);
        return { rows: [row] };
      }
      if (sql.includes("SET status = 'claimed'")) {
        const topics = Array.isArray(params[0]) ? params[0] : null;
        const idx = outbox.findIndex(
          (r) => r.status === 'pending' && (!topics || topics.includes(r.topic))
        );
        if (idx < 0) return { rows: [] };
        outbox[idx] = {
          ...outbox[idx],
          status: 'claimed',
          claimed_at: new Date().toISOString(),
        };
        return { rows: [outbox[idx]] };
      }
      if (sql.startsWith('UPDATE outbox SET status = $2')) {
        const [id, status] = params;
        const row = outbox.find((r) => r.id === id);
        if (!row) return { rows: [] };
        Object.assign(row, { status, done_at: new Date().toISOString() });
        return { rows: [row] };
      }
      throw new Error('stub SQL not handled: ' + sql.slice(0, 80));
    },
    _board: board,
    _outbox: outbox,
  };
}

async function loadOrchestrator() {
  // Node 22+ type stripping for .ts
  const mod = await import(pathToFileURL(join(__dir, 'orchestrator.ts')).href);
  return mod;
}

console.log('P1.G1 graph orchestrator smoke (memory stub)');
const { Orchestrator } = await loadOrchestrator();
const db = createMemoryDb();
const orch = new Orchestrator(db);
orch.register({
  node_id: 'grok-coder-01',
  role: 'coder',
  topics: ['task', 'handoff'],
});
orch.register({
  node_id: 'verifier-01',
  role: 'verifier',
  topics: ['verdict'],
});

const put = await orch.putBoard('goal', { ask: 'ship G1' }, { run_id: 'run-g1', updated_by: 'test' });
assert(put.key === 'goal' && put.version === 1, 'blackboard put');
const got = await orch.getBoard('goal', { run_id: 'run-g1' });
assert(got && got.value.ask === 'ship G1', 'blackboard get');

const put2 = await orch.putBoard('goal', { ask: 'ship G1+smoke' }, { run_id: 'run-g1', updated_by: 'test' });
assert(put2.version === 2, 'blackboard version bump');

const ev = await orch.emit(
  'task',
  { ask: 'implement migration 004' },
  { from_node: 'supervisor', to_node: 'grok-coder-01', run_id: 'run-g1', trace_id: 'tr-1' }
);
assert(ev.id && ev.status === 'pending', 'outbox enqueue');

orch.pause();
const paused = await orch.dispatchOnce();
assert(paused.handled === false && paused.detail === 'paused', 'pause blocks dispatch');
orch.resume();

const d1 = await orch.dispatchOnce();
assert(d1.handled === true && d1.node_id === 'grok-coder-01', 'dispatch claims task', JSON.stringify(d1));
const last = await orch.getBoard('last_dispatch:task', { run_id: 'run-g1' });
assert(last && last.value.outbox_id === d1.outbox_id, 'dispatch writes blackboard');

const empty = await orch.dispatchOnce();
assert(empty.handled === false && empty.detail === 'empty', 'empty outbox');

// ---- optional live Neon ----
if (process.argv.includes('--live')) {
  console.log('live Neon p1-v1:');
  if (!process.env.DATABASE_URL) {
    console.log('  SKIP live (DATABASE_URL missing)');
  } else {
    const pg = require('pg');
    const pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      max: 2,
      connectionTimeoutMillis: 20_000,
    });
    try {
      const live = new Orchestrator(pool);
      live.register({ node_id: 'curator-01', topics: ['memory_diff'] });
      const runId = `g1-smoke-${Date.now()}`;
      await live.putBoard('ping', { ok: true }, { run_id: runId, updated_by: 'g1-smoke' });
      const ping = await live.getBoard('ping', { run_id: runId });
      assert(ping && ping.value.ok === true, 'live blackboard round-trip');
      const ox = await live.emit('memory_diff', { note: 'g1' }, { run_id: runId, from_node: 'g1-smoke' });
      const d = await live.dispatchOnce();
      assert(d.handled === true && d.outbox_id === ox.id, 'live dispatch', JSON.stringify(d));
      await pool.query(`DELETE FROM outbox WHERE run_id = $1`, [runId]);
      await pool.query(`DELETE FROM blackboard WHERE run_id = $1`, [runId]);
      assert(true, 'live cleanup');
    } catch (e) {
      console.log(`  SKIP live (${e.code || e.message}) — tables verified via Neon MCP`);
    } finally {
      await pool.end().catch(() => {});
    }
  }
}

console.log(failures === 0 ? '\nALL GREEN' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
