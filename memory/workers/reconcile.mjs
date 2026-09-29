/**
 * P1.M7 / P1.X4 reconcile sweep on daemon wake (FINAL-PLAN-V2 §13).
 *
 * Startup invariant: reconcile (backfill embedding IS NULL + requeue orphans)
 * before serving. Handlers are idempotent; at-least-once is OK.
 */
export async function listNeedsEmbed(db, opts = {}) {
  const limit = opts.limit ?? 50;
  const r = await db.query(
    `SELECT id FROM memories
     WHERE embedding IS NULL
       AND superseded_by IS NULL
       AND approval = 'live'
     ORDER BY created_at ASC
     LIMIT $1`,
    [limit]
  );
  return r.rows.map((x) => x.id);
}

export function chainJobsFor(memoryId) {
  const ts = new Date().toISOString();
  return [
    { kind: 'embed', memory_id: memoryId, enqueued_at: ts },
    { kind: 'score', memory_id: memoryId, enqueued_at: ts },
    { kind: 'dedup', memory_id: memoryId, enqueued_at: ts },
  ];
}

/**
 * Count live rows still missing embeddings (sweeper backlog).
 * @param {{ query: Function }} db
 * @param {{ namespace?: string, ids?: string[] }} [opts]
 */
export async function countPendingEmbeddings(db, opts = {}) {
  const params = [];
  let where = `embedding IS NULL AND superseded_by IS NULL AND approval = 'live'`;
  if (opts.namespace) {
    params.push(opts.namespace);
    where += ` AND namespace = $${params.length}`;
  }
  if (Array.isArray(opts.ids) && opts.ids.length) {
    params.push(opts.ids);
    where += ` AND id = ANY($${params.length}::text[])`;
  }
  const r = await db.query(`SELECT count(*)::int AS n FROM memories WHERE ${where}`, params);
  return r.rows[0]?.n ?? 0;
}

/**
 * admin_checkpoint (§13.4): pending embeddings == 0 (optionally scoped).
 * deadLetterEmpty is advisory when pg-boss schema is present.
 * @param {{ query: Function }} db
 * @param {{ namespace?: string, ids?: string[], checkDeadLetter?: boolean }} [opts]
 */
export async function adminCheckpoint(db, opts = {}) {
  const pending = await countPendingEmbeddings(db, opts);
  let deadLetter = null;
  let deadLetterEmpty = true;
  if (opts.checkDeadLetter !== false) {
    try {
      const r = await db.query(
        `SELECT count(*)::int AS n
         FROM pgboss.job
         WHERE state = 'failed'
           AND name = COALESCE($1, name)`,
        [opts.queue || null]
      );
      deadLetter = r.rows[0]?.n ?? 0;
      deadLetterEmpty = deadLetter === 0;
    } catch {
      // pgboss schema may not exist yet (stub / pre-daemon)
      deadLetter = null;
      deadLetterEmpty = true;
    }
  }
  const clean = pending === 0 && deadLetterEmpty;
  return {
    clean,
    pending_embeddings: pending,
    dead_letter: deadLetter,
    dead_letter_empty: deadLetterEmpty,
    at: new Date().toISOString(),
  };
}

/**
 * Run reconcile: find staged rows, enqueue embed/score/dedup via sendFn.
 * sendFn(payload, singletonKey) → Promise (swallow singleton collisions).
 *
 * @param {{ query: Function }} db
 * @param {(payload: object, singletonKey: string) => Promise<unknown>} sendFn
 * @param {{ limit?: number }} [opts]
 */
export async function runReconcileSweep(db, sendFn, opts = {}) {
  const needs = await listNeedsEmbed(db, { limit: opts.limit ?? 50 });
  let enqueued = 0;
  const errors = [];
  for (const id of needs) {
    for (const payload of chainJobsFor(id)) {
      const singletonKey = `${payload.kind}:${id}`;
      try {
        await sendFn(payload, singletonKey);
        enqueued += 1;
      } catch (e) {
        // singleton collision = already queued — not an error for zero-loss
        const msg = String(e?.message || e);
        if (!/singleton|duplicate|unique/i.test(msg)) {
          errors.push({ memory_id: id, kind: payload.kind, error: msg });
        }
      }
    }
  }
  return {
    needs_embed: needs,
    needs_count: needs.length,
    enqueued,
    errors,
    at: new Date().toISOString(),
  };
}

/**
 * Apply stub or real embeds for pending ids (spike / recovery without full daemon).
 * stubEmbedFn(text) → halfvec literal string.
 *
 * @param {{ query: Function }} db
 * @param {{ ids?: string[], limit?: number, embedFn: (text: string) => Promise<string>, model?: string }} opts
 */
export async function backfillEmbeddings(db, opts) {
  const embedFn = opts.embedFn;
  if (typeof embedFn !== 'function') {
    throw new Error('embedFn required');
  }
  const model = opts.model || 'stub-halfvec@1';
  let ids = opts.ids;
  if (!ids) {
    ids = await listNeedsEmbed(db, { limit: opts.limit ?? 50 });
  }
  const results = [];
  for (const id of ids) {
    const sel = await db.query(
      `SELECT id, text, embedding IS NOT NULL AS has_embedding, index_status
       FROM memories WHERE id = $1`,
      [id]
    );
    const row = sel.rows[0];
    if (!row) {
      results.push({ id, ok: false, error: 'memory_not_found' });
      continue;
    }
    if (row.has_embedding) {
      results.push({ id, ok: true, skipped: true, reason: 'already_embedded' });
      continue;
    }
    const lit = await embedFn(row.text);
    const upd = await db.query(
      `UPDATE memories
       SET embedding = $2::halfvec,
           index_status = 'indexed',
           provenance = COALESCE(provenance, '{}'::jsonb) || jsonb_build_object('embedding_model', $3::text)
       WHERE id = $1
       RETURNING id, index_status, (embedding IS NOT NULL) AS has_embedding`,
      [id, lit, model]
    );
    results.push({
      id,
      ok: true,
      index_status: upd.rows[0]?.index_status,
      has_embedding: upd.rows[0]?.has_embedding,
      model,
    });
  }
  return { ids, results, embedded: results.filter((r) => r.ok && !r.skipped).length };
}
