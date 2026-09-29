/**
 * Mem0-style ingestion op-set (FINAL-PLAN-V2 §7): ADD / UPDATE / DELETE / NOOP.
 *
 * Pure classification — no DB writes. Used by dedup_check + consolidate.
 * Bi-temporal: respects valid_from / valid_to already on schema v1.
 */

export const SIM_UPDATE = Number(process.env.DEDUP_SIM || 0.92);

/**
 * @typedef {'ADD'|'UPDATE'|'DELETE'|'NOOP'} Mem0Op
 * @typedef {object} ClassifyResult
 * @property {Mem0Op} op
 * @property {string} reason
 * @property {string} [existing_id]
 * @property {number|null} [sim]
 * @property {number|null} [best_sim]
 * @property {number} [threshold]
 * @property {number} [ttl_days]
 */

/**
 * @param {object} row  memory row (id, approval, pinned, superseded_by, merged_into,
 *                      valid_from, valid_to, embedding, created_at, provenance, …)
 * @param {{ id: string, sim: number, pinned?: boolean }[]} [neighbors]
 * @param {{ now?: Date, simThreshold?: number }} [opts]
 * @returns {ClassifyResult}
 */
export function classifyCandidate(row, neighbors = [], opts = {}) {
  const now = opts.now || new Date();
  const threshold = opts.simThreshold ?? SIM_UPDATE;
  const prov = row.provenance && typeof row.provenance === 'object' ? row.provenance : {};

  if (row.superseded_by) {
    return { op: 'NOOP', reason: 'already_superseded' };
  }
  if (row.merged_into) {
    return { op: 'NOOP', reason: 'already_merged' };
  }
  if (row.approval === 'retired') {
    return { op: 'NOOP', reason: 'already_retired' };
  }

  // Bi-temporal: valid_to in the past → DELETE (retire) while still live
  if (row.valid_to) {
    const vt = new Date(row.valid_to);
    if (!Number.isNaN(vt.getTime()) && vt < now) {
      return { op: 'DELETE', reason: 'valid_to_expired' };
    }
  }

  // Not yet in validity window
  if (row.valid_from) {
    const vf = new Date(row.valid_from);
    if (!Number.isNaN(vf.getTime()) && vf > now) {
      return { op: 'NOOP', reason: 'not_yet_valid' };
    }
  }

  // provenance.ttl_days → soft TTL (pinned never auto-DELETE)
  const ttlDays = prov.ttl_days != null ? Number(prov.ttl_days) : null;
  if (ttlDays != null && ttlDays > 0 && row.created_at && !row.pinned) {
    const created = new Date(row.created_at);
    if (!Number.isNaN(created.getTime())) {
      const expiry = created.getTime() + ttlDays * 86_400_000;
      if (expiry < now.getTime()) {
        return { op: 'DELETE', reason: 'ttl_expired', ttl_days: ttlDays };
      }
    }
  }

  if (!row.embedding) {
    return { op: 'NOOP', reason: 'no_embedding_yet' };
  }

  const best = neighbors[0];
  if (best && Number(best.sim) >= threshold) {
    // Never auto-merge pinned identity/preference rows
    if (row.pinned || best.pinned) {
      return {
        op: 'NOOP',
        reason: 'pinned_near_duplicate',
        existing_id: best.id,
        sim: Number(best.sim),
        threshold,
      };
    }
    return {
      op: 'UPDATE',
      reason: 'near_duplicate',
      existing_id: best.id,
      sim: Number(best.sim),
      threshold,
    };
  }

  return {
    op: 'ADD',
    reason: 'no_near_duplicate',
    best_sim: best ? Number(best.sim) : null,
    threshold,
  };
}

/**
 * Apply a classified op. Invalidate-don't-hard-delete.
 * UPDATE merges candidate → existing (candidate retired + valid_to closed).
 * DELETE retires candidate + closes valid_to.
 *
 * @param {{ query: Function }} db
 * @param {{ op: Mem0Op, memory_id: string, existing_id?: string, reason?: string, decided_by?: string }} decision
 */
export async function applyOp(db, decision) {
  const op = decision.op;
  const memoryId = decision.memory_id;
  const decidedBy = decision.decided_by || 'svc:consolidate';
  const at = new Date().toISOString();

  if (op === 'ADD' || op === 'NOOP') {
    return { ok: true, applied: false, op, memory_id: memoryId, reason: decision.reason };
  }

  if (op === 'DELETE') {
    const r = await db.query(
      `UPDATE memories
       SET approval = 'retired',
           valid_to = COALESCE(valid_to, now()),
           provenance = COALESCE(provenance, '{}'::jsonb) || $2::jsonb,
           updated_at = now()
       WHERE id = $1
         AND approval = 'live'
         AND superseded_by IS NULL
       RETURNING id, approval, valid_from, valid_to, superseded_by, merged_into`,
      [
        memoryId,
        JSON.stringify({
          consolidate: {
            op: 'DELETE',
            reason: decision.reason || 'retire',
            at,
            decided_by: decidedBy,
          },
        }),
      ]
    );
    return {
      ok: true,
      applied: !!r.rows[0],
      op: 'DELETE',
      memory_id: memoryId,
      reason: decision.reason,
      row: r.rows[0] || null,
    };
  }

  if (op === 'UPDATE') {
    const existingId = decision.existing_id;
    if (!existingId) {
      return { ok: false, applied: false, op: 'UPDATE', error: 'existing_id required', memory_id: memoryId };
    }
    // Retire candidate into existing survivor; close valid_to on loser
    const r = await db.query(
      `UPDATE memories
       SET superseded_by = $2,
           merged_into = $2,
           approval = 'retired',
           valid_to = COALESCE(valid_to, now()),
           provenance = COALESCE(provenance, '{}'::jsonb) || $3::jsonb,
           updated_at = now()
       WHERE id = $1
         AND approval = 'live'
         AND superseded_by IS NULL
         AND id <> $2
       RETURNING id, approval, valid_from, valid_to, superseded_by, merged_into`,
      [
        memoryId,
        existingId,
        JSON.stringify({
          consolidate: {
            op: 'UPDATE',
            reason: decision.reason || 'near_duplicate',
            into: existingId,
            at,
            decided_by: decidedBy,
            sim: decision.sim ?? null,
          },
        }),
      ]
    );
    if (r.rows[0]) {
      await db.query(
        `UPDATE memories
         SET version = version + 1,
             strength = LEAST(10, COALESCE(strength, 5) + 0.25),
             provenance = COALESCE(provenance, '{}'::jsonb) || $2::jsonb,
             updated_at = now()
         WHERE id = $1`,
        [
          existingId,
          JSON.stringify({
            consolidate: {
              op: 'UPDATE_survivor',
              merged_from: memoryId,
              at,
              decided_by: decidedBy,
            },
          }),
        ]
      );
    }
    return {
      ok: true,
      applied: !!r.rows[0],
      op: 'UPDATE',
      memory_id: memoryId,
      existing_id: existingId,
      reason: decision.reason,
      row: r.rows[0] || null,
    };
  }

  return { ok: false, applied: false, error: `unknown_op:${op}`, memory_id: memoryId };
}
