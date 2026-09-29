/**
 * Postgres import adapter (P1.M6). Lazy-loads `pg` like memory/cli/pg.mjs.
 * Requires migration 003 (review_items + memories_content_hash_uq).
 *
 * Classification (ops.mjs) needs sync OpIndex lookups, so we preload live
 * rows into an in-memory snapshot, classify, then apply writes to PG.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import dotenv from 'dotenv';
import { normalizeText } from './hash.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

function asIndexRow(row) {
  if (!row) return null;
  const provenance =
    typeof row.provenance === 'string' ? JSON.parse(row.provenance) : row.provenance || {};
  return {
    id: row.id,
    text: row.text,
    namespace: row.namespace,
    content_hash: provenance.content_hash || null,
    provenance,
  };
}

/**
 * Build a sync OpIndex from a list of index rows.
 * @param {ReturnType<typeof asIndexRow>[]} rows
 * @returns {import('./ops.mjs').OpIndex}
 */
export function buildIndexFromRows(rows) {
  const byHash = new Map();
  const byYaml = new Map();
  const byId = new Map();
  /** @type {Map<string, Map<string, object>>} */
  const byNorm = new Map();

  for (const row of rows) {
    if (!row) continue;
    byId.set(row.id, row);
    if (row.content_hash) byHash.set(row.content_hash, row);
    const y = row.provenance?.yaml_id;
    if (y) byYaml.set(y, row);
    if (!byNorm.has(row.namespace)) byNorm.set(row.namespace, new Map());
    byNorm.get(row.namespace).set(normalizeText(row.text), row);
  }

  return {
    findByContentHash(hash) {
      return byHash.get(hash) || null;
    },
    findByYamlId(yamlId) {
      return byYaml.get(yamlId) || null;
    },
    findById(id) {
      return byId.get(id) || null;
    },
    findByNormalizedText(namespace, normText) {
      const m = byNorm.get(namespace);
      return (m && m.get(normText)) || null;
    },
  };
}

/**
 * Empty sync index (stub / dry-run with no prior DB state).
 * @returns {import('./ops.mjs').OpIndex}
 */
export function emptyIndex() {
  return buildIndexFromRows([]);
}

/**
 * @param {string} [databaseUrl]
 */
export async function createPgImportAdapter(databaseUrl = process.env.DATABASE_URL) {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL missing');
  }

  const { default: pg } = await import('pg');
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    max: 2,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 15_000,
  });

  return {
    /**
     * Snapshot of non-superseded memories for classifyBatch.
     * @returns {Promise<object[]>}
     */
    async listLiveMemories() {
      const r = await pool.query(
        `SELECT id, namespace, text, provenance
         FROM memories
         WHERE superseded_by IS NULL`
      );
      return r.rows.map(asIndexRow);
    },

    async insertMemory(row) {
      const client = await pool.connect();
      try {
        const ins = await client.query(
          `INSERT INTO memories (
             id, namespace, type, scope, text, importance, strength, pinned,
             index_status, approval, grounding_ids, provenance
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7, $8,
             'staged', 'live', $9, $10::jsonb
           ) RETURNING id, namespace, index_status, approval, created_at`,
          [
            row.id,
            row.namespace,
            row.type,
            row.scope || 'global',
            row.text,
            row.importance ?? 5,
            row.strength ?? 5.0,
            Boolean(row.pinned),
            row.grounding_ids || [],
            JSON.stringify(row.provenance),
          ]
        );
        return ins.rows[0];
      } finally {
        client.release();
      }
    },

    async supersede(oldId, newId) {
      const r = await pool.query(
        `UPDATE memories
         SET superseded_by = $2, updated_at = now()
         WHERE id = $1
         RETURNING id, superseded_by`,
        [oldId, newId]
      );
      if (!r.rows[0]) throw new Error(`supersede: missing ${oldId}`);
      return r.rows[0];
    },

    async insertReviewItem({ kind, payload, id }) {
      const reviewId = id || randomUUID();
      const r = await pool.query(
        `INSERT INTO review_items (id, kind, payload, status)
         VALUES ($1, $2, $3::jsonb, 'queued')
         RETURNING id, kind, status, created_at`,
        [reviewId, kind, JSON.stringify(payload)]
      );
      return r.rows[0];
    },

    async end() {
      await pool.end().catch(() => {});
    },
  };
}
