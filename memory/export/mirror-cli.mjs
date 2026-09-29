#!/usr/bin/env node
/**
 * mirror_export dry-run CLI (P3.M1).
 *
 *   node export/mirror-cli.mjs --fixture export/fixtures/craft-sample.json --out-dir /tmp/mirror
 *   DATABASE_URL=… node export/mirror-cli.mjs --out-dir ./export/out/mirror --limit 50
 *
 * Always dry-run unless --push is passed — and --push is intentionally rejected
 * (no auto-push secrets to private bot-memory from this tool).
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildMirrorExport, MIRROR_SQL } from './mirror.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));

const HELP = `memory-export-mirror — Neon → craft-log YAML/JSONL (dry-run default)

Usage:
  node export/mirror-cli.mjs --fixture <json> --out-dir <dir>
  node export/mirror-cli.mjs [--out-dir <dir>] [--limit N]   # needs DATABASE_URL
  node export/mirror-cli.mjs --help

Flags:
  --dry-run     default (local files only; no git push)
  --push        REJECTED — refuse to push; use a human-reviewed PR instead
  --limit N     max rows from Neon (default 100)

Outputs under --out-dir:
  craft.jsonl   one craft entry per line
  craft.yaml    happened/wrong/worked/next view
  stats.json    counts + dry_run:true
`;

function parseArgs(argv) {
  const flags = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') flags.help = true;
    else if (a === '--dry-run') flags['dry-run'] = true;
    else if (a === '--push') flags.push = true;
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
    if (!Array.isArray(raw)) throw new Error('fixture must be a JSON array');
    return { rows: raw, source: `fixture:${path}` };
  }
  if (!process.env.DATABASE_URL) {
    try {
      const dotenv = await import('dotenv');
      dotenv.config({ path: join(__dir, '..', '.env.local') });
    } catch {
      /* optional */
    }
  }
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL missing (or pass --fixture)');
  }
  const limit = flags.limit != null ? Number(flags.limit) : 100;
  if (!Number.isFinite(limit) || limit < 1 || limit > 5000) {
    throw new Error('--limit must be 1..5000');
  }
  const pg = await import('pg');
  const client = new pg.default.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === 'disable' ? false : { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    const r = await client.query(MIRROR_SQL, [limit]);
    return { rows: r.rows, source: 'neon-live-readonly' };
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
  if (flags.push) {
    console.error(
      '[mirror_export] --push refused: dry-run only. Review craft.yaml/jsonl then human PR to private bot-memory. No secrets / tokens in exports.'
    );
    process.exit(2);
  }

  const outDir = resolve(flags['out-dir'] || join(__dir, 'out', 'mirror'));
  const { rows, source } = await loadRows(flags);
  const built = buildMirrorExport(rows, {
    source,
    dryRun: true,
    generatedAt: new Date().toISOString(),
  });

  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'craft.jsonl'), built.jsonl);
  writeFileSync(join(outDir, 'craft.yaml'), built.yaml);
  writeFileSync(join(outDir, 'stats.json'), JSON.stringify(built.stats, null, 2) + '\n');

  process.stdout.write(
    JSON.stringify(
      {
        status: 'ok',
        dry_run: true,
        push: false,
        out_dir: outDir,
        source,
        files: ['craft.jsonl', 'craft.yaml', 'stats.json'],
        stats: built.stats,
      },
      null,
      2
    ) + '\n'
  );
}

main().catch((e) => {
  console.error('[mirror_export] fatal', e.message || e);
  process.exit(1);
});
