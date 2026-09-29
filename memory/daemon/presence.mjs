/**
 * Daemon presence (X1+X2): heartbeat write + online/offline check.
 *
 * The daemon upserts its heartbeat on every wake and while awake. Any reader
 * (bot, remote side, operator) decides online/offline by staleness — there is
 * no central registry to consult.
 */
export async function beat(pool, node, version = null, meta = {}) {
  await pool.query(
    `INSERT INTO daemon_presence (node, last_beat, version, meta)
     VALUES ($1, now(), $2, $3::jsonb)
     ON CONFLICT (node) DO UPDATE
       SET last_beat = now(), version = EXCLUDED.version, meta = EXCLUDED.meta`,
    [node, version, JSON.stringify(meta)],
  );
}

/**
 * @returns {{ online: boolean, lastBeat: Date|null, ageSecs: number|null }}
 */
export async function checkPresence(pool, node, thresholdSecs = 300) {
  const { rows } = await pool.query(
    `SELECT last_beat FROM daemon_presence WHERE node = $1`,
    [node],
  );
  if (rows.length === 0) return { online: false, lastBeat: null, ageSecs: null };
  const ageSecs = (Date.now() - new Date(rows[0].last_beat).getTime()) / 1000;
  return { online: ageSecs <= thresholdSecs, lastBeat: rows[0].last_beat, ageSecs };
}
