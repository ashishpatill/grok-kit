import { buildRecallContract } from '../lib/cold-start-contract.mjs';
/**
 * Postgres + pgvector adapter mirroring memory-mcp store/recall/list_namespaces.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import pg from 'pg';
import { PgBoss } from 'pg-boss';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

const QUEUE = process.env.MEMORY_QUEUE || 'memory-embed';

function halfvecLiteral(arr) {
  const parts = new Array(arr.length);
  for (let i = 0; i < arr.length; i++) parts[i] = Number(arr[i]).toFixed(6);
  return '[' + parts.join(',') + ']';
}

export function createPgAdapter(databaseUrl = process.env.DATABASE_URL) {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL missing');
  }

  const pool = new pg.Pool({
    connectionString: databaseUrl,
    max: 2,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 15_000,
  });

  let embedder = null;
  async function getEmbedder() {
    if (!embedder) {
      const { pipeline } = await import('@xenova/transformers');
      embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    }
    return embedder;
  }

  async function embedText(text) {
    const ex = await getEmbedder();
    const out = await ex(text, { pooling: 'mean', normalize: true });
    return halfvecLiteral(Array.from(out.data));
  }

  return {
    async insertMemory(row) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const ins = await client.query(
          `INSERT INTO memories (
             id, namespace, type, scope, text, importance, strength, pinned,
             index_status, approval, grounding_ids, provenance
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7, $8,
             'staged', 'live', $10, $9::jsonb
           ) RETURNING id, namespace, index_status, approval, created_at`,
          [
            row.id,
            row.namespace,
            row.type,
            row.scope,
            row.text,
            row.importance,
            row.strength,
            row.pinned,
            JSON.stringify(row.provenance),
            row.grounding_ids,
          ]
        );
        await client.query('COMMIT');
        return ins.rows[0];
      } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        throw e;
      } finally {
        client.release();
      }
    },

    async enqueueEmbed(memoryId) {
      const boss = new PgBoss({
        connectionString: databaseUrl,
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
        return { jobId, enqueue_error: null };
      } finally {
        await boss.stop({ graceful: false, timeout: 5000 }).catch(() => {});
      }
    },

    async recall({ namespace, query, k }) {
      const client = await pool.connect();
      try {
        let qEmb = null;
        try {
          qEmb = await embedText(query);
        } catch (e) {
          console.error('[cli] embed failed, keyword-only recall:', e.message);
        }

        let rows;
        const legs = { keyword: 0, vector: 0 };
        if (qEmb) {
          const r = await client.query(
            `WITH kw AS (
               SELECT id, row_number() OVER (ORDER BY ts_rank_cd(text_tsv, plainto_tsquery('english', $2)) DESC) AS rnk
               FROM memories
               WHERE namespace = $1 AND approval = 'live'
                 AND index_status IN ('indexed','staged')
                 AND text_tsv @@ plainto_tsquery('english', $2)
               LIMIT 50
             ),
             vec AS (
               SELECT id, row_number() OVER (ORDER BY embedding <=> $3::halfvec) AS rnk
               FROM memories
               WHERE namespace = $1 AND approval = 'live' AND index_status = 'indexed'
                 AND embedding IS NOT NULL
               ORDER BY embedding <=> $3::halfvec
               LIMIT 50
             ),
             fused AS (
               SELECT COALESCE(kw.id, vec.id) AS id,
                      COALESCE(1.0/(60+kw.rnk),0) + COALESCE(1.0/(60+vec.rnk),0) AS rrf,
                      kw.rnk AS kw_rnk, vec.rnk AS vec_rnk
               FROM kw FULL OUTER JOIN vec ON kw.id = vec.id
             )
             SELECT m.id, m.namespace, m.text, m.index_status, m.approval, m.type,
                    m.importance, m.pinned, m.provenance, m.created_at, f.rrf, f.kw_rnk, f.vec_rnk
             FROM fused f JOIN memories m ON m.id = f.id
             ORDER BY f.rrf DESC
             LIMIT $4`,
            [namespace, query, qEmb, k]
          );
          rows = r.rows;
          legs.keyword = rows.filter((x) => x.kw_rnk != null).length;
          legs.vector = rows.filter((x) => x.vec_rnk != null).length;
        } else {
          const r = await client.query(
            `SELECT id, namespace, text, index_status, approval, type, importance, pinned, provenance, created_at,
                    ts_rank_cd(text_tsv, plainto_tsquery('english', $2)) AS rrf,
                    NULL::int AS kw_rnk, NULL::int AS vec_rnk
             FROM memories
             WHERE namespace = $1 AND approval = 'live'
               AND index_status IN ('indexed','staged')
               AND text_tsv @@ plainto_tsquery('english', $2)
             ORDER BY ts_rank_cd(text_tsv, plainto_tsquery('english', $2)) DESC, created_at DESC
             LIMIT $3`,
            [namespace, query, k]
          );
          rows = r.rows;
          legs.keyword = rows.length;
        }

        const meta = await client.query(
          `SELECT
             (SELECT count(*)::int FROM memories
               WHERE namespace = $1 AND approval = 'live'
                 AND index_status IN ('indexed','staged')) AS live,
             (SELECT count(*)::int FROM memories
               WHERE namespace = $1 AND approval = 'live'
                 AND index_status = 'indexed' AND embedding IS NOT NULL) AS indexed,
             (SELECT count(*)::int FROM memories
               WHERE namespace = $1 AND approval = 'live' AND embedding IS NULL) AS pending,
             (SELECT coalesce(max(seq), 0)::bigint FROM sync_log) AS last_seq`,
          [namespace]
        );
        const m = meta.rows[0];
        return {
          rows,
          legs,
          hybrid: Boolean(qEmb),
          liveCount: m.live,
          source: 'neon',
          indexedCount: m.indexed,
          pendingEmbeddings: m.pending,
          lastSeq: Number(m.last_seq),
          replicaLag: null,
          contract: buildRecallContract({
            source: 'neon',
            indexedCount: m.indexed,
            pendingEmbeddings: m.pending,
            lastSeq: Number(m.last_seq),
            replicaLag: null,
          }),
        };
      } finally {
        client.release();
      }
    },

    async listNamespaces() {
      const client = await pool.connect();
      try {
        const r = await client.query(
          `SELECT namespace, count(*)::int AS n
           FROM memories
           WHERE approval = 'live'
           GROUP BY namespace
           ORDER BY namespace`
        );
        return r.rows;
      } finally {
        client.release();
      }
    },

    async end() {
      await pool.end().catch(() => {});
    },
  };
}
