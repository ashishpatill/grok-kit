/**
 * P3.B1–B4 bus smoke — in-memory stub (default) + optional --live Neon main.
 *
 *   node bus/smoke.mjs
 *   DATABASE_URL=… node bus/smoke.mjs --live
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { accept, listOnline, MESSAGE_TYPES } from './index.mjs';
import { canTransition, hasEvidence } from './types.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(__dir, '..', 'package.json'));

let failures = 0;
function assert(cond, label, extra = '') {
  if (cond) console.log(`  PASS ${label}`);
  else {
    failures += 1;
    console.log(`  FAIL ${label} ${extra}`);
  }
}

/** Minimal stub covering daemon_presence + bus_messages + bus_tasks (+ outbox). */
function createStubDb() {
  /** @type {Map<string, any>} */
  const presence = new Map();
  /** @type {Map<string, any>} */
  const messages = new Map();
  /** @type {Map<string, any>} */
  const tasks = new Map();
  /** @type {any[]} */
  const outbox = [];
  let oxId = 1;

  return {
    async query(text, params = []) {
      const sql = text.replace(/\s+/g, ' ').trim();

      if (sql.startsWith('INSERT INTO daemon_presence')) {
        const [node, version, metaJson] = params;
        const row = {
          node,
          last_beat: new Date(),
          version,
          meta: typeof metaJson === 'string' ? JSON.parse(metaJson) : metaJson,
        };
        presence.set(node, row);
        return { rows: [row] };
      }
      if (sql.startsWith('SELECT last_beat FROM daemon_presence')) {
        const row = presence.get(params[0]);
        return { rows: row ? [{ last_beat: row.last_beat }] : [] };
      }
      if (sql.startsWith('SELECT node, last_beat, version, meta')) {
        const threshold = params[0] ?? 300;
        const now = Date.now();
        const rows = [...presence.values()]
          .map((r) => ({
            ...r,
            age_secs: (now - new Date(r.last_beat).getTime()) / 1000,
          }))
          .filter((r) => r.age_secs <= threshold);
        return { rows };
      }

      if (sql.startsWith('INSERT INTO bus_messages')) {
        const [id, from_bot, to_bot, ask, evidenceJson, memory_refs, metaJson] = params;
        const row = {
          id,
          msg_type: 'message.send',
          from_bot,
          to_bot,
          ask,
          evidence: JSON.parse(evidenceJson),
          memory_refs,
          status: 'submitted',
          meta: JSON.parse(metaJson),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        messages.set(id, row);
        return { rows: [row] };
      }
      if (sql.startsWith('SELECT * FROM bus_messages')) {
        const row = messages.get(params[0]);
        return { rows: row ? [row] : [] };
      }
      if (sql.startsWith('UPDATE bus_messages SET status')) {
        const [id, status] = params;
        const row = messages.get(id);
        if (!row) return { rows: [] };
        row.status = status;
        row.updated_at = new Date().toISOString();
        return { rows: [row] };
      }

      if (sql.startsWith('INSERT INTO bus_tasks')) {
        const [id, from_bot, to_bot, ask, evidenceJson, memory_refs, run_id, metaJson] =
          params;
        const row = {
          id,
          from_bot,
          to_bot,
          ask,
          evidence: JSON.parse(evidenceJson),
          memory_refs,
          status: 'submitted',
          result: {},
          run_id,
          meta: JSON.parse(metaJson),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        tasks.set(id, row);
        return { rows: [row] };
      }
      if (sql.startsWith('SELECT * FROM bus_tasks')) {
        const row = tasks.get(params[0]);
        return { rows: row ? [row] : [] };
      }
      if (sql.startsWith('UPDATE bus_tasks SET status')) {
        const [id, status, resultJson] = params;
        const row = tasks.get(id);
        if (!row) return { rows: [] };
        row.status = status;
        row.result = typeof resultJson === 'string' ? JSON.parse(resultJson) : resultJson;
        row.updated_at = new Date().toISOString();
        return { rows: [row] };
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
        };
        outbox.push(row);
        return { rows: [row] };
      }

      throw new Error('stub SQL not handled: ' + sql.slice(0, 100));
    },
    _presence: presence,
    _messages: messages,
    _tasks: tasks,
    _outbox: outbox,
  };
}

console.log('P3.B1–B4 inter-bot bus smoke (stub)');
assert(MESSAGE_TYPES.length === 6, 'six message types');
assert(hasEvidence({ evidence: [{ k: 1 }] }), 'evidence gate: evidence ok');
assert(hasEvidence({ memory_refs: ['m1'] }), 'evidence gate: memory_refs ok');
assert(!hasEvidence({ evidence: [], memory_refs: [] }), 'evidence gate: empty fail');
assert(canTransition('submitted', 'working'), 'lifecycle submitted→working');
assert(canTransition('working', 'completed'), 'lifecycle working→completed');
assert(!canTransition('completed', 'working'), 'lifecycle terminal freeze');

const db = createStubDb();

// B1 presence.heartbeat
const hb = await accept(db, {
  type: 'presence.heartbeat',
  node: 'grok-coder-01',
  version: 'p3-bus-smoke',
  meta: { role: 'coder' },
});
assert(hb.ok && hb.presence.online === true, 'B1 heartbeat online');
const offline = await accept(db, {
  type: 'presence.heartbeat',
  node: 'ghost-bot',
});
// make ghost stale
db._presence.get('ghost-bot').last_beat = new Date(Date.now() - 600_000);
const { checkPresence } = await import('../daemon/presence.mjs');
const stale = await checkPresence(db, 'ghost-bot', 300);
assert(stale.online === false, 'B1 stale peer offline');
const online = await listOnline(db, 300);
assert(online.some((p) => p.node === 'grok-coder-01'), 'B1 listOnline includes coder');
assert(!online.some((p) => p.node === 'ghost-bot'), 'B1 listOnline excludes stale');

// B2 message.send — fail closed then success
let rejected = false;
try {
  await accept(db, {
    type: 'message.send',
    from: 'a',
    to: 'b',
    ask: 'no evidence',
  });
} catch (e) {
  rejected = e.code === 'bus_no_evidence';
}
assert(rejected, 'B2 message.send fail-closed without evidence');

const msg = await accept(db, {
  type: 'message.send',
  from: 'grok-coder-01',
  to: 'verifier-01',
  ask: 'review this patch',
  evidence: [{ kind: 'diff', sha: 'abc' }],
  memory_refs: ['mem_real_1'],
});
assert(msg.ok && msg.message.status === 'submitted', 'B2 message.send persisted');

// B3 task lifecycle
const treq = await accept(db, {
  type: 'task.request',
  from: 'supervisor',
  to: 'grok-coder-01',
  ask: 'implement bus scaffold',
  memory_refs: ['mem_plan_1'],
  run_id: 'run-bus-smoke',
});
assert(treq.ok && treq.task.status === 'submitted', 'B3 task.request submitted');
assert(
  db._outbox.some((o) => o.topic === 'task.request'),
  'B3 task.request mirrored to outbox',
);

const twork = await accept(db, {
  type: 'task.update',
  id: treq.task.id,
  status: 'working',
});
assert(twork.task.status === 'working', 'B3 task.update → working');

const tdone = await accept(db, {
  type: 'task.update',
  id: treq.task.id,
  status: 'completed',
  result: { note: 'done' },
});
assert(tdone.task.status === 'completed', 'B3 task.update → completed');

let badCancel = false;
try {
  await accept(db, { type: 'task.cancel', id: treq.task.id });
} catch (e) {
  badCancel = e.code === 'bus_bad_transition';
}
assert(badCancel, 'B3 cannot cancel completed task');

const t2 = await accept(db, {
  type: 'task.request',
  from: 'supervisor',
  to: 'verifier-01',
  ask: 'verify',
  evidence: [{ kind: 'suite', name: 'bus:smoke' }],
});
const tc = await accept(db, { type: 'task.cancel', id: t2.task.id });
assert(tc.task.status === 'canceled', 'B3 task.cancel');

// B4 wake.request with mock fetch (no live daemon required)
const wake = await accept(
  null,
  { type: 'wake.request', source: 'bus-smoke', from: 'grok-coder-01' },
  {
    wake: {
      token: 'test-token',
      url: 'http://127.0.0.1:9/wake',
      fetchImpl: async (url, init) => {
        const auth = init.headers.authorization;
        assert(auth === 'Bearer test-token', 'B4 wake sends bearer');
        const body = JSON.parse(init.body);
        assert(body.type === 'wake.request' || body.source === 'bus-smoke', 'B4 wake body');
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ ok: true, drained: 0, mock: true }),
        };
      },
    },
  },
);
assert(wake.ok && wake.wake.status === 200, 'B4 wake.request mock ok');

