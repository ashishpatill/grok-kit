/**
 * P2.K1 smoke: memory-sync writes via MCP propose() (human-gated, IDL §12).
 *
 * Drives memory-mcp over stdio and asserts the write-gate routing that the
 * memory-sync skill relies on:
 *   - semantic/global without grounding -> queued_for_review (+ proposals row)
 *   - episodic                        -> auto_approved (+ memories row)
 *   - procedural                      -> queued_for_review (human-always)
 *   - semantic/global with >=2 grounding_ids -> auto_approved
 *
 * Usage: DATABASE_URL=postgres://... node skills/memory-sync/scripts/propose-smoke.mjs
 */
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from '../../../memory/node_modules/pg/lib/index.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dir, '..', '..', '..');
const NS = 'project-p2k1-smoke';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error('DATABASE_URL missing'); process.exit(1); }

const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });
let failures = 0;
function assert(cond, label, extra = '') {
  if (cond) console.log(`  PASS ${label}`);
  else { failures++; console.log(`  FAIL ${label} ${extra}`); }
}

// ---- 0. isolate -------------------------------------------------------------
{
  const c = await pool.connect();
  try {
    await c.query(`DELETE FROM memories WHERE namespace = $1`, [NS]);
    await c.query(`DELETE FROM proposals WHERE namespace = $1`, [NS]);
  } finally { c.release(); }
}

// ---- 1. spawn MCP server ----------------------------------------------------
console.log('spawning memory-mcp…');
const srv = spawn('node', [join(REPO, 'memory', 'mcp', 'index.mjs')], {
  env: { ...process.env },
  stdio: ['pipe', 'pipe', 'inherit'],
});
let reqId = 0;
const pending = new Map();
let buf = '';
srv.stdout.on('data', (d) => {
  buf += d.toString();
  let idx;
  while ((idx = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, idx).trim(); buf = buf.slice(idx + 1);
    if (!line) continue;
    let msg; try { msg = JSON.parse(line); } catch { continue; }
    if (msg.id != null && pending.has(msg.id)) {
      const { resolve } = pending.get(msg.id); pending.delete(msg.id); resolve(msg);
    }
  }
});
function rpc(method, params) {
  const id = ++reqId;
  return new Promise((resolve) => {
    pending.set(id, { resolve });
    srv.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
}
async function callTool(name, args) {
  const res = await rpc('tools/call', { name, arguments: args });
  if (res.error) throw new Error(`tools/call ${name}: ${JSON.stringify(res.error)}`);
  const text = res.result.content?.[0]?.text ?? '';
  return JSON.parse(text);
}
await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'p2k1-smoke', version: '1' } });
srv.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }) + '\n');

// ---- 2. semantic/global, no grounding -> queued ------------------------------
console.log('propose (semantic, no grounding):');
const q1 = await callTool('propose', {
  namespace: NS,
  text: 'P2.K1 smoke: memory-sync routes ungrounded semantic learnings to review.',
  metadata: { type: 'semantic', scope: 'global', author: 'memory-sync', origin: 'memory-sync' },
});
assert(q1.status === 'ok' && q1.decision === 'queued_for_review', 'ungrounded semantic queued', JSON.stringify(q1).slice(0, 160));
assert(q1.reason === 'low-evidence', 'reason low-evidence', q1.reason);
{
  const c = await pool.connect();
  try {
    const r = await c.query(`SELECT id, route_reason FROM proposals WHERE id = $1`, [q1.proposal_id]);
    assert(r.rowCount === 1 && r.rows[0].route_reason === 'low-evidence', 'proposal row in proposals table');
  } finally { c.release(); }
}

// ---- 3. episodic -> auto-approved --------------------------------------------
console.log('propose (episodic):');
const q2 = await callTool('propose', {
  namespace: NS,
  text: 'P2.K1 smoke: session closed after P2.K1 smoke test.',
  metadata: { type: 'episodic', scope: 'global', author: 'memory-sync', origin: 'memory-sync' },
});
assert(q2.status === 'ok' && q2.decision === 'auto_approved', 'episodic auto-approved', JSON.stringify(q2).slice(0, 160));
{
  const c = await pool.connect();
  try {
    const r = await c.query(`SELECT id FROM memories WHERE id = $1`, [q2.id]);
    assert(r.rowCount === 1, 'episodic row in memories table');
  } finally { c.release(); }
}

// ---- 4. procedural -> queued (human-always) -----------------------------------
console.log('propose (procedural):');
const q3 = await callTool('propose', {
  namespace: NS,
  text: 'P2.K1 smoke: always run the smoke test before opening a PR.',
  metadata: { type: 'procedural', scope: 'global', author: 'memory-sync', origin: 'memory-sync' },
});
assert(q3.status === 'ok' && q3.decision === 'queued_for_review', 'procedural queued', JSON.stringify(q3).slice(0, 160));
assert(q3.reason === 'procedural-human-always', 'reason procedural-human-always', q3.reason);

// ---- 5. semantic/global with grounding -> auto-approved -----------------------
console.log('propose (semantic, grounded):');
const q4 = await callTool('propose', {
  namespace: NS,
  text: 'P2.K1 smoke: grounded semantic learnings auto-approve per IDL §12.',
  metadata: {
    type: 'semantic', scope: 'global', author: 'memory-sync', origin: 'memory-sync',
    grounding_ids: ['00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002'],
  },
});
assert(q4.status === 'ok' && q4.decision === 'auto_approved', 'grounded semantic auto-approved', JSON.stringify(q4).slice(0, 160));

// ---- 6. cleanup ----------------------------------------------------------------
srv.kill();
{
  const c = await pool.connect();
  try {
    await c.query(`DELETE FROM memories WHERE namespace = $1`, [NS]);
    await c.query(`DELETE FROM proposals WHERE namespace = $1`, [NS]);
  } finally { c.release(); }
}
await pool.end();

console.log(failures === 0 ? 'ALL GREEN' : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
