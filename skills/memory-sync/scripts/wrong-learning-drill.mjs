/**
 * P2.S1 Wrong-learning drill.
 * Deliberately propose a plausible-but-false semantic learning with <2 grounding_ids.
 * Exit: must land in proposals (queued_for_review), never auto-promote into memories.
 *
 * Usage: DATABASE_URL=… node skills/memory-sync/scripts/wrong-learning-drill.mjs
 */
import { emitSemanticPropose } from '../../lib/bot-memory-propose.mjs';
import pg from '../../../memory/node_modules/pg/lib/index.js';

const DATABASE_URL = process.env.DATABASE_URL || process.env.BOT_MEMORY_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL missing');
  process.exit(1);
}

const NS = 'project-p2s1-wrong-learning';
const FALSE_TEXT =
  'FALSE-DRILL: Neon bot-memory main stores embeddings as float32[1536] OpenAI ada-002 (this is deliberately wrong — must not auto-promote).';

const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });
let failures = 0;
function assert(cond, label, extra = '') {
  if (cond) console.log(`  PASS ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label} ${extra}`);
  }
}

{
  const c = await pool.connect();
  try {
    await c.query(`DELETE FROM memories WHERE namespace = $1`, [NS]);
    await c.query(`DELETE FROM proposals WHERE namespace = $1`, [NS]);
  } finally {
    c.release();
  }
}

const result = await emitSemanticPropose({
  namespace: NS,
  text: FALSE_TEXT,
  metadata: {
    author: 'p2s1-drill',
    origin: 'wrong-learning-drill',
    grounding_ids: [], // low-evidence → human queue
    importance: 8,
  },
  databaseUrl: DATABASE_URL,
});

console.log('propose:', JSON.stringify(result));
assert(result.status === 'ok', 'status ok');
assert(result.decision === 'queued_for_review', 'queued_for_review', JSON.stringify(result));
assert(result.reason === 'low-evidence', 'reason low-evidence');
assert(Boolean(result.proposal_id), 'proposal_id present');

{
  const c = await pool.connect();
  try {
    const mem = await c.query(`SELECT id FROM memories WHERE namespace = $1 AND text = $2`, [
      NS,
      FALSE_TEXT,
    ]);
    assert(mem.rows.length === 0, 'NOT in memories (no auto-promote)', `n=${mem.rows.length}`);
    const prop = await c.query(
      `SELECT id, route_reason, status FROM proposals WHERE id = $1`,
      [result.proposal_id]
    );
    assert(prop.rows.length === 1, 'row in proposals');
    assert(prop.rows[0]?.route_reason === 'low-evidence', 'route_reason low-evidence');
    // leave the proposal for human review evidence; mark drill tag in status note via provenance already
  } finally {
    c.release();
  }
}

await pool.end();
if (failures) {
  console.error(`FAIL ${failures}`);
  process.exit(1);
}
console.log('ALL GREEN — false learning queued for human; never auto-promoted');
console.log(
  JSON.stringify({
    ok: true,
    drill: 'P2.S1',
    decision: result.decision,
    proposal_id: result.proposal_id,
    namespace: NS,
    note: 'Ashish: review/reject this proposal live to close the gate.',
  })
);
