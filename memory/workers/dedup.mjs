/**
 * P1.M7 dedup_check worker — Mem0-ish ADD/UPDATE/NOOP (DELETE left to curator).
 * Uses cosine against same-namespace indexed neighbors (sim >= 0.92 → UPDATE candidate).
 * Contradictions (same yaml_id / high sim + material text diff) → review_items queue.
 * Does NOT delete; never fakes embeddings.
 */
const SIM_UPDATE = Number(process.env.DEDUP_SIM || 0.92);

/**
 * @param {{ query: Function }} db
 * @param {{ memory_id: string }} job
 */
export async function handleDedup(db, job) {
  const memoryId = job?.memory_id;
  if (!memoryId) {
    return { ok: false, error: 'memory_id required', skipped: true };
  }

  const sel = await db.query(
    `SELECT id, namespace, text, embedding, provenance, superseded_by
     FROM memories WHERE id = $1`,
    [memoryId]
  );
  const row = sel.rows[0];
  if (!row) {
    return { ok: false, error: 'memory_not_found', memory_id: memoryId, skipped: true };
  }
  if (row.superseded_by) {
    return { ok: true, kind: 'dedup', memory_id: memoryId, op: 'NOOP', reason: 'already_superseded' };
  }
  if (!row.embedding) {
    return {
      ok: true,
      kind: 'dedup',
      memory_id: memoryId,
      op: 'NOOP',
      reason: 'no_embedding_yet',
      note: 'embed worker must run first',
    };
  }

  const near = await db.query(
    `SELECT id, text, 1 - (embedding <=> $2::halfvec) AS sim
     FROM memories
     WHERE namespace = $1
       AND id <> $3
       AND superseded_by IS NULL
       AND embedding IS NOT NULL
       AND approval = 'live'
     ORDER BY embedding <=> $2::halfvec
     LIMIT 5`,
    [row.namespace, row.embedding, memoryId]
  );

  const best = near.rows[0];
  if (!best || Number(best.sim) < SIM_UPDATE) {
    return {
      ok: true,
      kind: 'dedup',
      memory_id: memoryId,
      op: 'ADD',
      reason: 'no_near_duplicate',
      best_sim: best ? Number(best.sim) : null,
      threshold: SIM_UPDATE,
    };
  }

  // High similarity → mark as UPDATE candidate via review_items (human/curator later)
  const reviewId = `dedup-${memoryId.slice(0, 8)}-${Date.now().toString(36)}`;
  await db.query(
    `INSERT INTO review_items (id, kind, payload, status)
     VALUES ($1, 'resolution', $2::jsonb, 'queued')
     ON CONFLICT (id) DO NOTHING`,
    [
      reviewId,
      JSON.stringify({
        reason: 'near_duplicate',
        op_hint: 'UPDATE',
        candidate_id: memoryId,
        existing_id: best.id,
        sim: Number(best.sim),
        threshold: SIM_UPDATE,
        candidate_text: String(row.text).slice(0, 300),
        existing_text: String(best.text).slice(0, 300),
      }),
    ]
  );

  return {
    ok: true,
    kind: 'dedup',
    memory_id: memoryId,
    op: 'UPDATE',
    reason: 'near_duplicate',
    existing_id: best.id,
    sim: Number(best.sim),
    review_id: reviewId,
    threshold: SIM_UPDATE,
  };
}
