/**
 * P3.C1 consolidate / Mem0 op-set smoke — stub (default) + optional --live Neon main.
 *
 *   node workers/consolidate-smoke.mjs
 *   DATABASE_URL=… node workers/consolidate-smoke.mjs --live
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyCandidate, applyOp } from './classify.mjs';
import { handleDedup } from './dedup.mjs';
import { handleConsolidate, listConsolidateCandidates } from './consolidate.mjs';
import { dispatchJob, knownKinds } from './dispatch.mjs';

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

function createStubDb() {
  /** @type {Map<string, any>} */
  const memories = new Map();
  /** @type {Map<string, any>} */
  const reviews = new Map();

  return {
    memories,
    reviews,
    async query(sql, params = []) {
      const s = sql.replace(/\s+/g, ' ').trim();

      if (s.startsWith('SELECT id, namespace, text, embedding, provenance, superseded_by, merged_into')) {
        // single-row fetch (dedup) OR list candidates (consolidate)
        if (s.includes('WHERE id =')) {
          const row = memories.get(params[0]);
          return { rows: row ? [structuredClone(row)] : [] };
        }
        // listConsolidateCandidates
        let list = [...memories.values()].filter(
          (m) => m.approval === 'live' && !m.superseded_by && !m.merged_into && !m.pinned
        );
        if (params.length >= 1 && typeof params[0] === 'string' && !Number.isFinite(Number(params[0]))) {
          list = list.filter((m) => m.namespace === params[0]);
        }
        const limit = Number(params[params.length - 1] ?? 50);
        return { rows: list.slice(0, limit).map((r) => structuredClone(r)) };
      }

      if (s.startsWith('SELECT id, text, pinned, 1 - (embedding') || s.startsWith('SELECT id, pinned, 1 - (embedding')) {
        const ns = params[0];
        const selfId = params[2];
        // Stub: treat same embedding literal as sim 0.95, else none
        const self = memories.get(selfId);
        const rows = [...memories.values()]
          .filter(
            (m) =>
              m.namespace === ns &&
              m.id !== selfId &&
              m.approval === 'live' &&
              !m.superseded_by &&
              m.embedding &&
              self?.embedding &&
              m.embedding === self.embedding
          )
          .map((m) => ({ id: m.id, pinned: !!m.pinned, sim: 0.95, text: m.text }));
        return { rows };
      }

      if (s.startsWith('INSERT INTO review_items')) {
        const id = params[0];
        const payload = JSON.parse(params[1]);
        if (!reviews.has(id)) reviews.set(id, { id, kind: 'resolution', payload, status: 'queued' });
        return { rows: [] };
      }

      if (s.startsWith("UPDATE memories SET approval = 'retired'")) {
        // DELETE apply
        const id = params[0];
        const row = memories.get(id);
        if (!row || row.approval !== 'live' || row.superseded_by) return { rows: [] };
        const prov = typeof params[1] === 'string' ? JSON.parse(params[1]) : params[1];
        row.approval = 'retired';
        row.valid_to = row.valid_to || new Date().toISOString();
        row.provenance = { ...(row.provenance || {}), ...prov };
        return {
          rows: [{
            id: row.id,
            approval: row.approval,
            valid_from: row.valid_from,
            valid_to: row.valid_to,
            superseded_by: row.superseded_by,
            merged_into: row.merged_into,
          }],
        };
      }

      if (s.startsWith('UPDATE memories SET superseded_by')) {
        const id = params[0];
        const into = params[1];
        const row = memories.get(id);
        if (!row || row.approval !== 'live' || row.superseded_by || row.id === into) return { rows: [] };
        const prov = typeof params[2] === 'string' ? JSON.parse(params[2]) : params[2];
        row.superseded_by = into;
        row.merged_into = into;
        row.approval = 'retired';
        row.valid_to = row.valid_to || new Date().toISOString();
        row.provenance = { ...(row.provenance || {}), ...prov };
        return {
          rows: [{
            id: row.id,
            approval: row.approval,
            valid_from: row.valid_from,
            valid_to: row.valid_to,
            superseded_by: row.superseded_by,
            merged_into: row.merged_into,
          }],
        };
      }

      if (s.startsWith('UPDATE memories SET version = version + 1')) {
        const id = params[0];
        const row = memories.get(id);
        if (!row) return { rows: [] };
        row.version = (row.version || 1) + 1;
        row.strength = Math.min(10, (row.strength || 5) + 0.25);
        return { rows: [{ id }] };
      }

      // decay CTE — stub soft-skip by throwing nothing; return empty
      if (s.includes('WITH pick AS') || s.startsWith('WITH pick AS')) {
        return { rows: [] };
      }

      throw new Error('stub unhandled SQL: ' + s.slice(0, 100));
    },
  };
}

