#!/usr/bin/env node
/**
 * P3.M1 mirror_export dry-run smoke (fixture; optional --live read-only).
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildMirrorExport,
  sanitizeCraftText,
  splitCraftFields,
  rowToCraftEntry,
} from './mirror.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const live = process.argv.includes('--live');
let failures = 0;
function assert(cond, label, extra = '') {
  if (cond) console.log(`  PASS ${label}`);
  else {
    failures += 1;
    console.log(`  FAIL ${label} ${extra}`);
  }
}

console.log('P3.M1 mirror_export dry-run smoke');

console.log('unit:');
assert(sanitizeCraftText('safe text')?.text === 'safe text', 'sanitize ok');
assert(sanitizeCraftText('DATABASE_URL=postgres://x') === null, 'skip DATABASE_URL');
assert(sanitizeCraftText('WAKE_TOKEN=abc') === null, 'skip WAKE_TOKEN');

const fields = splitCraftFields(
  'Happened: shipped. Wrong: claimed X1. Worked: smoke green. Next: deepen ExpeL.'
);
assert(fields.happened.includes('shipped'), 'happened');
assert(fields.wrong.includes('X1'), 'wrong');
assert(fields.worked.includes('smoke'), 'worked');
assert(fields.next.includes('ExpeL'), 'next');

const fixture = JSON.parse(readFileSync(join(__dir, 'fixtures/craft-sample.json'), 'utf8'));
const built = buildMirrorExport(fixture, {
  generatedAt: '2026-09-30T00:00:00.000Z',
  source: 'fixture',
  dryRun: true,
});
assert(built.stats.exported === 2, `exported 2 (got ${built.stats.exported})`);
assert(built.stats.skipped_secret === 1, 'skipped secret row');
assert(built.stats.dry_run === true, 'dry_run true');
assert(built.stats.push === false, 'push false');
assert(built.yaml.includes('happened:'), 'yaml has happened');
assert(built.yaml.includes('wrong:'), 'yaml has wrong');
assert(built.jsonl.split('\n').filter(Boolean).length === 2, 'jsonl 2 lines');
assert(!built.jsonl.includes('postgres://'), 'jsonl has no secret');
assert(!built.yaml.includes('postgres://'), 'yaml has no secret');

const secretEntry = rowToCraftEntry(fixture[2]);
assert(secretEntry === null, 'secret row → null entry');

console.log('cli fixture:');
const tmp = mkdtempSync(join(tmpdir(), 'mirror-'));
const cli = spawnSync(
  process.execPath,
  [
    join(__dir, 'mirror-cli.mjs'),
    '--fixture',
    join(__dir, 'fixtures/craft-sample.json'),
    '--out-dir',
    tmp,
  ],
  { encoding: 'utf8' }
);
assert(cli.status === 0, 'cli exit 0', cli.stderr || cli.stdout.slice(0, 200));
let summary = null;
try {
  summary = JSON.parse(cli.stdout);
} catch {
  /* */
}
assert(summary?.status === 'ok' && summary?.dry_run === true, 'cli JSON ok dry_run');
assert(existsSync(join(tmp, 'craft.jsonl')), 'wrote craft.jsonl');
assert(existsSync(join(tmp, 'craft.yaml')), 'wrote craft.yaml');
assert(existsSync(join(tmp, 'stats.json')), 'wrote stats.json');
rmSync(tmp, { recursive: true, force: true });

console.log('cli --push refused:');
const push = spawnSync(process.execPath, [join(__dir, 'mirror-cli.mjs'), '--push'], {
  encoding: 'utf8',
});
assert(push.status === 2, 'push exit 2');
assert(/refused|dry-run/i.test(push.stderr || ''), 'push refusal message');

if (live) {
  console.log('live Neon (read-only):');
  if (!process.env.DATABASE_URL) {
    try {
      const dotenv = await import('dotenv');
      dotenv.config({ path: join(__dir, '..', '.env.local') });
    } catch {
      /* */
    }
  }
  if (!process.env.DATABASE_URL) {
    assert(false, 'DATABASE_URL required for --live');
  } else {
    const liveDir = mkdtempSync(join(tmpdir(), 'mirror-live-'));
    const liveCli = spawnSync(
      process.execPath,
      [join(__dir, 'mirror-cli.mjs'), '--out-dir', liveDir, '--limit', '20'],
      {
        encoding: 'utf8',
        env: { ...process.env, NODE_OPTIONS: '--no-network-family-autoselection' },
      }
    );
    assert(liveCli.status === 0, 'live cli exit 0', liveCli.stderr || liveCli.stdout.slice(0, 240));
    let liveSummary = null;
    try {
      liveSummary = JSON.parse(liveCli.stdout);
    } catch {
      /* */
    }
    assert(liveSummary?.dry_run === true, 'live dry_run');
    assert(liveSummary?.stats?.exported >= 1, 'live exported >=1');
    assert(existsSync(join(liveDir, 'craft.yaml')), 'live craft.yaml');
    rmSync(liveDir, { recursive: true, force: true });
  }
}

console.log(failures === 0 ? '\nALL GREEN — P3.M1 mirror_export dry-run smoke' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