let noTok = false;
try {
  await accept(null, { type: 'wake.request' }, { wake: { url: 'http://x', token: '' } });
} catch (e) {
  noTok = e.code === 'bus_wake_no_token';
}
assert(noTok, 'B4 wake.request fails without token');

// ---- optional live Neon main ----
if (process.argv.includes('--live')) {
  console.log('live Neon main:');
  const dotenv = require('dotenv');
  dotenv.config({ path: join(__dir, '..', '.env.local') });
  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) {
    console.log('  SKIP live (DATABASE_URL missing)');
  } else {
    const pg = require('pg');
    const pool = new pg.Pool({
      connectionString: DATABASE_URL,
      max: 2,
      connectionTimeoutMillis: 20_000,
    });
    const ns = `p3-bus-${Date.now()}`;
    try {
      const liveHb = await accept(pool, {
        type: 'presence.heartbeat',
        node: `bus-smoke-${ns}`,
        version: 'p3-bus-live',
      });
      assert(liveHb.ok && liveHb.presence.online, 'live B1 heartbeat');

      const liveMsg = await accept(pool, {
        type: 'message.send',
        from: `bus-smoke-${ns}`,
        to: 'verifier-01',
        ask: 'live bus smoke',
        evidence: [{ kind: 'smoke', at: new Date().toISOString() }],
        memory_refs: ['live_smoke_ref'],
        id: `msg_${ns}`,
      });
      assert(liveMsg.ok, 'live B2 message.send');

      const liveTask = await accept(pool, {
        type: 'task.request',
        from: `bus-smoke-${ns}`,
        to: 'grok-coder-01',
        ask: 'live task',
        memory_refs: ['live_smoke_ref'],
        id: `task_${ns}`,
        run_id: ns,
      });
      assert(liveTask.ok, 'live B3 task.request');
      await accept(pool, {
        type: 'task.update',
        id: liveTask.task.id,
        status: 'working',
      });
      await accept(pool, {
        type: 'task.update',
        id: liveTask.task.id,
        status: 'completed',
        result: { live: true },
      });
      assert(true, 'live B3 lifecycle completed');

      // cleanup smoke rows
      await pool.query(`DELETE FROM bus_messages WHERE id = $1`, [`msg_${ns}`]);
      await pool.query(`DELETE FROM bus_tasks WHERE id = $1`, [`task_${ns}`]);
      await pool.query(`DELETE FROM outbox WHERE run_id = $1`, [ns]);
      await pool.query(`DELETE FROM daemon_presence WHERE node = $1`, [`bus-smoke-${ns}`]);
      assert(true, 'live cleanup');
    } catch (e) {
      failures += 1;
      console.log(`  FAIL live (${e.code || ''} ${e.message})`);
    } finally {
      await pool.end().catch(() => {});
    }
  }
}

console.log(failures === 0 ? '\nALL GREEN' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
