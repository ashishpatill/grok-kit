#!/usr/bin/env node
/**
 * CLI entry for nightly / manual consolidation (P3.C1).
 *
 *   DATABASE_URL=… node workers/run-consolidate.mjs [--namespace=…] [--limit=50] [--dry-run]
 *
 * Reads DATABASE_URL from env or memory/.env.local. Neon writes: main only.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import pg from 'pg';
import { handleConsolidate } from './consolidate.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

const args = process.argv.slice(2);
function flag(name) {
  const p = args.find((a) => a.startsWith(`--${name}=`));
  return p ? p.slice(name.length + 3) : null;
}
const dryRun = args.includes('--dry-run');
const namespace = flag('namespace') || process.env.CONSOLIDATE_NAMESPACE || null;
const limit = Number(flag('limit') || process.env.CONSOLIDATE_LIMIT || 50);

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('run-consolidate: DATABASE_URL missing');
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  max: 2,
  connectionTimeoutMillis: 20_000,
});

try {
  const result = await handleConsolidate(
    { query: (sql, params) => pool.query(sql, params) },
    {
      namespace: namespace || undefined,
      limit,
      apply: !dryRun,
      decay: !dryRun,
    }
  );
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
} catch (e) {
  console.error('run-consolidate failed:', e.message || e);
  process.exit(1);
} finally {
  await pool.end().catch(() => {});
}
