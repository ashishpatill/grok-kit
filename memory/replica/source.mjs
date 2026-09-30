/**
 * P2.R1 — sync_log change-feed sources (stub fixture + Neon pg).
 *
 * Pull contract: WHERE seq > last_token, join memories, return ordered deltas.
 */

/**
 * @typedef {object} SyncDelta
 * @property {number} seq
 * @property {string} memory_id
 * @property {'insert'|'update'|'retire'} op
 * @property {string|Date} [created_at]
 * @property {object|null} memory  joined memory row (null if deleted/missing)
 */

/**
 * In-memory stub source for unit/smoke (no Neon).
 * @param {{ sync_log: object[], memories: object[] }} fixture
 */
export function createStubSource(fixture) {
  const syncLog = [...(fixture.sync_log || [])].sort((a, b) => Number(a.seq) - Number(b.seq));
  const byId = new Map((fixture.memories || []).map((m) => [m.id, m]));
  let sourceMax = syncLog.reduce((m, r) => Math.max(m, Number(r.seq)), 0);

  return {
    kind: 'stub',
    async getSourceMaxSeq() {
      return sourceMax;
    },
    /**
     * @param {number} lastToken
     * @param {{ limit?: number }} [opts]
     * @returns {Promise<SyncDelta[]>}
     */
    async fetchDeltas(lastToken, opts = {}) {
      const limit = opts.limit ?? 5000;
      const out = [];
      for (const row of syncLog) {
        if (Number(row.seq) <= Number(lastToken)) continue;
        out.push({
          seq: Number(row.seq),
          memory_id: row.memory_id,
          op: row.op,
          created_at: row.created_at || null,
          memory: byId.get(row.memory_id) || null,
        });
        if (out.length >= limit) break;
      }
      return out;
    },
  };
}

/**
 * Neon / Postgres source via pg Pool (or any { query } client).
 * @param {{ query: Function }} db  pg Pool or client
 */
export function createPgSource(db) {
  return {
    kind: 'neon',
    async getSourceMaxSeq() {
      const { rows } = await db.query('SELECT COALESCE(MAX(seq), 0)::bigint AS m FROM sync_log');
      return Number(rows[0]?.m || 0);
    },
    /**
     * @param {number} lastToken
     * @param {{ limit?: number }} [opts]
     */
    async fetchDeltas(lastToken, opts = {}) {
      const limit = opts.limit ?? 5000;
      const { rows } = await db.query(
        `SELECT
           s.seq::bigint AS seq,
           s.memory_id,
           s.op,
           s.created_at AS sync_created_at,
           m.id,
           m.namespace,
           m.type,
           m.scope,
           m.text,
           m.importance,
           m.strength,
           m.pinned,
           m.approval,
           m.valid_from,
           m.valid_to,
           m.created_at,
           m.updated_at,
           m.grounding_ids,
           m.provenance
         FROM sync_log s
         LEFT JOIN memories m ON m.id = s.memory_id
         WHERE s.seq > $1
         ORDER BY s.seq ASC
         LIMIT $2`,
        [Number(lastToken) || 0, limit]
      );
      return rows.map((r) => ({
        seq: Number(r.seq),
        memory_id: r.memory_id,
        op: r.op,
        created_at: r.sync_created_at,
        memory: r.id
          ? {
              id: r.id,
              namespace: r.namespace,
              type: r.type,
              scope: r.scope,
              text: r.text,
              importance: r.importance,
              strength: r.strength,
              pinned: r.pinned,
              approval: r.approval,
              valid_from: r.valid_from,
              valid_to: r.valid_to,
              created_at: r.created_at,
              updated_at: r.updated_at,
              grounding_ids: r.grounding_ids,
              provenance: r.provenance,
            }
          : null,
      }));
    },
  };
}
