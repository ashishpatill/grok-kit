/**
 * P1.M6 import smoke — no Neon. Fixture JSONL with duplicates + contradiction.
 * Asserts classify/apply counts via stub adapter; also exercises CLI process.
 *
 * Exit 0 = ALL GREEN.
 */
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { contentHash, normalizeText, nearIdentical } from './hash.mjs';
import { parseJsonlText } from './parse-jsonl.mjs';
import { classifyBatch } from './ops.mjs';
import { applyOps } from './apply.mjs';
import { createStubImportAdapter } from './stub-adapter.mjs';
import { emptyIndex, buildIndexFromRows } from './pg-adapter.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));

let failures = 0;
function assert(cond, msg, detail) {
  if (cond) {
    console.log(`  ok  ${msg}`);
  } else {
    failures += 1;
    console.error(`  FAIL ${msg}${detail ? ' — ' + detail : ''}`);
  }
}

console.log('hash:');
const h1 = contentHash('Hello   World');
const h2 = contentHash('hello world');
assert(h1 === h2, 'whitespace+case normalize collide');
assert(h1.length === 64, 'sha256 hex length 64');
assert(nearIdentical('A  B', 'a b'), 'nearIdentical after normalize');
assert(normalizeText('  X\nY  ') === 'x y', 'normalizeText collapses ws');

console.log('parse:');
const sample = [
  JSON.stringify({
    id: 'bm-aaa',
    namespace: 'project-smoke',
    type: 'semantic',
    text: 'Alpha claim about widgets',
    importance: 5,
    content_hash: contentHash('Alpha claim about widgets'),
    provenance: { yaml_id: 'yaml-alpha', bot: 'tester' },
  }),
  '{not-json',
  JSON.stringify({
    id: 'bm-bbb',
    namespace: 'project-smoke',
    type: 'bogus',
    text: 'x',
    importance: 5,
    content_hash: 'x',
    provenance: {},
  }),
].join('\n');
const parsedBad = parseJsonlText(sample);
assert(parsedBad.candidates.length === 1, 'keeps valid line');
assert(parsedBad.errors.length === 2, 'collects parse + type errors');

console.log('classify + apply (stub):');
// Fixture covering:
//  1. fresh ADD
//  2. exact content_hash duplicate → NOOP
//  3. same yaml_id, material text change → CONTRADICTION
//  4. same namespace + near-identical text, different yaml_id → CONTRADICTION
//  5. provenance.replaces → UPDATE
//  6. same yaml_id, non-material (whitespace-only) → UPDATE
const textA = 'Widgets ship on Tuesday.';
const textAWs = 'Widgets   ship on Tuesday.';
const textANew = 'Widgets ship on Friday instead.';
const textNear = 'Widgets ship on Tuesday.'; // same normalized as textA
const hashA = contentHash(textA);
const hashANew = contentHash(textANew);

const fixtureLines = [
  {
    id: 'bm-add-1',
    namespace: 'project-smoke',
    type: 'semantic',
    text: textA,
    importance: 5,
    content_hash: hashA,
    provenance: { yaml_id: 'yaml-widgets', bot: 'tester' },
  },
  // duplicate hash → NOOP
  {
    id: 'bm-dup-hash',
    namespace: 'project-smoke',
    type: 'semantic',
    text: textA,
    importance: 5,
    content_hash: hashA,
    provenance: { yaml_id: 'yaml-other', bot: 'tester' },
  },
  // near-identical text, different yaml_id → CONTRADICTION
  {
    id: 'bm-near',
    namespace: 'project-smoke',
    type: 'semantic',
    text: textNear,
    importance: 5,
    content_hash: contentHash(textNear), // same hash as A → actually NOOP first!
    provenance: { yaml_id: 'yaml-near-twin', bot: 'tester' },
  },
];

// Wait - near twin has SAME hash as A because text is identical after normalize.
// That hits rule 1 (NOOP) before rule 2. Need a case where normalized text matches
// but content_hash in the file differs (e.g. precomputed with different scheme),
// OR slightly different punctuation that we treat as near-identical.
//
// Our nearIdentical is exact-on-normalized. So same normalized ⇒ same contentHash().
// Rule 2 only fires when hashes differ but normalized text matches — which can't
// happen if hash is always computed from normalizeText.
//
// Reality: JSONL may carry a legacy content_hash (spike used text.lower() without
// whitespace collapse). So: same logical text, different stored hash, different yaml_id.
const legacyHash = 'deadbeef' + '0'.repeat(56); // pretend legacy hash
const fixtureContradictionTwin = {
  id: 'bm-twin',
  namespace: 'project-smoke',
  type: 'semantic',
  text: textAWs, // normalizes to same as textA
  importance: 5,
  content_hash: legacyHash, // different from hashA
  provenance: { yaml_id: 'yaml-twin-different', bot: 'tester' },
};

