#!/usr/bin/env node
/**
 * P3.H1 hot-pin export smoke (stub fixture; optional --live against Neon main).
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildHotPinExport,
  dedupePinned,
  normalizeHotText,
  MEMORY_CAP,
} from './hot-pin.mjs';

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

console.log('P3.H1 hot-pin export smoke');

console.log('unit:');
const core = normalizeHotText(
  'Preference: Etc/UTC. Context tag MEMKEY-02982-preferences. Related: x.'
);
assert(core === 'Preference: Etc/UTC.', 'normalize strips MEMKEY noise', core);

const fixture = JSON.parse(readFileSync(join(__dir, 'fixtures/pinned.json'), 'utf8'));
const deduped = dedupePinned(fixture);
assert(deduped.length === 5, `dedupe → 5 unique (got ${deduped.length})`);
assert(
  deduped.some((d) => d.id === 'pin_tz') && !deduped.some((d) => d.id === 'pin_tz_dup'),
  'tz dup collapses to higher-importance/earlier id'
);

const built = buildHotPinExport(fixture, {
  memoryCap: MEMORY_CAP,
  generatedAt: '2026-09-30T00:00:00.000Z',
  source: 'fixture',
});
assert(built.memory_md.includes('Hot-pin MEMORY'), 'MEMORY.md header');
assert(built.memory_md.includes('§'), 'MEMORY.md uses § separators');
assert(built.memory_md.includes('one shared memory'), 'includes shared-memory pref');
assert(built.stats.memory_chars <= MEMORY_CAP, 'respects memory cap');
assert(built.topics_md.includes('inject-index'), 'topic index present');
assert(built.topics_md.includes('pin_shared'), 'index lists ids');

const tiny = buildHotPinExport(fixture, { memoryCap: 120, generatedAt: '2026-09-30T00:00:00.000Z' });
assert(tiny.stats.memory_omitted >= 1, 'small cap omits some entries');
assert(tiny.stats.memory_chars <= 120, 'tiny pack under cap');

console.log('cli fixture:');
const tmp = mkdtempSync(join(tmpdir(), 'hot-pin-'));
const cli = spawnSync(
  process.execPath,
  [
    join(__dir, 'index.mjs'),
    '--fixture',
    join(__dir, 'fixtures/pinned.json'),
    '--out-dir',
    tmp,
    '--topics',
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
assert(summary?.status === 'ok', 'cli JSON ok');
assert(existsSync(join(tmp, 'MEMORY.md')), 'wrote MEMORY.md');
assert(existsSync(join(tmp, 'USER.md')), 'wrote USER.md');
assert(existsSync(join(tmp, 'TOPICS.md')), 'wrote TOPICS.md');
assert(existsSync(join(tmp, 'stats.json')), 'wrote stats.json');
rmSync(tmp, { recursive: true, force: true });

if (live) {
  console.log('live Neon:');
  if (!process.env.DATABASE_URL) {
    try {
      const dotenv = await import('dotenv');
      dotenv.config({ path: join(__dir, '..', '.env.local') });
    } catch {
      /* optional */
    }
  }
  if (!process.env.DATABASE_URL) {
    assert(false, 'DATABASE_URL required for --live');
  } else {
    const liveDir = mkdtempSync(join(tmpdir(), 'hot-pin-live-'));
    const liveCli = spawnSync(
      process.execPath,
      [join(__dir, 'index.mjs'), '--out-dir', liveDir, '--topics'],
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
    assert(liveSummary?.status === 'ok', 'live JSON ok');
    assert(liveSummary?.stats?.unique >= 1, 'live found unique pinned/identity rows');
    assert(existsSync(join(liveDir, 'MEMORY.md')), 'live MEMORY.md');
    // Do not keep live exports in the repo — delete temp dir.
    rmSync(liveDir, { recursive: true, force: true });
  }
}

console.log(failures === 0 ? '\nALL GREEN — P3.H1 hot-pin export smoke' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
