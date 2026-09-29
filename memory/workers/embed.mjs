/**
 * P1.M7 embed_memory worker — MiniLM → halfvec(384), index_status=indexed.
 * Idempotent by memory id: re-running is a no-op overwrite with same text.
 */
import { embedText, EMBEDDING_MODEL } from '../lib/embed.mjs';

/**
 * @param {{ query: Function }} db  — { query(sql, params) => Promise<{rows}> }
 * @param {{ memory_id: string }} job
 */
export async function handleEmbed(db, job) {
  const memoryId = job?.memory_id;
  if (!memoryId) {
    return { ok: false, error: 'memory_id required', skipped: true };
  }

  const sel = await db.query(
    `SELECT id, text, embedding IS NOT NULL AS has_embedding, index_status
     FROM memories WHERE id = $1`,
    [memoryId]
  );
  const row = sel.rows[0];
  if (!row) {
    return { ok: false, error: 'memory_not_found', memory_id: memoryId, skipped: true };
  }
  if (!row.text || !String(row.text).trim()) {
    return { ok: false, error: 'empty_text', memory_id: memoryId, skipped: true };
  }

  const lit = await embedText(row.text);
  const upd = await db.query(
    `UPDATE memories
     SET embedding = $2::halfvec,
         index_status = 'indexed',
         provenance = COALESCE(provenance, '{}'::jsonb) || jsonb_build_object('embedding_model', $3::text)
     WHERE id = $1
     RETURNING id, index_status, (embedding IS NOT NULL) AS has_embedding`,
    [memoryId, lit, EMBEDDING_MODEL]
  );

  return {
    ok: true,
    kind: 'embed',
    memory_id: memoryId,
    index_status: upd.rows[0]?.index_status,
    has_embedding: upd.rows[0]?.has_embedding,
    embedding_model: EMBEDDING_MODEL,
    was_already_indexed: row.index_status === 'indexed' && row.has_embedding,
  };
}
