/**
 * P3.C1 consolidate — sleep-time Mem0 op batch (FINAL-PLAN-V2 §7 / §14).
 *
 * Scans live candidates in a namespace (or global sample), classifies each into
 * ADD / UPDATE / DELETE / NOOP, and **applies** UPDATE/DELETE with bi-temporal
 * valid_to. Optional light strength decay on stale episodic rows.
 *
 * Nightly path: launchd StartCalendarInterval → run-consolidate.mjs (see
 * daemon/launchd/INSTALL.md). Does not claim Tailscale.
 */
import { classifyCandidate, applyOp, SIM_UPDATE } from './classify.mjs';

/**
 * List live rows that may need consolidation (TTL / expired valid_to / recent indexed).
 * @param {{ query: Function }} db
 * @param {{ namespace?: string, limit?: number }} [opts]
 */
export async function listConsolidateCandidates(db, opts = {}) {
  const limit = opts.limit ?? 50;
  const params = [];
  let where = `approval = 'live' AND superseded_by IS NULL AND merged_into IS NULL AND pinned = false`;
  if (opts.namespace) {
    params.push(opts.namespace);
    where += ` AND namespace = $${params.length}`;
  }
  params.push(limit);
  const r = await db.query(
    `SELECT id, namespace, text, embedding, provenance, superseded_by, merged_into,
            approval, pinned, valid_from, valid_to, created_at, importance, strength,
            type, last_recalled_at
     FROM memories
     WHERE ${where}
     ORDER BY
       CASE
         WHEN valid_to IS NOT NULL AND valid_to < now() THEN 0
         WHEN (provenance->>'ttl_days') IS NOT NULL THEN 1
         ELSE 2
       END,
       created_at ASC
     LIMIT $${params.length}`,
    params
  );
  return r.rows;
}

/**
 * @param {{ query: Function }} db
 * @param {object} row
 */
async function loadNeighbors(db, row) {
  if (!row.embedding) return [];
  const near = await db.query(
    `SELECT id, pinned, 1 - (embedding <=> $2::halfvec) AS sim
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
    [row.namespace, row.embedding, row.id]
  );
  return near.rows.map((r) => ({
    id: r.id,
    sim: Number(r.sim),
    pinned: !!r.pinned,
  }));
}

/**
 * Light decay for episodic not recalled in `staleDays`.
 * @param {{ query: Function }} db
 * @param {{ namespace?: string, staleDays?: number, limit?: number, factor?: number }} [opts]
 */
export async function decayStaleEpisodic(db, opts = {}) {
  const staleDays = opts.staleDays ?? 30;
  const limit = opts.limit ?? 100;
  const factor = opts.factor ?? 0.95;
  const params = [staleDays, limit, factor];
  let whereNs = '';
  if (opts.namespace) {
    params.push(opts.namespace);
    whereNs = ` AND namespace = $${params.length}`;
  }
  const r = await db.query(
    `WITH pick AS (
       SELECT id FROM memories
       WHERE approval = 'live'
         AND superseded_by IS NULL
         AND pinned = false
         AND type = 'episodic'
         AND (
           last_recalled_at IS NULL
           OR last_recalled_at < now() - make_interval(days => $1)
         )
         AND created_at < now() - make_interval(days => $1)
         ${whereNs}
       ORDER BY created_at ASC
       LIMIT $2
     )
     UPDATE memories m
     SET strength = GREATEST(0.1, strength * $3::real),
         updated_at = now()
     FROM pick
     WHERE m.id = pick.id
     RETURNING m.id, m.strength`,
    params
  );
  return { decayed: r.rows.length, rows: r.rows };
}

/**
 * pg-boss / CLI handler.
 * @param {{ query: Function }} db
 * @param {{ namespace?: string, limit?: number, as_of?: string, decay?: boolean, apply?: boolean, stale_days?: number, decay_limit?: number }} [job]
 */
export async function handleConsolidate(db, job = {}) {
  const asOf = job.as_of ? new Date(job.as_of) : new Date();
  const apply = job.apply !== false; // consolidate defaults to apply
  const limit = job.limit ?? 50;
  const candidates = await listConsolidateCandidates(db, {
    namespace: job.namespace,
    limit,
  });

  const counts = { ADD: 0, UPDATE: 0, DELETE: 0, NOOP: 0 };
  const results = [];

  for (const row of candidates) {
    const neighbors = await loadNeighbors(db, row);
    const classified = classifyCandidate(row, neighbors, {
      now: asOf,
      simThreshold: SIM_UPDATE,
    });
    counts[classified.op] = (counts[classified.op] || 0) + 1;

    let applyResult = null;
    if (apply && (classified.op === 'UPDATE' || classified.op === 'DELETE')) {
      applyResult = await applyOp(db, {
        op: classified.op,
        memory_id: row.id,
        existing_id: classified.existing_id,
        reason: classified.reason,
        sim: classified.sim,
        decided_by: 'svc:consolidate',
      });
    }

    results.push({
      memory_id: row.id,
      op: classified.op,
      reason: classified.reason,
      existing_id: classified.existing_id || null,
      applied: applyResult?.applied ?? false,
    });
  }

  let decay = null;
  if (job.decay !== false) {
    try {
      decay = await decayStaleEpisodic(db, {
        namespace: job.namespace,
        staleDays: job.stale_days ?? 30,
        limit: job.decay_limit ?? 100,
      });
    } catch (e) {
      decay = { decayed: 0, error: String(e.message || e), skipped: true };
    }
  }

  return {
    ok: true,
    kind: 'consolidate',
    as_of: asOf.toISOString(),
    namespace: job.namespace || null,
    scanned: candidates.length,
    counts,
    applied: results.filter((r) => r.applied).length,
    results,
    decay,
    threshold: SIM_UPDATE,
  };
}
