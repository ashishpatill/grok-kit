/**
 * P1.M5 smoke test — drives the CLI twin against the in-memory stub.
 * No Neon / DATABASE_URL required.
 *
 * Run: node cli/smoke.mjs
 *   or: npm run cli:smoke
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { store, recall, listNamespaces } from './core.mjs';
import { createStubAdapter } from './stub.mjs';
import { assertContractShape } from '../lib/cold-start-contract.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
let failures = 0;
function assert(cond, label, extra = '') {
  if (cond) console.log(`  PASS ${label}`);
  else {
    failures += 1;
    console.log(`  FAIL ${label} ${extra}`);
  }
}

console.log('P1.M5 CLI twin smoke (in-memory stub)');

// ---- 1. core + stub directly ------------------------------------------------
console.log('core+stub:');
const adapter = createStubAdapter();
const st = await store(adapter, 'project-p1m5', 'CLI twin smoke: hybrid recall uses RRF k=60 fusion.', {
  type: 'semantic',
  author: 'p1m5-smoke',
});
assert(
  st.status === 'ok' && st.id && st.index_status === 'staged' && st.approval === 'live' && st.embedding === null,
  'store envelope ok',
  JSON.stringify(st).slice(0, 160)
);

const rc = await recall(adapter, 'project-p1m5', 'hybrid recall RRF fusion', 5);
assert(
  rc.status === 'ok' && rc.count >= 1 && rc.results[0].id === st.id,
  'recall finds stored row',
  `got ${rc.results[0]?.id}`
);
assert(rc.hybrid === false && rc.legs.keyword >= 1, 'stub recall keyword-only');

const rcCold = await recall(adapter, 'no-such-ns', 'anything', 5);
assert(rcCold.status === 'cold_start', 'cold_start on empty namespace');
assert(rc.contract && assertContractShape(rc.contract) === null, 'recall contract shape', assertContractShape(rc.contract));
assert(rc.contract.source === 'stub' && rc.contract.daemon === 'unknown', 'stub contract source/daemon');
assert(rcCold.contract.index === 'cold' && rcCold.contract.replica_lag === null, 'cold_start index=cold lag=null');
assert(typeof rc.contract.last_seq === 'number', 'stub last_seq watermark');


await store(adapter, 'project-p1m5', 'unrelated filler about weather patterns in monsoon season.', {
  type: 'episodic',
  author: 'p1m5-smoke',
});
const rcThin = await recall(adapter, 'project-p1m5', 'zzzznotatoken', 5);
assert(rcThin.status === 'thin', 'thin when ns has rows but no match');

const ln = await listNamespaces(adapter);
assert(
  ln.status === 'ok' && ln.namespaces.some((n) => n.namespace === 'project-p1m5' && n.n >= 2),
  'list_namespaces includes test ns',
  JSON.stringify(ln)
);

const bad = await store(adapter, 'x', 'y', { type: 'bogus' });
assert(bad.status === 'error' && bad.error === 'VALIDATION', 'store rejects bad type');

// ---- 2. CLI process with MEMORY_BACKEND=stub + shared stub file -------------
console.log('cli process:');
const tmp = mkdtempSync(join(tmpdir(), 'p1m5-cli-'));
const stubPath = join(tmp, 'stub.json');

function runCli(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [join(__dir, 'index.mjs'), ...args], {
      env: {
        ...process.env,
        MEMORY_BACKEND: 'stub',
        MEMORY_STUB_PATH: stubPath,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => {
      out += d;
    });
    child.stderr.on('data', (d) => {
      err += d;
    });
    child.on('close', (code) => resolve({ code, out, err }));
  });
}

const help = await runCli(['--help']);
assert(
  help.code === 0 && /store/.test(help.out) && /recall/.test(help.out) && /list_namespaces/.test(help.out),
  '--help lists commands'
);

const cliStore = await runCli([
  'store',
  '--namespace',
  'cli-smoke-ns',
  '--text',
  'memory-cli process store path works for P1.M5',
  '--metadata',
  JSON.stringify({ type: 'semantic', author: 'p1m5-cli' }),
]);
let cliStoreJson = null;
try {
  cliStoreJson = JSON.parse(cliStore.out);
} catch {
  /* */
}
assert(
  cliStore.code === 0 && cliStoreJson?.status === 'ok' && cliStoreJson?.id,
  'CLI store prints ok envelope',
  cliStore.err || cliStore.out.slice(0, 120)
);
const storedId = cliStoreJson?.id;

const cliRecall = await runCli([
  'recall',
  '--namespace',
  'cli-smoke-ns',
  '--query',
  'memory-cli process store P1.M5',
  '--k',
  '5',
]);
let cliRecallJson = null;
try {
  cliRecallJson = JSON.parse(cliRecall.out);
} catch {
  /* */
}
assert(
  cliRecall.code === 0 &&
    cliRecallJson?.status === 'ok' &&
    cliRecallJson?.results?.some((r) => r.id === storedId),
  'CLI process round-trip recall hits stored id',
  JSON.stringify(cliRecallJson).slice(0, 160)
);

const cliList = await runCli(['list_namespaces']);
let cliListJson = null;
try {
  cliListJson = JSON.parse(cliList.out);
} catch {
  /* */
}
assert(
  cliList.code === 0 &&
    cliListJson?.status === 'ok' &&
    cliListJson.namespaces.some((n) => n.namespace === 'cli-smoke-ns'),
  'CLI list_namespaces includes smoke ns'
);

const cliBad = await runCli([
  'store',
  '--namespace',
  'x',
  '--text',
  'y',
  '--metadata',
  '{"type":"bogus"}',
]);
let cliBadJson = null;
try {
  cliBadJson = JSON.parse(cliBad.out);
} catch {
  /* */
}
assert(cliBad.code === 1 && cliBadJson?.error === 'VALIDATION', 'CLI store validation exit 1');

rmSync(tmp, { recursive: true, force: true });

console.log(failures === 0 ? '\nALL GREEN' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
