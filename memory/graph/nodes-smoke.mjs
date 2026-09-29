/**
 * P1.G3 — 3 nodes + Moose stand-in smoke (stub orchestrator DB + MemoryPort).
 */
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerP1Nodes, NODE_DEFS } from './nodes.mjs';
import { MooseStandIn } from './moose-standin.mjs';
import { CuratorClient } from './curator-client.mjs';
import { createStubMemoryPort } from './stub-memory-port.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

let failures = 0;
function assert(cond, label, extra = '') {
  if (cond) console.log(`  PASS ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label} ${extra}`);
  }
}

/** Reuse G1 in-memory SQL-ish stub from smoke.mjs by importing createMemoryDb pattern inline. */
async function loadOrchestratorAndDb() {
  // Minimal copy of G1 stub (blackboard + outbox) — import from smoke via dynamic eval avoided;
  // duplicate compact stub here for independence.
  const { Orchestrator } = await import(pathToFileURL(join(__dir, 'orchestrator.ts')).href);
  return { Orchestrator, db: createMemoryDb() };
}

function createMemoryDb() {
  const blackboard = new Map(); // key = run_id\0key
  const outbox = [];
  let bbId = 1;
  let oxId = 1;

  return {
    async query(text, params = []) {
      const sql = text.replace(/\s+/g, ' ').trim();
      if (sql.startsWith('INSERT INTO blackboard')) {
        const [run_id, key, valueJson, updated_by] = params;
        const value = typeof valueJson === 'string' ? JSON.parse(valueJson) : valueJson;
        const k = `${run_id}\0${key}`;
        const existing = blackboard.get(k);
        if (existing) {
          existing.value = value;
          existing.version += 1;
          existing.updated_by = updated_by;
          existing.updated_at = new Date().toISOString();
          return { rows: [existing] };
        }
        const row = {
          id: bbId++,
          run_id,
          key,
          value,
          version: 1,
          updated_by,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        blackboard.set(k, row);
        return { rows: [row] };
      }
      if (sql.startsWith('SELECT id, run_id, key, value')) {
        const [run_id, key] = params;
        const row = blackboard.get(`${run_id}\0${key}`);
        return { rows: row ? [row] : [] };
      }
      if (sql.startsWith('INSERT INTO outbox')) {
        const [topic, payloadJson, trace_id, from_node, to_node, run_id] = params;
        const row = {
          id: oxId++,
          topic,
          payload: typeof payloadJson === 'string' ? JSON.parse(payloadJson) : payloadJson,
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
        const topics = params[0];
        const next = outbox.find(
          (r) =>
            r.status === 'pending' &&
            (!topics || !topics.length || topics.includes(r.topic))
        );
        if (!next) return { rows: [] };
        next.status = 'claimed';
        next.claimed_at = new Date().toISOString();
        return { rows: [next] };
      }
      if (sql.startsWith('UPDATE outbox SET status')) {
        const [id, status] = params;
        const row = outbox.find((r) => r.id === id);
        if (!row) return { rows: [] };
        row.status = status;
        row.done_at = new Date().toISOString();
        return { rows: [row] };
      }
      return { rows: [] };
    },
  };
}

console.log('P1.G3 nodes + Moose stand-in smoke');
assert(NODE_DEFS.map((n) => n.node_id).join(',') === 'grok-coder-01,verifier-01,curator-01', '3 node ids');

const { Orchestrator } = await loadOrchestratorAndDb();
const memoryPort = createStubMemoryPort();
const db = createMemoryDb();
const orch = new Orchestrator(db, { memoryPort });
const { curator } = registerP1Nodes(orch, { memoryPort });
assert(orch.nodes.size === 3, 'registered 3 nodes');
assert(curator.identity === 'svc:curator', 'curator identity');

const moose = new MooseStandIn(memoryPort, { namespace: 'project-g3-moose' });
const rt = await moose.scriptedRoundTrip(curator);
assert(rt.status === 'ok', 'moose scripted round-trip');
assert(rt.promoted_id, 'moose learning promoted');
assert(rt.recall_count >= 1, 'moose recall hits promoted/stored', String(rt.recall_count));
const got = await memoryPort.get({ id: rt.promoted_id });
assert(got.memory.provenance.author === 'svc:curator', 'promoted by svc:curator');

// Minimal dispatch: task → coder
await orch.emit(
  'task',
  { ask: 'fix typo', stuck: false },
  { from_node: 'supervisor', to_node: 'grok-coder-01', run_id: 'run-g3' }
);
const d1 = await orch.dispatchOnce();
assert(d1.handled && d1.node_id === 'grok-coder-01', 'dispatch coder', JSON.stringify(d1));

console.log(failures === 0 ? '\nALL GREEN' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
