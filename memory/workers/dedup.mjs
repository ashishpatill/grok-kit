/**
 * P1.M7 / P3.C1 dedup_check — Mem0 ADD / UPDATE / DELETE / NOOP (FINAL-PLAN-V2 §7).
 *
 * Default: classify + queue review on UPDATE (safe). Set job.apply=true (or
 * DEDUP_APPLY=1) to apply UPDATE/DELETE via bi-temporal valid_to + retire.
 * Pinned rows never auto-merge/delete.
 */
import { classifyCandidate, applyOp, SIM_UPDATE } from './classify.mjs';

const APPLY_DEFAULT = process.env.DEDUP_APPLY === '1';

/**
 * @param {{ query: Function }} db
 * @param {{ memory_id: string, apply?: boolean }} job
 */
export async function handleDedup(db, job) {
  const memoryId = job?.memory_id;
  if (!memoryId) {
    return { ok: false, error: 'memory_id required', skipped: true };
  }
  const apply = job.apply === true || APPLY_DEFAULT;

  const sel = await db.query(
    `SELECT id, namespace, text, embedding, provenance, superseded_by, merged_into,
            approval, pinned, valid_from, valid_to, created_at, importance, strength
     FROM memories WHERE id = $1`,
    [memoryId]
  );
  const row = sel.rows[0];
  if (!row) {
    return { ok: false, error: 'memory_not_found', memory_id: memoryId, skipped: true };
  }

  /** @type {{ id: string, sim: number, pinned?: boolean }[]} */
  let neighbors = [];
  if (row.embedding) {
    const near = await db.query(
      `SELECT id, text, pinned, 1 - (embedding <=> $2::halfvec) AS sim
       FROM memories
       WHERE namespace = $1
         AND id <> $3
         AND superseded_by IS NULL
         AND merged_into IS NULL
         AND approval = 'live'
         AND embedding IS NOT NULL
         AND (valid_to IS NULL OR valid_to > now())
         AND valid_from <= now()
       ORDER BY embedding <=> $2::halfvec
       LIMIT 5`,
      [row.namespace, row.embedding, memoryId]
    );
    neighbors = near.rows.map((r) => ({
      id: r.id,
      sim: Number(r.sim),
      pinned: !!r.pinned,
    }));
  }

  const classified = classifyCandidate(row, neighbors, { simThreshold: SIM_UPDATE });
  const base = {
    ok: true,
    kind: 'dedup',
    memory_id: memoryId,
    op: classified.op,
    reason: classified.reason,
    threshold: SIM_UPDATE,
    apply,
  };
  if (classified.existing_id) base.existing_id = classified.existing_id;
  if (classified.sim != null) base.sim = classified.sim;
  if (classified.best_sim != null) base.best_sim = classified.best_sim;
  if (classified.ttl_days != null) base.ttl_days = classified.ttl_days;

  // UPDATE without apply → review queue (P1.M7 behaviour preserved)
  if (classified.op === 'UPDATE' && !apply) {
    const reviewId = `dedup-${memoryId.slice(0, 8)}-${Date.now().toString(36)}`;
    await db.query(
      `INSERT INTO review_items (id, kind, payload, status)
       VALUES ($1, 'resolution', $2::jsonb, 'queued')
       ON CONFLICT (id) DO NOTHING`,
      [
        reviewId,
        JSON.stringify({
          reason: classified.reason,
          op_hint: 'UPDATE',
          candidate_id: memoryId,
          existing_id: classified.existing_id,
          sim: classified.sim,
          threshold: SIM_UPDATE,
          candidate_text: String(row.text).slice(0, 300),
        }),
      ]
    );
    return { ...base, review_id: reviewId, applied: false };
  }

  // DELETE without apply → review (human/curator) unless apply flag
  if (classified.op === 'DELETE' && !apply) {
    const reviewId = `ttl-${memoryId.slice(0, 8)}-${Date.now().toString(36)}`;
    await db.query(
      `INSERT INTO review_items (id, kind, payload, status)
       VALUES ($1, 'resolution', $2::jsonb, 'queued')
       ON CONFLICT (id) DO NOTHING`,
      [
        reviewId,
        JSON.stringify({
          reason: classified.reason,
          op_hint: 'DELETE',
          candidate_id: memoryId,
          ttl_days: classified.ttl_days ?? null,
          valid_to: row.valid_to,
        }),
      ]
    );
    return { ...base, review_id: reviewId, applied: false };
  }

  if (apply && (classified.op === 'UPDATE' || classified.op === 'DELETE')) {
    const applied = await applyOp(db, {
      op: classified.op,
      memory_id: memoryId,
      existing_id: classified.existing_id,
      reason: classified.reason,
      sim: classified.sim,
      decided_by: 'svc:dedup',
    });
    return { ...base, applied: applied.applied, apply_result: applied };
  }

  return { ...base, applied: false };
}
