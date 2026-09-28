/**
 * memory-mcp (C0 spike) — stdio MCP exposing store / recall / list_namespaces
 * against Neon, adapted to schema v1.sql.
 *
 * Run:  node mcp/index.mjs
 * Or:   npx (from package) — see spikes/C0/ROUNDTRIP.md
 *
 * store: INSERT staged memory (embedding NULL, provenance jsonb);
 *        sync_log is appended by AFTER INSERT trigger — do not insert manually.
 * recall: keyword (tsvector) within namespace; filters approval='live' and
 *         index_status IN ('indexed','staged'); returns index_status not status.
 * list_namespaces: live namespaces with counts (TASKS C0.1).
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import dotenv from 'dotenv';
import pg from 'pg';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { PgBoss } from 'pg-boss';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

const DATABASE_URL = process.env.DATABASE_URL;
const QUEUE = process.env.MEMORY_QUEUE || 'memory-embed';

const MEMORY_TYPES = new Set(['working', 'episodic', 'semantic', 'procedural', 'goals', 'reflective']);
const MEMORY_SCOPES = new Set(['global', 'node_local', 'edge']);

if (!DATABASE_URL) {
  console.error('[mcp] DATABASE_URL missing');
  process.exit(1);
}

/** Lazy pooled client — one connection reused for the stdio session. */
let pool = null;
function getPool() {
  if (!pool) {
    pool = new pg.Pool({
      connectionString: DATABASE_URL,
      max: 2,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 15_000,
    });
  }
  return pool;
}

async function enqueueEmbed(memoryId) {
  const boss = new PgBoss({
    connectionString: DATABASE_URL,
    migrate: true,
    supervise: false,
    schedule: false,
  });
  try {
    await boss.start();
    try {
      await boss.createQueue(QUEUE);
    } catch {
      /* exists */
    }
    const jobId = await boss.send(QUEUE, {
      kind: 'embed',
      memory_id: memoryId,
      enqueued_at: new Date().toISOString(),
    });
    return jobId;
  } finally {
    await boss.stop({ graceful: false, timeout: 5000 }).catch(() => {});
  }
}

const server = new McpServer({
  name: 'memory-mcp',
  version: '0.0.1-c0',
});

server.registerTool(
  'store',
  {
    description:
      'Store a memory fact in a namespace. Writes staged row (embedding NULL, index_status=staged, approval=live) with provenance jsonb; sync_log is trigger-appended. Enqueues an embed job. Returns the new memory id.',
    inputSchema: {
      namespace: z.string().describe('Canonical namespace, e.g. preferences, project-foo, feature-auth'),
      text: z.string().describe('Atomic fact / learning text'),
      metadata: z
        .record(z.string(), z.any())
        .optional()
        .describe('Optional metadata: type, scope, author, origin, source_session, importance, strength, bot_id (folded into provenance)'),
    },
  },
  async ({ namespace, text, metadata = {} }) => {
    const type = metadata.type || 'semantic';
    const scope = metadata.scope || 'global';
    const author = metadata.author || 'mcp:c0';
    const origin = metadata.origin || 'mcp-store';
    const source_session = metadata.source_session || `c0-${Date.now()}`;
    const importance = metadata.importance ?? 5;
    const strength = metadata.strength ?? 5.0;
    const id = metadata.id || randomUUID(); // TEXT PK; uuid-as-text is fine for spike
    const createdAt = new Date().toISOString();

    const provenance = {
      source_session,
      author,
      origin,
      created_at: createdAt,
      embedding_model: null,
    };
    if (metadata.bot_id) provenance.bot_id = metadata.bot_id;
    if (metadata.trajectory_ref) provenance.trajectory_ref = metadata.trajectory_ref;
    if (metadata.evidence_refs) provenance.evidence_refs = metadata.evidence_refs;
    if (metadata.import_batch) provenance.import_batch = metadata.import_batch;

    if (!MEMORY_TYPES.has(type)) {
      return {
        isError: true,
        content: [{ type: 'text', text: JSON.stringify({ status: 'error', error: 'VALIDATION', detail: `type must be one of ${[...MEMORY_TYPES].join(',')}` }) }],
      };
    }
    if (!MEMORY_SCOPES.has(scope)) {
      return {
        isError: true,
        content: [{ type: 'text', text: JSON.stringify({ status: 'error', error: 'VALIDATION', detail: `scope must be one of ${[...MEMORY_SCOPES].join(',')}` }) }],
      };
    }
    const grounding_ids = Array.isArray(metadata.grounding_ids) ? metadata.grounding_ids : [];

    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      // v1.sql: no bot_id / flat source_session/author/origin/status columns;
      // sync_log is appended by AFTER INSERT trigger — do not INSERT manually.
      const ins = await client.query(
        `INSERT INTO memories (
           id, namespace, type, scope, text, importance, strength,
           index_status, approval, grounding_ids, provenance
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7,
           'staged', 'live', $9, $8::jsonb
         ) RETURNING id, namespace, index_status, approval, created_at`,
        [id, namespace, type, scope, text, importance, strength, JSON.stringify(provenance), grounding_ids]
      );
      const row = ins.rows[0];
      await client.query('COMMIT');

      let jobId = null;
      let enqueue_error = null;
      try {
        jobId = await enqueueEmbed(row.id);
      } catch (e) {
        enqueue_error = String(e.message || e);
      }

      const payload = {
        status: 'ok',
        id: row.id,
        namespace: row.namespace,
        index_status: row.index_status,
        approval: row.approval,
        embedding: null,
        embed_job_id: jobId,
        enqueue_error,
        created_at: row.created_at,
      };
      return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      return {
        isError: true,
        content: [{ type: 'text', text: JSON.stringify({ status: 'error', error: String(e.message || e) }) }],
      };
    } finally {
      client.release();
    }
  }
);