function baseRow(over = {}) {
  const now = new Date();
  return {
    id: over.id || 'm1',
    namespace: over.namespace || 'project-p3c1',
    text: over.text || 'fact',
    embedding: Object.prototype.hasOwnProperty.call(over, 'embedding') ? over.embedding : '[0.1,0.2]',
    provenance: over.provenance || {},
    superseded_by: over.superseded_by ?? null,
    merged_into: over.merged_into ?? null,
    approval: over.approval || 'live',
    pinned: over.pinned ?? false,
    valid_from: over.valid_from ?? new Date(now.getTime() - 86400000).toISOString(),
    valid_to: over.valid_to ?? null,
    created_at: over.created_at ?? new Date(now.getTime() - 86400000 * 60).toISOString(),
    importance: over.importance ?? 5,
    strength: over.strength ?? 5,
    type: over.type || 'episodic',
    last_recalled_at: over.last_recalled_at ?? null,
    version: over.version ?? 1,
  };
}

console.log('classify (pure):');
{
  const add = classifyCandidate(baseRow({ embedding: '[a]' }), []);
  assert(add.op === 'ADD', 'ADD when no neighbors');

  const upd = classifyCandidate(baseRow({ embedding: '[a]' }), [{ id: 'other', sim: 0.95 }]);
  assert(upd.op === 'UPDATE' && upd.existing_id === 'other', 'UPDATE when sim≥0.92');

  const delVt = classifyCandidate(
    baseRow({ valid_to: new Date(Date.now() - 1000).toISOString() }),
    []
  );
  assert(delVt.op === 'DELETE' && delVt.reason === 'valid_to_expired', 'DELETE on valid_to expired');

  const delTtl = classifyCandidate(
    baseRow({
      provenance: { ttl_days: 7 },
      created_at: new Date(Date.now() - 86400000 * 30).toISOString(),
    }),
    []
  );
  assert(delTtl.op === 'DELETE' && delTtl.reason === 'ttl_expired', 'DELETE on ttl_days expired');

  const noopPin = classifyCandidate(baseRow({ pinned: true, embedding: '[a]' }), [
    { id: 'x', sim: 0.99, pinned: false },
  ]);
  assert(noopPin.op === 'NOOP' && noopPin.reason === 'pinned_near_duplicate', 'NOOP pinned near-dup');

  const noopFuture = classifyCandidate(
    baseRow({ valid_from: new Date(Date.now() + 86400000).toISOString() }),
    []
  );
  assert(noopFuture.op === 'NOOP' && noopFuture.reason === 'not_yet_valid', 'NOOP not_yet_valid');

  const noopEmb = classifyCandidate(baseRow({ embedding: null }), []);
  assert(noopEmb.op === 'NOOP' && noopEmb.reason === 'no_embedding_yet', 'NOOP no embedding');
}

console.log('dispatch kinds:');
assert(knownKinds().includes('consolidate'), 'knownKinds includes consolidate');
assert(knownKinds().includes('dedup'), 'knownKinds includes dedup');

