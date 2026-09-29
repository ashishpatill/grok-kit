#!/usr/bin/env node
/**
 * memory CLI twin (P1.M5) — bot-facing store / recall / list_namespaces
 * with the same JSON envelopes as memory-mcp.
 *
 * Usage:
 *   DATABASE_URL=... node cli/index.mjs store --namespace NS --text "..." [--metadata '{}']
 *   DATABASE_URL=... node cli/index.mjs recall --namespace NS --query "..." [--k 8]
 *   DATABASE_URL=... node cli/index.mjs list_namespaces
 *   MEMORY_BACKEND=stub node cli/index.mjs …   # in-memory (smoke / no Neon)
 *   node cli/index.mjs --help
 *
 * Exit: 0 on status ok|cold_start|thin; 1 on validation/error envelopes or usage errors.
 */
import { store, recall, listNamespaces } from './core.mjs';
import { createStubAdapter } from './stub.mjs';

const HELP = `memory-cli — CLI twin of memory-mcp (store / recall / list_namespaces)

Usage:
  memory-cli store  --namespace <ns> --text <text> [--metadata <json>]
  memory-cli recall --namespace <ns> --query <q> [--k <1..50>]
  memory-cli list_namespaces
  memory-cli --help

Env:
  DATABASE_URL       Postgres connection (required unless MEMORY_BACKEND=stub)
  MEMORY_BACKEND     "pg" (default) | "stub" (in-memory, no Neon)
  MEMORY_STUB_PATH   Optional JSON file for stub persistence across processes
  MEMORY_QUEUE       pg-boss queue name (default memory-embed)

JSON envelopes match MCP tools (status, id, results, cold_start|thin|ok, …).
`;

function parseArgs(argv) {
  const args = argv.slice(2);
  const flags = {};
  const positionals = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--help' || a === '-h') {
      flags.help = true;
    } else if (a === '--') {
      positionals.push(...args.slice(i + 1));
      break;
    } else if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = args[i + 1];
      if (next == null || next.startsWith('--')) {
        flags[key] = true;
      } else {
        flags[key] = next;
        i += 1;
      }
    } else {
      positionals.push(a);
    }
  }
  return { flags, positionals };
}

function printJson(payload) {
  const { _isError, ...out } = payload;
  process.stdout.write(JSON.stringify(out, null, 2) + '\n');
  return _isError || out.status === 'error' ? 1 : 0;
}

async function resolveAdapter(flags) {
  const backend = (flags.backend || process.env.MEMORY_BACKEND || 'pg').toLowerCase();
  if (backend === 'stub' || backend === 'memory') {
    return { adapter: createStubAdapter(), backend: 'stub' };
  }
  if (!process.env.DATABASE_URL) {
    console.error('[cli] DATABASE_URL missing (or set MEMORY_BACKEND=stub)');
    process.exit(1);
  }
  // Lazy-load so stub/smoke needs no node_modules (pg / dotenv / pg-boss).
  const { createPgAdapter } = await import('./pg.mjs');
  return { adapter: createPgAdapter(process.env.DATABASE_URL), backend: 'pg' };
}

async function main() {
  const { flags, positionals } = parseArgs(process.argv);
  if (flags.help) {
    process.stdout.write(HELP);
    process.exit(0);
  }
  if (positionals.length === 0) {
    process.stdout.write(HELP);
    process.exit(1);
  }

  const cmd = positionals[0];
  const { adapter, backend } = await resolveAdapter(flags);

  try {
    if (cmd === 'store') {
      const namespace = flags.namespace || positionals[1];
      const text = flags.text || positionals[2];
      let metadata = {};
      if (flags.metadata) {
        try {
          metadata = JSON.parse(flags.metadata);
        } catch {
          process.exit(
            printJson({
              status: 'error',
              error: 'VALIDATION',
              detail: 'metadata must be JSON',
              _isError: true,
            })
          );
        }
      }
      const payload = await store(adapter, namespace, text, metadata);
      process.exit(printJson(payload));
    }

    if (cmd === 'recall') {
      const namespace = flags.namespace || positionals[1];
      const query = flags.query || positionals[2];
      const k = flags.k != null ? Number(flags.k) : 8;
      const payload = await recall(adapter, namespace, query, k);
      process.exit(printJson(payload));
    }

    if (cmd === 'list_namespaces') {
      const payload = await listNamespaces(adapter);
      process.exit(printJson(payload));
    }

    console.error(`[cli] unknown command: ${cmd}`);
    process.stdout.write(HELP);
    process.exit(1);
  } finally {
    if (backend === 'pg' && typeof adapter.end === 'function') {
      await adapter.end().catch(() => {});
    }
  }
}

main().catch((e) => {
  console.error('[cli] fatal', e);
  process.exit(1);
});
