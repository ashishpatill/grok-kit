/**
 * P1.M7 workers smoke — in-memory stub DB (no Neon required).
 * Run: node workers/smoke.mjs
 */
import { dispatchJob, knownKinds } from './dispatch.mjs';
import { chainJobsFor, listNeedsEmbed } from './reconcile.mjs';
import { handleScore } from './score.mjs';

function assert(cond, msg) {
  if (!cond) throw new Error('FAIL: ' + msg);
  console.log('OK  ', msg);
}

/** Minimal stub that stores memories + review_items in Maps */
function createStubDb() {
  const memories = new Map();
  const reviews = new Map();

  return {
    memories,
    reviews,
    async query(sql, params = []) {
      const s = sql.replace(/\s+/g, ' ').trim();

      if (s.startsWith('SELECT id, text, embedding IS NOT NULL')) {
        const row = memories.get(params[0]);
        return { rows: row ? [{ id: row.id, text: row.text, has_embedding: !!row.embedding, index_status: row.index_status }] : [] };
      }
      if (s.startsWith('SELECT id, text, type, pinned, importance')) {
        const row = memories.get(params[0]);
        return { rows: row ? [{ id: row.id, text: row.text, type: row.type, pinned: row.pinned, importance: row.importance }] : [] };
      }
      if (s.startsWith('SELECT id, namespace, text, embedding, provenance, superseded_by')) {
        const row = memories.get(params[0]);
        return {
          rows: row
            ? [{
                id: row.id,
                namespace: row.namespace,
                text: row.text,
                embedding: row.embedding,
                provenance: row.provenance,
                superseded_by: row.superseded_by,
              }]
            : [],
        };
      }
      if (s.startsWith('SELECT id FROM memories WHERE embedding IS NULL')) {
        const limit = params[0] ?? 50;
        const rows = [...memories.values()]
          .filter((m) => !m.embedding && !m.superseded_by && m.approval === 'live')
          .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
          .slice(0, limit)
          .map((m) => ({ id: m.id }));
        return { rows };
      }
      if (s.startsWith('SELECT id, text, 1 - (embedding')) {
        // near neighbors — stub returns empty (no vector math)
        return { rows: [] };
      }
      if (s.startsWith('UPDATE memories SET embedding')) {
        const id = params[0];
        const lit = params[1];
        const model = params[2];
        const row = memories.get(id);
        if (!row) return { rows: [] };
        row.embedding = lit;
        row.index_status = 'indexed';
        row.provenance = { ...(row.provenance || {}), embedding_model: model };
        return { rows: [{ id, index_status: 'indexed', has_embedding: true }] };
      }
      if (s.startsWith('UPDATE memories SET importance')) {
        const id = params[0];
        const score = params[1];
        const model = params[2];
        const row = memories.get(id);
        if (!row) return { rows: [] };
        row.importance = score;
        row.provenance = { ...(row.provenance || {}), importance_model: model };
        return { rows: [{ id }] };
      }
      if (s.startsWith('INSERT INTO review_items')) {
        const id = params[0];
        const payload = JSON.parse(params[1]);
        if (!reviews.has(id)) reviews.set(id, { id, kind: 'resolution', payload, status: 'queued' });
        return { rows: [] };
      }
      throw new Error('stub unhandled SQL: ' + s.slice(0, 80));
    },
  };
}

// ---- tests ----
assert(knownKinds().includes('embed'), 'knownKinds includes embed');
assert(knownKinds().includes('score'), 'knownKinds includes score');
assert(knownKinds().includes('dedup'), 'knownKinds includes dedup');

const chain = chainJobsFor('m1');
assert(chain.length === 3 && chain[0].kind === 'embed', 'chainJobsFor embed→score→dedup');

const db = createStubDb();
db.memories.set('m-staged', {
  id: 'm-staged',
  namespace: 'project-test',
  type: 'episodic',
  text: 'PR 443 merged to v1 as tip 836c5594 — finish banner and statusline goal chip.',
  pinned: false,
  importance: 5,
  index_status: 'staged',
  embedding: null,
  superseded_by: null,
  approval: 'live',
  provenance: {},
  created_at: '2026-09-29T00:00:00Z',
});

const needs = await listNeedsEmbed(db, { limit: 10 });
assert(needs.includes('m-staged'), 'listNeedsEmbed finds staged row');

// score (heuristic — no OpenRouter)
const scoreRes = await handleScore(db, { memory_id: 'm-staged' });
assert(scoreRes.ok && scoreRes.importance >= 1 && scoreRes.importance <= 10, 'score heuristic 1..10');
assert(db.memories.get('m-staged').importance === scoreRes.importance, 'score persisted');

// dedup without embedding → NOOP
const dedupEarly = await dispatchJob(db, { kind: 'dedup', memory_id: 'm-staged' });
assert(dedupEarly.ok && dedupEarly.op === 'NOOP', 'dedup NOOP without embedding');

// unknown kind
const unk = await dispatchJob(db, { kind: 'mirror_backup' });
assert(!unk.ok && unk.skipped, 'unknown kind skipped');

// missing memory
const miss = await dispatchJob(db, { kind: 'score', memory_id: 'nope' });
assert(!miss.ok && miss.error === 'memory_not_found', 'missing memory errors cleanly');

// embed: only if MEMORY_SMOKE_EMBED=1 (downloads MiniLM ~20MB)
if (process.env.MEMORY_SMOKE_EMBED === '1') {
  console.log('… running live MiniLM embed (MEMORY_SMOKE_EMBED=1)');
  const emb = await dispatchJob(db, { kind: 'embed', memory_id: 'm-staged' });
  assert(emb.ok && emb.has_embedding && emb.index_status === 'indexed', 'embed indexes staged row');
  assert(db.memories.get('m-staged').index_status === 'indexed', 'embed persisted index_status');
  const dedup = await dispatchJob(db, { kind: 'dedup', memory_id: 'm-staged' });
  assert(dedup.ok && dedup.op === 'ADD', 'dedup ADD when no neighbors');
} else {
  console.log('SKIP embed MiniLM (set MEMORY_SMOKE_EMBED=1 to exercise)');
  // Simulate post-embed state for dedup ADD path
  db.memories.get('m-staged').embedding = '[0.1]';
  db.memories.get('m-staged').index_status = 'indexed';
  const dedup = await dispatchJob(db, { kind: 'dedup', memory_id: 'm-staged' });
  assert(dedup.ok && dedup.op === 'ADD', 'dedup ADD when no neighbors (simulated emb)');
}

console.log('\nALL GREEN — P1.M7 workers smoke');
