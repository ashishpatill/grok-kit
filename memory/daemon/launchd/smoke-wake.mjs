/**
 * X2 smoke: start daemon against Neon main, POST /wake, assert drain cycle.
 * Usage (from repo root):
 *   NODE_OPTIONS=--no-network-family-autoselection \
 *   DATABASE_URL=… WAKE_TOKEN=smoke-x2 PORT=8789 \
 *   node memory/daemon/launchd/smoke-wake.mjs
 */
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';

const __dir = dirname(fileURLToPath(import.meta.url));
const MEMORY_ROOT = join(__dir, '..', '..');
const require = createRequire(join(MEMORY_ROOT, 'package.json'));
const dotenv = require('dotenv');
dotenv.config({ path: join(MEMORY_ROOT, '.env.local') });

const DATABASE_URL = process.env.DATABASE_URL;
const WAKE_TOKEN = process.env.WAKE_TOKEN || 'x2-smoke-token';
const PORT = Number(process.env.PORT || 8789);

if (!DATABASE_URL) {
  console.error('DATABASE_URL missing');
  process.exit(1);
}

mkdirSync(join(__dir, 'out'), { recursive: true });
const outPath = join(__dir, 'out', 'x2-wake-smoke.json');

const child = spawn(
  process.execPath,
  [join(MEMORY_ROOT, 'daemon', 'index.mjs')],
  {
    cwd: MEMORY_ROOT,
    env: {
      ...process.env,
      DATABASE_URL,
      WAKE_TOKEN,
      PORT: String(PORT),
      DRAIN_BATCH: '2',
      RECONCILE_LIMIT: '5',
      NODE_OPTIONS: process.env.NODE_OPTIONS || '--no-network-family-autoselection',
      NODE_PATH: join(MEMORY_ROOT, 'node_modules'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  }
);

let stderr = '';
child.stderr.on('data', (d) => {
  stderr += d.toString();
});
child.stdout.on('data', (d) => {
  stderr += d.toString();
});

let failures = 0;
function assert(cond, label, extra = '') {
  if (cond) console.log(`  PASS ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label} ${extra}`);
  }
}

try {
  // wait until listening
  let ready = false;
  for (let i = 0; i < 40; i++) {
    await sleep(250);
    if (/listening http:\/\/127\.0\.0\.1:/.test(stderr)) {
      ready = true;
      break;
    }
    if (child.exitCode != null) break;
  }
  assert(ready, 'daemon listening', stderr.slice(-400));

  const t0 = Date.now();
  const res = await fetch(`http://127.0.0.1:${PORT}/wake`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${WAKE_TOKEN}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ source: 'x2-smoke-wake' }),
  });
  const body = await res.json().catch(() => ({}));
  const ms = Date.now() - t0;
  console.log('wake response:', JSON.stringify(body));
  assert(res.status === 200, `HTTP 200 (got ${res.status})`);
  assert(body.ok === true, 'body.ok', JSON.stringify(body));
  assert(typeof body.drained === 'number', 'body.drained number');
  assert(typeof body.reconcile_enqueued === 'number', 'body.reconcile_enqueued number');
  assert(typeof body.cold_start_ms === 'number', 'body.cold_start_ms number');
  assert(ms < 60_000, `wake completed under 60s (${ms}ms)`);

  const evidence = {
    ok: failures === 0,
    host: 'mac-launchd-smoke',
    port: PORT,
    ms,
    body,
    when: new Date().toISOString(),
    note: 'Localhost wake/drain against Neon main. Tailscale serve NOT claimed (tailscale not on PATH).',
  };
  writeFileSync(outPath, JSON.stringify(evidence, null, 2) + '\n');
  console.log('wrote', outPath);
} finally {
  child.kill('SIGTERM');
  await sleep(500);
  if (child.exitCode == null) child.kill('SIGKILL');
}

if (failures) {
  console.error(`FAIL ${failures}`);
  process.exit(1);
}
console.log('ALL GREEN');
