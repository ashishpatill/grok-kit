#!/usr/bin/env node
/**
 * P2.R1 — pull sync_log deltas into a local SQLite replica by profile.
 *
 *   node replica/cli.mjs --profile hot --db /tmp/replica-hot.db [--fixture PATH]
 *   node replica/cli.mjs --profile hot --db /tmp/replica-hot.db --live
 *   node replica/cli.mjs --profile hot --dry-run --fixture ./fixtures/sync-feed.json
 *
 * Never prints DATABASE_URL. Writes always go through Neon/MCP — this CLI
 * only updates the local read cache.
 */
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertProfile,
  openReplicaDb,
  closeReplicaDb,
  createStubSource,
  createPgSource,
  pullSync,
  snapshotStats,
} from './index.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(__dir, '..', 'package.json'));

function usage() {
  console.error(`Usage:
  node replica/cli.mjs --profile hot|standard|full --db PATH [--fixture PATH]
  node replica/cli.mjs --profile hot --db PATH --live
  node replica/cli.mjs --profile hot --dry-run [--fixture PATH]
`);
  process.exit(2);
}

function arg(flag) {
  const i = process.argv.indexOf(flag);
  if (i < 0) return null;
  return process.argv[i + 1] || null;
}

const profile = arg('--profile') || 'hot';
const dbPath = arg('--db');
const fixturePath = arg('--fixture') || join(__dir, 'fixtures/sync-feed.json');
const live = process.argv.includes('--live');
const dryRun = process.argv.includes('--dry-run');
const evidenceOut = arg('--evidence');
const limit = arg('--limit') ? Number(arg('--limit')) : 5000;
const lastTokenArg = arg('--last-token');

try {
  assertProfile(profile);
} catch (e) {
  console.error(String(e.message || e));
  usage();
}

if (!dryRun && !dbPath) {
  console.error('--db PATH required unless --dry-run');
  usage();
}

async function main() {
  let source;
  let pool = null;

  if (live) {
    if (!process.env.DATABASE_URL) {
      try {
        const dotenv = await import('dotenv');
        dotenv.config({ path: join(__dir, '..', '.env.local') });
      } catch {
        /* optional */
      }
    }
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL missing for --live');
    }
    const pg = require('pg');
    pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      max: 2,
      connectionTimeoutMillis: 20_000,
    });
    source = createPgSource(pool);
  } else {
    const fixture = JSON.parse(readFileSync(resolve(fixturePath), 'utf8'));
    source = createStubSource(fixture);
  }

  const db = openReplicaDb(dryRun ? ':memory:' : resolve(dbPath));
  try {
    const result = await pullSync({
      db,
      source,
      profile,
      lastToken: lastTokenArg != null ? Number(lastTokenArg) : undefined,
      limit,
      dryRun,
      now: new Date(),
    });
    const summary = {
      status: 'ok',
      ...result,
      stats: dryRun ? null : snapshotStats(db),
    };
    // Strip anything that could leak connection info
    delete summary.database_url;
    console.log(JSON.stringify(summary, null, 2));
    if (evidenceOut) {
      mkdirSync(dirname(resolve(evidenceOut)), { recursive: true });
      writeFileSync(resolve(evidenceOut), JSON.stringify(summary, null, 2) + '\n');
    }
  } finally {
    closeReplicaDb(db);
    if (pool) await pool.end();
  }
}

main().catch((err) => {
  console.error(JSON.stringify({ status: 'error', error: String(err.message || err) }));
  process.exit(1);
});
