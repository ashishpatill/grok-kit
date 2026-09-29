/**
 * P1.M7 reconcile sweep on daemon wake.
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
