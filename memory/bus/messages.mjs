/**
 * P3.B2 — message.send (contracted handoff; fail closed on missing evidence).
 */
import { randomUUID } from 'node:crypto';
import { hasEvidence, LIFECYCLE } from './types.mjs';

/**
 * @param {import('pg').Pool|{query: Function}} pool
 * @param {{ from: string, to: string, ask: string, evidence?: any[], memory_refs?: string[], meta?: object, id?: string }} payload
 */
export async function sendMessage(pool, payload) {
  const from = payload?.from || payload?.from_bot;
  const to = payload?.to || payload?.to_bot;
  const ask = payload?.ask;
  const evidence = payload?.evidence ?? [];
  const memory_refs = payload?.memory_refs ?? [];
  const meta = payload?.meta ?? {};

  if (!from || !to || !ask) {
    const err = new Error('message.send requires from, to, ask');
    err.code = 'bus_invalid';
    throw err;
  }
  if (!hasEvidence({ evidence, memory_refs })) {
    const err = new Error('message.send fail-closed: evidence or memory_refs required');
    err.code = 'bus_no_evidence';
    throw err;
  }

  const id = payload.id || `msg_${randomUUID()}`;
  const { rows } = await pool.query(
    `INSERT INTO bus_messages
       (id, msg_type, from_bot, to_bot, ask, evidence, memory_refs, status, meta)
     VALUES ($1, 'message.send', $2, $3, $4, $5::jsonb, $6::text[], 'submitted', $7::jsonb)
     RETURNING *`,
    [
      id,
      from,
      to,
      ask,
      JSON.stringify(evidence),
      memory_refs,
      JSON.stringify(meta),
    ],
  );
  return rows[0];
}

export async function getMessage(pool, id) {
  const { rows } = await pool.query(`SELECT * FROM bus_messages WHERE id = $1`, [id]);
  return rows[0] || null;
}

/** Optional status bump (same lifecycle vocabulary as tasks). */
export async function updateMessageStatus(pool, id, status) {
  if (!LIFECYCLE.includes(status)) {
    const err = new Error(`invalid status: ${status}`);
    err.code = 'bus_invalid_status';
    throw err;
  }
  const { rows } = await pool.query(
    `UPDATE bus_messages SET status = $2 WHERE id = $1 RETURNING *`,
    [id, status],
  );
  return rows[0] || null;
}