const fixtureMaterial = {
  id: 'bm-material',
  namespace: 'project-smoke',
  type: 'semantic',
  text: textANew,
  importance: 6,
  content_hash: hashANew,
  provenance: { yaml_id: 'yaml-widgets', bot: 'tester' }, // same yaml as first
};

const fixtureReplaces = {
  id: 'bm-repl',
  namespace: 'project-smoke',
  type: 'episodic',
  text: 'Replaced learning via provenance.replaces',
  importance: 5,
  content_hash: contentHash('Replaced learning via provenance.replaces'),
  provenance: { yaml_id: 'yaml-repl', replaces: 'bm-add-1', bot: 'tester' },
};

const fixtureNonMaterial = {
  // After material contradiction on yaml-widgets, we seed a separate memory
  // then re-import whitespace-only change under a fresh yaml that we pre-seed.
  id: 'bm-ws-new',
  namespace: 'project-smoke',
  type: 'semantic',
  text: 'Stable fact.',
  importance: 5,
  content_hash: contentHash('Stable fact.'),
  provenance: { yaml_id: 'yaml-stable', bot: 'tester' },
};

const fixtureNonMaterialUpdate = {
  id: 'bm-ws-upd',
  namespace: 'project-smoke',
  type: 'semantic',
  text: 'Stable   fact.', // same normalized
  importance: 5,
  content_hash: contentHash('Stable   fact.'), // same hash → NOOP actually
  provenance: { yaml_id: 'yaml-stable', bot: 'tester' },
};

// For non-material UPDATE we need different hash but same normalized text under
// same yaml_id. Use a legacy hash to force the yaml_id path past hash NOOP.
const fixtureNonMaterialLegacy = {
  id: 'bm-ws-legacy',
  namespace: 'project-smoke',
  type: 'semantic',
  text: 'Stable   fact.',
  importance: 5,
  content_hash: 'cafebabe' + '0'.repeat(56),
  provenance: { yaml_id: 'yaml-stable', bot: 'tester' },
};

const allFixture = [
  ...fixtureLines,
  fixtureContradictionTwin,
  fixtureMaterial,
  fixtureNonMaterial,
  fixtureNonMaterialLegacy,
  fixtureReplaces,
];

const jsonl = allFixture.map((r) => JSON.stringify(r)).join('\n');
const { candidates, errors } = parseJsonlText(jsonl);
assert(errors.length === 0, 'fixture parses clean', JSON.stringify(errors));
assert(candidates.length === allFixture.length, `candidate count ${candidates.length}`);

const adapter = createStubImportAdapter();
const ops = classifyBatch(candidates, emptyIndex());

const byOp = { ADD: 0, UPDATE: 0, NOOP: 0, CONTRADICTION: 0 };
for (const o of ops) byOp[o.op] = (byOp[o.op] || 0) + 1;
console.log('  ops', JSON.stringify(byOp));
console.log(
  '  detail',
  ops.map((o) => `${o.op}:${o.reason}:${o.candidate.id}`).join(' | ')
);

// Expected walk-through:
// 1. bm-add-1 → ADD
// 2. bm-dup-hash → NOOP (hash)
// 3. bm-near → NOOP (same hash as add-1; rule 1 first)
// 4. bm-twin → CONTRADICTION (near_identical_text_different_yaml_id)
// 5. bm-material → CONTRADICTION (same_yaml_id_material_text_diff) — yaml-widgets still "owned" by add-1 in batch
// 6. bm-ws-new (fixtureNonMaterial) → ADD
// 7. bm-ws-legacy → UPDATE (same yaml-stable, non-material, different hash)
// 8. bm-repl → UPDATE (provenance.replaces bm-add-1 exists)
assert(byOp.ADD === 2, `ADD=2 (got ${byOp.ADD})`);
assert(byOp.NOOP === 2, `NOOP=2 (got ${byOp.NOOP})`);
assert(byOp.CONTRADICTION === 2, `CONTRADICTION=2 (got ${byOp.CONTRADICTION})`);
assert(byOp.UPDATE === 2, `UPDATE=2 (got ${byOp.UPDATE})`);