server.registerTool(
  'recall',
  {
    description:
      'Recall top-k memories in a namespace matching query (keyword tsvector). Filters approval=live and index_status IN (indexed,staged). Returns cold_start|thin|ok status.',
    inputSchema: {
      namespace: z.string().describe('Namespace to search within'),
      query: z.string().describe('Search query'),
      k: z.number().int().min(1).max(50).optional().describe('Max results (default 8)'),
    },
  },
  async ({ namespace, query, k = 8 }) => {
    const client = await getPool().connect();
    try {
      // Prefer indexed; include staged so C0 store→recall round-trip works before embed worker runs
      const r = await client.query(
        `SELECT id, namespace, text, index_status, approval, type, importance, created_at,
                ts_rank_cd(text_tsv, plainto_tsquery('english', $2)) AS rank
         FROM memories
         WHERE namespace = $1
           AND approval = 'live'
           AND index_status IN ('indexed','staged')
           AND text_tsv @@ plainto_tsquery('english', $2)
         ORDER BY
           CASE index_status WHEN 'indexed' THEN 0 ELSE 1 END,
           ts_rank_cd(text_tsv, plainto_tsquery('english', $2)) DESC,
           created_at DESC
         LIMIT $3`,
        [namespace, query, k]
      );

      let status = 'ok';
      if (r.rows.length === 0) {
        const cnt = await client.query(
          `SELECT count(*)::int AS n FROM memories
           WHERE namespace = $1 AND approval = 'live' AND index_status IN ('indexed','staged')`,
          [namespace]
        );
        status = cnt.rows[0].n === 0 ? 'cold_start' : 'thin';
      }

      const payload = {
        status,
        namespace,
        query,
        k,
        count: r.rows.length,
        results: r.rows.map((row) => ({
          id: row.id,
          text: row.text,
          index_status: row.index_status,
          approval: row.approval,
          type: row.type,
          importance: row.importance,
          rank: Number(row.rank),
          created_at: row.created_at,
        })),
      };
      return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
    } catch (e) {
      return {
        isError: true,
        content: [{ type: 'text', text: JSON.stringify({ status: 'error', error: String(e.message || e) }) }],
      };
    } finally {
      client.release();
    }
  }
);

server.registerTool(
  'list_namespaces',
  {
    description: 'List live namespaces with memory counts (approval=live).',
    inputSchema: {},
  },
  async () => {
    const client = await getPool().connect();
    try {
      const r = await client.query(
        `SELECT namespace, count(*)::int AS n
         FROM memories
         WHERE approval = 'live'
         GROUP BY namespace
         ORDER BY namespace`
      );
      const payload = {
        status: 'ok',
        count: r.rows.length,
        namespaces: r.rows,
      };
      return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
    } catch (e) {
      return {
        isError: true,
        content: [{ type: 'text', text: JSON.stringify({ status: 'error', error: String(e.message || e) }) }],
      };
    } finally {
      client.release();
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stderr only — stdout is MCP JSON-RPC
  console.error('[memory-mcp] stdio ready (store, recall, list_namespaces)');
}

main().catch((e) => {
  console.error('[memory-mcp] fatal', e);
  process.exit(1);
});

process.on('SIGINT', async () => {
  if (pool) await pool.end().catch(() => {});
  process.exit(0);
});
