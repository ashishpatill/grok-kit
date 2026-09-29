#!/usr/bin/env node
/**
 * memory-import — JSONL import pipeline (P1.M6)
 *
 * Usage:
 *   node import/index.mjs --file path.jsonl [--dry-run] [--import-batch NAME]
 *   MEMORY_BACKEND=stub node import/index.mjs --file path.jsonl
 *
 * Env:
 *   DATABASE_URL     required unless MEMORY_BACKEND=stub
 *   MEMORY_BACKEND   "pg" (default) | "stub"
 *
 * Prints one JSON summary: {added, updated, noop, contradicted, review_ids, ...}
 * Exit 0 on success; 1 on usage / validation / apply errors.
 */
import { resolve } from 'node:path';
import { parseJsonlFile } from './parse-jsonl.mjs';
import { classifyBatch } from './ops.mjs';
import { applyOps } from './apply.mjs';
import { createStubImportAdapter } from './stub-adapter.mjs';
import { buildIndexFromRows, emptyIndex } from './pg-adapter.mjs';

const HELP = `memory-import — bot-memory JSONL → content-hash dedup → review queue (P1.M6)

Usage:
  memory-import --file <path.jsonl> [--dry-run] [--import-batch <name>]
  memory-import --help

Env:
  DATABASE_URL       Postgres connection (required unless MEMORY_BACKEND=stub)
  MEMORY_BACKEND     "pg" (default) | "stub" (in-memory, no Neon)

Summary JSON fields: added, updated, noop, contradicted, review_ids
`;

function parseArgs(argv) {
  const out = { file: null, dryRun: false, importBatch: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--file' || a === '-f') out.file = argv[++i];
    else if (a === '--import-batch') out.importBatch = argv[++i];
    else if (a.startsWith('--file=')) out.file = a.slice('--file='.length);
    else if (a.startsWith('--import-batch=')) out.importBatch = a.slice('--import-batch='.length);
    else {
      throw new Error(`unknown arg: ${a}`);
    }
  }
  return out;
}

function fail(msg, code = 1) {
  console.error(JSON.stringify({ status: 'error', error: msg }));
  process.exit(code);
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (e) {
    fail(String(e.message || e));
    return;
  }

  if (args.help || !args.file) {
    process.stdout.write(HELP);
    process.exit(args.help ? 0 : 1);
  }

  const backend = (process.env.MEMORY_BACKEND || 'pg').toLowerCase();
  const filePath = resolve(args.file);

  let candidates;
  let parseErrors;
  try {
    ({ candidates, errors: parseErrors } = parseJsonlFile(filePath));
  } catch (e) {
    fail(`read/parse: ${e.message || e}`);
    return;
  }

  if (parseErrors.length) {
    fail(`parse errors (${parseErrors.length}): ${JSON.stringify(parseErrors.slice(0, 5))}`);
    return;
  }

  let adapter;
  let baseIndex = emptyIndex();

  try {
    if (backend === 'stub') {
      adapter = createStubImportAdapter();
      baseIndex = emptyIndex();
    } else {
      if (!process.env.DATABASE_URL) {
        fail('DATABASE_URL required unless MEMORY_BACKEND=stub');
        return;
      }
      const { createPgImportAdapter } = await import('./pg-adapter.mjs');
      adapter = await createPgImportAdapter(process.env.DATABASE_URL);
      const live = await adapter.listLiveMemories();
      baseIndex = buildIndexFromRows(live);
    }

    const ops = classifyBatch(candidates, baseIndex);
    const summary = await applyOps(ops, adapter, {
      dryRun: args.dryRun,
      importBatch: args.importBatch || undefined,
    });

    const envelope = {
      status: 'ok',
      file: filePath,
      candidates: candidates.length,
      ...summary,
    };
    console.log(JSON.stringify(envelope));
  } catch (e) {
    fail(String(e.message || e));
  } finally {
    if (adapter && typeof adapter.end === 'function') {
      await adapter.end().catch(() => {});
    }
  }
}

main();