const summary = await applyOps(ops, adapter, { importBatch: 'smoke-m6' });
assert(summary.added === 2, `applied added=2 (${summary.added})`);
assert(summary.updated === 2, `applied updated=2 (${summary.updated})`);
assert(summary.noop === 2, `applied noop=2 (${summary.noop})`);
assert(summary.contradicted === 2, `applied contradicted=2 (${summary.contradicted})`);
assert(summary.review_ids.length === 2, `review_ids length 2 (${summary.review_ids.length})`);

const mems = adapter._dumpMemories();
const reviews = adapter._dumpReviews();
assert(
  mems.some((m) => m.id === 'bm-add-1' && m.superseded_by),
  'bm-add-1 superseded by replaces UPDATE'
);
assert(
  reviews.every((r) => r.kind === 'import_contradiction' && r.status === 'queued'),
  'reviews are import_contradiction/queued'
);

// Seeded-index path: content_hash already in "DB" → NOOP
console.log('seeded index NOOP:');
const seeded = createStubImportAdapter([
  {
    id: 'pre-1',
    namespace: 'project-smoke',
    type: 'semantic',
    text: 'Pre-seeded row',
    provenance: { content_hash: contentHash('Pre-seeded row'), yaml_id: 'yaml-pre' },
  },
]);
const seedRows = seeded._dumpMemories().map((m) => ({
  id: m.id,
  text: m.text,
  namespace: m.namespace,
  content_hash: m.provenance.content_hash,
  provenance: m.provenance,
}));
const seedOps = classifyBatch(
  [
    {
      id: 'pre-dup',
      namespace: 'project-smoke',
      type: 'semantic',
      text: 'Pre-seeded row',
      importance: 5,
      content_hash: contentHash('Pre-seeded row'),
      provenance: { yaml_id: 'yaml-pre-2' },
      line: 1,
    },
  ],
  buildIndexFromRows(seedRows)
);
assert(seedOps[0].op === 'NOOP', 'seeded hash → NOOP');

// dry-run does not write
console.log('dry-run:');
const dryAdapter = createStubImportAdapter();
const dryOps = classifyBatch(
  [
    {
      id: 'dry-1',
      namespace: 'ns',
      type: 'semantic',
      text: 'dry',
      importance: 5,
      content_hash: contentHash('dry'),
      provenance: {},
      line: 1,
    },
  ],
  emptyIndex()
);
const drySum = await applyOps(dryOps, dryAdapter, { dryRun: true, importBatch: 'dry' });
assert(drySum.added === 1 && drySum.dry_run === true, 'dry-run counts ADD');
assert(dryAdapter._dumpMemories().length === 0, 'dry-run writes nothing');
assert(drySum.review_ids.length === 0, 'dry-run review_ids empty');

// CLI process
console.log('cli process:');
const tmp = mkdtempSync(join(tmpdir(), 'p1m6-import-'));
const fixturePath = join(tmp, 'fixture.jsonl');
writeFileSync(
  fixturePath,
  [
    JSON.stringify({
      id: 'cli-1',
      namespace: 'cli-ns',
      type: 'semantic',
      text: 'CLI import path works',
      importance: 5,
      content_hash: contentHash('CLI import path works'),
      provenance: { yaml_id: 'cli-yaml' },
    }),
    JSON.stringify({
      id: 'cli-2',
      namespace: 'cli-ns',
      type: 'semantic',
      text: 'CLI import path works',
      importance: 5,
      content_hash: contentHash('CLI import path works'),
      provenance: { yaml_id: 'cli-yaml-dup' },
    }),
  ].join('\n')
);

function runCli(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [join(__dir, 'index.mjs'), ...args], {
      env: { ...process.env, MEMORY_BACKEND: 'stub' },
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
assert(help.code === 0 && /--file/.test(help.out), '--help lists --file');

const cliRun = await runCli([
  '--file',
  fixturePath,
  '--import-batch',
  'cli-smoke',
]);
let cliJson = null;
try {
  cliJson = JSON.parse(cliRun.out);
} catch {
  /* */
}
assert(
  cliRun.code === 0 && cliJson?.status === 'ok' && cliJson.added === 1 && cliJson.noop === 1,
  'CLI stub import added=1 noop=1',
  cliRun.err || cliRun.out.slice(0, 200)
);

const dryCli = await runCli(['--file', fixturePath, '--dry-run']);
let dryJson = null;
try {
  dryJson = JSON.parse(dryCli.out);
} catch {
  /* */
}
assert(
  dryCli.code === 0 && dryJson?.dry_run === true && dryJson.added === 1,
  'CLI --dry-run ok',
  dryCli.err || dryCli.out.slice(0, 120)
);

rmSync(tmp, { recursive: true, force: true });

console.log(failures === 0 ? '\nALL GREEN' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
