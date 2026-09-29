/**
 * Bidirectional replica sync (X1+X2): local daemon replica <-> always-on store.
 *
 * One account has ONE always-on store (Neon) and N daemons, each with its own
 * local replica and its own cursors. Cursors live in the daemon's LOCAL
 * sync_state table, so a wiped replica safely re-pulls from scratch.
 *
 *   pull(remote, local): catch the replica up from the store's sync_log.
 *   push(local, remote): catch the store up from the replica's sync_log.
 *
 * Conflict rule: newer updated_at wins (per-row). Cross-daemon semantic
 * conflicts resolve through the evidence-weighing workflow (P3), not here.
 */
const BATCH = 500;

const MEM_COLS = [
  'id', 'namespace', 'type', 'scope', 'node_id', 'edge_id', 'text',
  'embedding', 'index_status', 'importance', 'strength', 'version', 'pinned',
  'approval', 'superseded_by', 'merged_into', 'valid_from', 'valid_to',
  'last_recalled_at', 'grounding_ids', 'links', 'provenance',
  'created_at', 'updated_at',
];

async function getCursor(localPool, key) {
  const { rows } = await localPool.query(
    `SELECT last_seq FROM sync_state WHERE key = $1`, [key]);
  return rows.length ? Number(rows[0].last_seq) : 0;
}

async function setCursor(localPool, key, seq) {
  await localPool.query(
    `INSERT INTO sync_state (key, last_seq, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET last_seq = EXCLUDED.last_seq, updated_at = now()`,
    [key, seq]);
}

async function applyBatch(sourcePool, targetClient, entries) {
  const ids = entries.map((e) => e.memory_id);
  const { rows } = await sourcePool.query(
    `SELECT ${MEM_COLS.join(', ')} FROM memories WHERE id = ANY($1::text[])`, [ids]);
  const byId = new Map(rows.map((r) => [r.id, r]));
  let applied = 0;
  await targetClient.query('BEGIN');
  await targetClient.query(`SET LOCAL sync.is_replica_apply = '1'`);
  try {
    for (const e of entries) {
      const src = byId.get(e.memory_id);
      if (!src) continue; // source row deleted; nothing to apply
      const vals = MEM_COLS.map((c) => src[c]);
      const placeholders = vals.map((_, i) => `$${i + 1}`).join(', ');
      const updates = MEM_COLS.filter((c) => c !== 'id')
        .map((c) => `${c} = EXCLUDED.${c}`).join(', ');
      // newer updated_at wins; ties keep the target row (idempotent re-pull)
      const res = await targetClient.query(
        `INSERT INTO memories (${MEM_COLS.join(', ')}) VALUES (${placeholders})
         ON CONFLICT (id) DO UPDATE SET ${updates}
         WHERE memories.updated_at < EXCLUDED.updated_at`,
        vals);
      if (e.op === 'retire') {
        await targetClient.query(
          `UPDATE memories SET approval = 'retired', updated_at = now()
           WHERE id = $1 AND approval <> 'retired'`, [e.memory_id]);
      }
      applied += res.rowCount ?? 0;
    }
    await targetClient.query('COMMIT');
  } catch (err) {
    await targetClient.query('ROLLBACK').catch(() => {});
    throw err;
  }
  return applied;
}

async function syncDirection(sourcePool, targetPool, cursorPool, cursorKey) {
  let cursor = await getCursor(cursorPool, cursorKey);
  let total = 0, applied = 0, maxSeq = cursor;
  const targetClient = await targetPool.connect();
  try {
    for (;;) {
      const { rows } = await sourcePool.query(
        `SELECT seq, memory_id, op FROM sync_log WHERE seq > $1 ORDER BY seq LIMIT ${BATCH}`,
        [cursor]);
      if (!rows.length) break;
      applied += await applyBatch(sourcePool, targetClient, rows);
      total += rows.length;
      maxSeq = Number(rows[rows.length - 1].seq);
      cursor = maxSeq;
      await setCursor(cursorPool, cursorKey, maxSeq);
      if (rows.length < BATCH) break;
    }
  } finally {
    targetClient.release();
  }
  return { scanned: total, applied, cursor: maxSeq };
}

/** Pull: store -> replica. */
export function pull(remotePool, localPool) {
  return syncDirection(remotePool, localPool, localPool, 'pull:remote->local');
}

/** Push: replica -> store. */
export function push(localPool, remotePool) {
  return syncDirection(localPool, remotePool, localPool, 'push:local->remote');
}
