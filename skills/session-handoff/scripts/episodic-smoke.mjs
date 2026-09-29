/**
 * P2.K2 smoke: session-handoff close → episodic propose().
 * Usage: DATABASE_URL=… node skills/session-handoff/scripts/episodic-smoke.mjs
 */
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runSessionHandoff, skeleton } from './session-handoff.mjs';
import pg from '../../../memory/node_modules/pg/lib/index.js';

const DATABASE_URL = process.env.DATABASE_URL || process.env.BOT_MEMORY_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL missing');
  process.exit(1);
}

const NS = 'handoff-p2k2-smoke';
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
  } finally {
    c.release();
  }
}

const dir = await mkdtemp(path.join(tmpdir(), 'p2k2-'));
await mkdir(path.join(dir, '.cursor'), { recursive: true });
const dest = path.join(dir, '.cursor', 'handoff.md');
await writeFile(
  dest,
  skeleton('p2k2-smoke').replace('(describe)', 'Prove session-handoff emits episodic on close.')
);

let out = '';
const code = await runSessionHandoff(
  ['close', '--root', dir, '--project', 'p2k2-smoke'],
  {
    stdout: (t) => {
      out += t;
    },
    databaseUrl: DATABASE_URL,
  }
);
const verdict = JSON.parse(out);
console.log('close:', JSON.stringify(verdict.memory));
assert(code === 0, 'close exit 0');
assert(verdict.ok === true, 'verdict.ok');
assert(verdict.namespace === NS, 'namespace handoff-p2k2-smoke');
assert(verdict.memory?.decision === 'auto_approved', 'auto_approved', JSON.stringify(verdict.memory));
assert(Boolean(verdict.memory?.id), 'memory id returned');

{
  const c = await pool.connect();
  try {
    const { rows } = await c.query(
      `SELECT id, type, scope, text FROM memories WHERE namespace = $1`,
      [NS]
    );
    assert(rows.length === 1, 'one episodic row', `n=${rows.length}`);
    assert(rows[0]?.type === 'episodic', 'type episodic');
    assert(String(rows[0]?.text || '').includes('Prove session-handoff'), 'text from handoff');
    await c.query(`DELETE FROM memories WHERE namespace = $1`, [NS]);
  } finally {
    c.release();
  }
}

await pool.end();
if (failures) {
  console.error(`FAIL ${failures}`);
  process.exit(1);
}
console.log('ALL GREEN');