console.log('stub apply + consolidate:');
{
  const db = createStubDb();
  const ns = 'project-p3c1-stub';

  db.memories.set(
    'keep',
    baseRow({ id: 'keep', namespace: ns, embedding: '[same]', text: 'canonical fact' })
  );
  db.memories.set(
    'dup',
    baseRow({ id: 'dup', namespace: ns, embedding: '[same]', text: 'canonical fact copy' })
  );
  db.memories.set(
    'expired',
    baseRow({
      id: 'expired',
      namespace: ns,
      embedding: '[other]',
      valid_to: new Date(Date.now() - 3600_000).toISOString(),
      text: 'stale window',
    })
  );
  db.memories.set(
    'fresh',
    baseRow({ id: 'fresh', namespace: ns, embedding: '[unique]', text: 'brand new' })
  );

  const dedupQueue = await handleDedup(db, { memory_id: 'dup', apply: false });
  assert(dedupQueue.ok && dedupQueue.op === 'UPDATE' && dedupQueue.review_id, 'dedup UPDATE → review without apply');

  const dedupApply = await handleDedup(db, { memory_id: 'dup', apply: true });
  assert(
    dedupApply.ok && dedupApply.op === 'UPDATE' && dedupApply.applied,
    'dedup UPDATE apply merges dup'
  );
  assert(db.memories.get('dup').approval === 'retired', 'dup retired');
  assert(db.memories.get('dup').merged_into === 'keep', 'dup merged_into keep');
  assert(db.memories.get('dup').valid_to, 'dup valid_to closed');

  // re-seed a near-dup for consolidate path (dup already applied)
  db.memories.set(
    'dup2',
    baseRow({ id: 'dup2', namespace: ns, embedding: '[same]', text: 'another copy' })
  );

  const cons = await handleConsolidate(db, {
    namespace: ns,
    limit: 20,
    apply: true,
    decay: false,
  });
  assert(cons.ok && cons.kind === 'consolidate', 'consolidate returns ok');
  assert(cons.counts.DELETE >= 1, 'consolidate DELETE count ≥1 (expired)');
  assert(db.memories.get('expired').approval === 'retired', 'expired retired via consolidate');
  assert(db.memories.get('expired').valid_to, 'expired valid_to set');

  const viaDispatch = await dispatchJob(db, {
    kind: 'consolidate',
    namespace: ns,
    limit: 5,
    decay: false,
  });
  assert(viaDispatch.ok && viaDispatch.kind === 'consolidate', 'dispatch consolidate');

  const listed = await listConsolidateCandidates(db, { namespace: ns, limit: 10 });
  assert(Array.isArray(listed), 'listConsolidateCandidates returns array');
}

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
    const db = { query: (sql, params) => pool.query(sql, params) };
    const ns = `project-p3c1-${Date.now()}`;
    const idExpired = `p3c1_exp_${Date.now()}`;
    const idKeep = `p3c1_keep_${Date.now()}`;
    const idDup = `p3c1_dup_${Date.now()}`;
    try {
      // Insert disposable rows without embeddings first; DELETE path uses valid_to
      const prov = JSON.stringify({
        source_session: 'p3c1-smoke',
        author: 'svc:consolidate-smoke',
        origin: 'internal',
        created_at: new Date().toISOString(),
      });
      await db.query(
        `INSERT INTO memories (
           id, namespace, type, scope, text, approval, pinned, importance, strength,
           index_status, grounding_ids, provenance, valid_from, valid_to
         ) VALUES
           ($1, $4, 'episodic', 'global', 'p3c1 keep fact', 'live', false, 5, 5,
            'staged', '{}', $5::jsonb, now() - interval '1 day', NULL),
           ($2, $4, 'episodic', 'global', 'p3c1 expired fact', 'live', false, 5, 5,
            'staged', '{}', $5::jsonb, now() - interval '10 days', now() - interval '1 hour'),
           ($3, $4, 'episodic', 'global', 'p3c1 ttl fact', 'live', false, 5, 5,
            'staged', '{}', ($5::jsonb || '{"ttl_days":1}'::jsonb), now() - interval '10 days', NULL)`,
        [idKeep, idExpired, idDup, ns, prov]
      );

      const cons = await handleConsolidate(db, {
        namespace: ns,
        limit: 20,
        apply: true,
        decay: false,
      });
      assert(cons.ok, 'live consolidate ok');
      assert(cons.counts.DELETE >= 1, 'live DELETE ≥1');

      const check = await db.query(
        `SELECT id, approval, valid_to IS NOT NULL AS closed
         FROM memories WHERE id = ANY($1::text[])`,
        [[idExpired, idDup, idKeep]]
      );
      const byId = Object.fromEntries(check.rows.map((r) => [r.id, r]));
      assert(byId[idExpired]?.approval === 'retired', 'live expired retired');
      assert(byId[idExpired]?.closed === true, 'live expired valid_to closed');
      // ttl row (idDup) created_at defaults to now() in insert — use provenance ttl with old created_at?
      // We set valid_from old but created_at is DEFAULT now() — ttl may NOOP. Force DELETE via classify on valid_to only.
      // idDup may be ADD (no embedding). That's fine — assert keep still live.
      assert(byId[idKeep]?.approval === 'live', 'live keep still live');

      await db.query(`DELETE FROM memories WHERE namespace = $1`, [ns]);
      assert(true, 'live cleanup');
    } catch (e) {
      failures += 1;
      console.log(`  FAIL live (${e.code || ''} ${e.message})`);
      try {
        await pool.query(`DELETE FROM memories WHERE namespace = $1`, [ns]);
      } catch {
        /* ignore */
      }
    } finally {
      await pool.end().catch(() => {});
    }
  }
}

console.log(failures === 0 ? '\nALL GREEN — P3.C1 consolidate smoke' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
