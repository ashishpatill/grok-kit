/**
 * Apply an evidence-weighing resolution to the store (P1.X7 / §10).
 * Winner stays live (version++); losers get superseded_by = winner.
 * Originals preserved (invalidate-don't-delete). Writes review_items row.
 */
import { randomUUID } from 'node:crypto';
import { weighEvidence } from './evidence-weigh.mjs';

/**
 * @param {{ query: Function }} db
 * @param {{ candidates: object[], decided_by?: string, reason?: string, namespace?: string }} opts
 */
export async function resolveConflict(db, opts) {
  const candidates = opts.candidates || [];
  if (candidates.length < 2) {
    return { status: 'error', error: 'VALIDATION', detail: 'need >= 2 candidates' };
  }
  const decided_by = opts.decided_by || 'svc:resolver';
  const weighing = weighEvidence(candidates, { reason: opts.reason || 'feature_conflict' });
  const winnerId = weighing.winner_id;
  const loserIds = weighing.loser_ids;

  const client = typeof db.connect === 'function' ? await db.connect() : null;
  const q = client || db;
  try {
    if (client) await q.query('BEGIN');

    // Bump winner version + stamp resolution in provenance
    const winUpd = await q.query(
      `UPDATE memories
       SET version = version + 1,
           provenance = COALESCE(provenance, '{}'::jsonb) || $2::jsonb,
           strength = LEAST(10, COALESCE(strength, 5) + 0.5)
       WHERE id = $1
       RETURNING id, version, namespace, text, grounding_ids, provenance, superseded_by`,
      [
        winnerId,
        JSON.stringify({
          last_resolution: {
            at: weighing.at,
            decided_by,
            margin: weighing.margin,
            confidence: weighing.confidence,
            loser_ids: loserIds,
            identity_gatekeeping: false,
          },
        }),
      ]
    );
    const winner = winUpd.rows[0];
    if (!winner) {
      if (client) await q.query('ROLLBACK');
      return { status: 'error', error: 'NOT_FOUND', detail: `winner ${winnerId}` };
    }

    const superseded = [];
    for (const lid of loserIds) {
      const r = await q.query(
        `UPDATE memories
         SET superseded_by = $2,
             approval = 'retired',
             provenance = COALESCE(provenance, '{}'::jsonb) || $3::jsonb
         WHERE id = $1
           AND superseded_by IS NULL
         RETURNING id, superseded_by, approval`,
        [
          lid,
          winnerId,
          JSON.stringify({
            superseded_reason: 'evidence_weigh_resolution',
            superseded_at: weighing.at,
            decided_by,
          }),
        ]
      );
      if (r.rows[0]) superseded.push(r.rows[0]);
    }

    const reviewId = `resolution-${randomUUID()}`;
    await q.query(
      `INSERT INTO review_items (id, kind, payload, status, decided_at, decided_by)
       VALUES ($1, 'resolution', $2::jsonb, 'resolved', now(), $3)
       ON CONFLICT (id) DO NOTHING`,
      [
        reviewId,
        JSON.stringify({
          namespace: opts.namespace || winner.namespace,
          weighing,
          winner_id: winnerId,
          loser_ids: loserIds,
          decided_by,
          identity_gatekeeping: false,
        }),
        decided_by,
      ]
    );

    if (client) await q.query('COMMIT');

    return {
      status: 'ok',
      winner_id: winnerId,
      winner_version: winner.version,
      superseded,
      review_item_id: reviewId,
      weighing,
      decided_by,
      identity_gatekeeping: false,
    };
  } catch (e) {
    if (client) await q.query('ROLLBACK').catch(() => {});
    return { status: 'error', error: String(e.message || e) };
  } finally {
    if (client) client.release();
  }
}
