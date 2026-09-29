#!/usr/bin/env node
/**
 * Hot-pin export CLI (P3.H1).
 *
 * Usage:
 *   DATABASE_URL=… node export/index.mjs [--out-dir DIR] [--topics] [--memory-cap N]
 *   MEMORY_BACKEND=stub node export/index.mjs --fixture export/fixtures/pinned.json --out-dir /tmp/hot
 *
 * Writes MEMORY.md (+ USER.md, optional TOPICS.md). Export-only; no Neon writes.
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildHotPinExport, HOT_PIN_SQL, MEMORY_CAP, USER_CAP } from './hot-pin.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));

const HELP = `memory-export-hot-pin — Neon pinned/identity → MEMORY.md (P3.H1)

Usage:
  node export/index.mjs [--out-dir <dir>] [--topics] [--memory-cap <n>] [--user-cap <n>]
  node export/index.mjs --fixture <json> --out-dir <dir>   # no Neon
  node export/index.mjs --help

Env:
  DATABASE_URL     Neon/Postgres (required unless --fixture / MEMORY_BACKEND=stub)
  MEMORY_BACKEND   stub → requires --fixture

Outputs (under --out-dir, default memory/export/out):
  MEMORY.md   human-editable hot pin (≤ memory-cap chars, §-separated)
  USER.md     preferences subset (≤ user-cap)
  TOPICS.md   inject-index (optional; --topics)
  stats.json  counts + memory ids
`;

function parseArgs(argv) {
  const flags = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') flags.help = true;
    else if (a === '--topics') flags.topics = true;
    else if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next == null || next.startsWith('--')) flags[key] = true;
      else {
        flags[key] = next;
        i += 1;
      }
    }
  }
  return flags;
}

async function loadRows(flags) {
  if (flags.fixture) {
    const path = resolve(flags.fixture);
    if (!existsSync(path)) throw new Error(`fixture not found: ${path}`);
    const raw = JSON.parse(readFileSync(path, 'utf8'));
    if (!Array.isArray(raw)) throw new Error('fixture must be a JSON array of memory rows');
    return { rows: raw, source: `fixture:${path}` };
  }

  const backend = (process.env.MEMORY_BACKEND || 'pg').toLowerCase();
  if (backend === 'stub') {
    throw new Error('MEMORY_BACKEND=stub requires --fixture <json>');
  }
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL missing (or pass --fixture)');
  }

  const dotenv = await import('dotenv');
  dotenv.config({ path: join(__dir, '..', '.env.local') });
  const pg = await import('pg');
  const client = new pg.default.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === 'disable' ? false : { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    const r = await client.query(HOT_PIN_SQL);
    return { rows: r.rows, source: 'neon-pinned+identity' };
  } finally {
    await client.end();
  }
}

async function main() {
  const flags = parseArgs(process.argv);
  if (flags.help) {
    process.stdout.write(HELP);
    process.exit(0);
  }

  const outDir = resolve(flags['out-dir'] || join(__dir, 'out'));
  const memoryCap = flags['memory-cap'] != null ? Number(flags['memory-cap']) : MEMORY_CAP;
  const userCap = flags['user-cap'] != null ? Number(flags['user-cap']) : USER_CAP;
  if (!Number.isFinite(memoryCap) || memoryCap < 200) {
    console.error('[export] --memory-cap must be >= 200');
    process.exit(1);
  }

  const { rows, source } = await loadRows(flags);
  const built = buildHotPinExport(rows, {
    memoryCap,
    userCap,
    source,
    generatedAt: new Date().toISOString(),
  });

  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'MEMORY.md'), built.memory_md);
  writeFileSync(join(outDir, 'USER.md'), built.user_md);
  if (flags.topics) {
    writeFileSync(join(outDir, 'TOPICS.md'), built.topics_md);
  }
  writeFileSync(join(outDir, 'stats.json'), JSON.stringify(built.stats, null, 2) + '\n');

  const summary = {
    status: 'ok',
    out_dir: outDir,
    source,
    files: ['MEMORY.md', 'USER.md', ...(flags.topics ? ['TOPICS.md'] : []), 'stats.json'],
    stats: built.stats,
  };
  process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
}

main().catch((e) => {
  console.error('[export] fatal', e.message || e);
  process.exit(1);
});
