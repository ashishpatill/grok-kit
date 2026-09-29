/**
 * P1.G4 — Stuck-debug round-trip demo (scripted, recorded artifact).
 * Uses G1 blackboard/outbox + G2 curator + G3 nodes/Moose stand-in.
 *
 * Flow:
 *  1. Blackboard goal = stuck-debug ask
 *  2. task → grok-coder-01 (stuck=true) → handoff
 *  3. verifier-01 fail → propose learning → memory_diff
 *  4. curator-01 promotes as svc:curator
 *  5. Moose stand-in recalls the promoted learning
 *  6. Write artifact under memory/graph/demo/ + iterations note
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { registerP1Nodes } from './nodes.mjs';
import { MooseStandIn } from './moose-standin.mjs';
import { createStubMemoryPort } from './stub-memory-port.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));

function createMemoryDb() {
  const blackboard = new Map();
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
    _outbox: outbox,
    _blackboard: blackboard,
  };
}

const { Orchestrator } = await import(pathToFileURL(join(__dir, 'orchestrator.ts')).href);

const run_id = `stuck-debug-${Date.now()}`;
const trace_id = `tr-stuck-${Date.now()}`;
const ns = 'errors-resolved-debug';
const memoryPort = createStubMemoryPort();
const db = createMemoryDb();
const orch = new Orchestrator(db, { memoryPort });
registerP1Nodes(orch, { memoryPort });

const transcript = [];
function log(step, data) {
  transcript.push({ step, at: new Date().toISOString(), ...data });
  console.log(`  · ${step}`);
}

console.log('P1.G4 stuck-debug round-trip demo');
await orch.putBoard(
  'goal',
  { ask: 'debug missing grounding on propose()', mode: 'stuck-debug' },
  { run_id, updated_by: 'supervisor' }
);
log('blackboard_goal', { run_id });

await orch.emit(
  'task',
  {
    job_id: run_id,
    ask: 'debug missing grounding on propose()',
    stuck: true,
    evidence: ['propose queued without grounding_ids'],
    must_not: ['auto-promote procedural'],
    namespace: ns,
    learning:
      'Stuck-debug: when propose() queues low-evidence semantic, cite >=2 grounding ids or route to curator before retry.',
    memory_refs: [],
  },
  { from_node: 'supervisor', to_node: 'grok-coder-01', run_id, trace_id }
);
log('emit_task_stuck', { to: 'grok-coder-01' });

const drained = await orch.drain(12);
log('drain', {
  results: drained.map((d) => ({
    handled: d.handled,
    node_id: d.node_id,
    detail: d.detail,
    outbox_id: d.outbox_id,
  })),
});

const coderState = await orch.getBoard('coder_state', { run_id });
const verdict = await orch.getBoard('verdict', { run_id });
const curatorLast = await orch.getBoard('curator_last', { run_id });

const promoted_id = curatorLast?.value?.result?.promoted_id || null;
log('board_snapshot', {
  coder_stuck: coderState?.value?.stuck,
  verdict: verdict?.value?.verdict,
  curator_decision: curatorLast?.value?.result?.decision,
  promoted_id,
  decided_by: curatorLast?.value?.result?.decided_by,
});

const moose = new MooseStandIn(memoryPort, { namespace: ns });
let recall = { status: 'cold_start', count: 0, results: [] };
if (promoted_id) {
  recall = await moose.recall('grounding ids curator', { namespace: ns });
  // Also fetch by id to prove provenance
  const g = await memoryPort.get({ id: promoted_id });
  log('moose_recall', {
    recall_status: recall.status,
    recall_count: recall.count,
    hit_promoted: (recall.results || []).some((r) => r.id === promoted_id),
    provenance_author: g.memory?.provenance?.author,
    provenance_origin: g.memory?.provenance?.origin,
  });
}

const ok =
  coderState?.value?.stuck === true &&
  verdict?.value?.verdict === 'fail' &&
  curatorLast?.value?.result?.decision === 'approved' &&
  curatorLast?.value?.result?.decided_by === 'svc:curator' &&
  promoted_id &&
  (await memoryPort.get({ id: promoted_id })).memory?.provenance?.author === 'svc:curator';

const artifact = {
  demo: 'stuck-debug-round-trip',
  task: 'P1.G4',
  when: new Date().toISOString(),
  run_id,
  trace_id,
  namespace: ns,
  ok: Boolean(ok),
  promoted_id,
  decided_by: curatorLast?.value?.result?.decided_by || null,
  transcript,
  drain: drained,
};

const outDir = join(__dir, 'demo');
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, 'stuck-debug-roundtrip.json');
writeFileSync(outPath, JSON.stringify(artifact, null, 2));
console.log(`  wrote ${outPath}`);
console.log(ok ? '\nALL GREEN' : '\nDEMO FAILED');
process.exit(ok ? 0 : 1);
