/**
 * P2.K3 smoke: verify-aci / rubric-verify outcomes → episodic propose().
 * Usage: DATABASE_URL=… node skills/verify-aci/scripts/episodic-smoke.mjs
 */
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runVerifyAci } from './verify-aci.mjs';
import { runRubricVerify } from '../../rubric-verify/scripts/rubric-verify.mjs';
import pg from '../../../memory/node_modules/pg/lib/index.js';

const DATABASE_URL = process.env.DATABASE_URL || process.env.BOT_MEMORY_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL missing');
  process.exit(1);
}

const NS = 'errors-resolved-p2k3-smoke';
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

const dir = await mkdtemp(path.join(tmpdir(), 'p2k3-'));
await mkdir(path.join(dir, '.cursor', 'verify'), { recursive: true });
await writeFile(
  path.join(dir, '.cursor', 'verify', 'verify.sh'),
  '#!/bin/bash\ncase "$1" in doctor|launch|drive) exit 0;; *) exit 1;; esac\n',
  { mode: 0o755 }
);
await writeFile(
  path.join(dir, '.cursor', 'verify', 'rubric.json'),
  JSON.stringify({
    schemaVersion: 1,
    task: 'p2k3-smoke',
    items: [
      {
        id: 'exists',
        kind: 'path-exists',
        path: '.cursor/verify/verify.sh',
        severity: 'must',
        claim: 'aci present',
      },
    ],
  })
);

// stub propose so this smoke doesn't depend on embedding latency for unit path;
// then also do one live propose via DATABASE_URL through verify's emit.
let out = '';
const code = await runVerifyAci(
  ['--root', dir, '--phase', 'doctor', '--project', 'p2k3-smoke'],
  {
    stdout: (t) => {
      out += t;
    },
    databaseUrl: DATABASE_URL,
  }
);
const v = JSON.parse(out);
console.log('verify-aci memory:', JSON.stringify(v.memory));
assert(code === 0, 'verify-aci exit 0');
assert(v.ok === true, 'verify ok');
assert(v.memory?.decision === 'auto_approved', 'verify episodic auto_approved', JSON.stringify(v.memory));

out = '';
const code2 = await runRubricVerify(
  ['--root', dir, '--project', 'p2k3-smoke', '--dry-run'],
  {
    stdout: (t) => {
      out += t;
    },
    databaseUrl: DATABASE_URL,
  }
);
const v2 = JSON.parse(out);
console.log('rubric-verify memory:', JSON.stringify(v2.memory));
assert(code2 === 0, 'rubric-verify exit 0');
assert(v2.ok === true, 'rubric ok');
assert(v2.memory?.decision === 'auto_approved', 'rubric episodic auto_approved', JSON.stringify(v2.memory));

{
  const c = await pool.connect();
  try {
    const { rows } = await c.query(
      `SELECT id, type, text, provenance->>'origin' AS origin FROM memories WHERE namespace = $1 ORDER BY created_at`,
      [NS]
    );
    assert(rows.length >= 2, '>=2 episodic rows', `n=${rows.length}`);
    assert(rows.every((r) => r.type === 'episodic'), 'all episodic');
    const origins = new Set(rows.map((r) => r.origin));
    assert(origins.has('verify-aci-outcome'), 'has verify-aci origin');
    assert(origins.has('rubric-verify-outcome'), 'has rubric-verify origin');
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
