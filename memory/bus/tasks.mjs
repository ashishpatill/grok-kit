/**
 * P3.B3 — task.request / task.update / task.cancel
 * Minimal lifecycle on bus_tasks; also emits outbox (004) for graph consumers.
 */
import { randomUUID } from 'node:crypto';
import { canTransition, hasEvidence, LIFECYCLE, TERMINAL } from './types.mjs';

async function emitOutbox(pool, topic, payload, { from_bot, to_bot, run_id, trace_id } = {}) {
  try {
    await pool.query(
      `INSERT INTO outbox (topic, payload, trace_id, from_node, to_node, run_id, status)
       VALUES ($1, $2::jsonb, $3, $4, $5, $6, 'pending')`,
      [
        topic,
        JSON.stringify(payload),
        trace_id || payload.id || null,
        from_bot || null,
        to_bot || null,
        run_id || null,
      ],
    );
  } catch (e) {
    // outbox may be absent in pure stub DBs — callers that need it use live Neon.
    if (e?.code === '42P01') return; // undefined_table
    throw e;
  }
}

/**
 * task.request — create a task in `submitted`.
 * Evidence gate matches message.send (fail closed).
 */
export async function requestTask(pool, payload) {
  const from = payload?.from || payload?.from_bot;
  const to = payload?.to || payload?.to_bot || null;
  const ask = payload?.ask;
  const evidence = payload?.evidence ?? [];
  const memory_refs = payload?.memory_refs ?? [];
  const run_id = payload?.run_id || null;
  const meta = payload?.meta ?? {};

  if (!from || !ask) {
    const err = new Error('task.request requires from, ask');
    err.code = 'bus_invalid';
    throw err;
  }
  if (!hasEvidence({ evidence, memory_refs })) {
    const err = new Error('task.request fail-closed: evidence or memory_refs required');
    err.code = 'bus_no_evidence';
    throw err;
  }

  const id = payload.id || `task_${randomUUID()}`;
  const { rows } = await pool.query(
    `INSERT INTO bus_tasks
       (id, from_bot, to_bot, ask, evidence, memory_refs, status, run_id, meta)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6::text[], 'submitted', $7, $8::jsonb)
     RETURNING *`,
    [
      id,
      from,
      to,
      ask,
      JSON.stringify(evidence),
      memory_refs,
      run_id,
      JSON.stringify(meta),
    ],
  );
  const row = rows[0];
  await emitOutbox(
    pool,
    'task.request',
    { id: row.id, ask: row.ask, status: row.status, memory_refs: row.memory_refs },
    { from_bot: from, to_bot: to, run_id, trace_id: row.id },
  );
  return row;
}

/**
 * task.update — status (+ optional result). Enforces lifecycle transitions.
 */
export async function updateTask(pool, payload) {
  const id = payload?.id || payload?.task_id;
  const status = payload?.status;
  if (!id || !status) {
    const err = new Error('task.update requires id, status');
    err.code = 'bus_invalid';
    throw err;
  }
  if (!LIFECYCLE.includes(status)) {
    const err = new Error(`invalid status: ${status}`);
    err.code = 'bus_invalid_status';
    throw err;
  }

  const cur = await getTask(pool, id);
  if (!cur) {
    const err = new Error(`task not found: ${id}`);
    err.code = 'bus_not_found';
    throw err;
  }
  if (!canTransition(cur.status, status)) {
    const err = new Error(`illegal transition ${cur.status} → ${status}`);
    err.code = 'bus_bad_transition';
    throw err;
  }

  const result = payload.result !== undefined ? payload.result : cur.result;
  const { rows } = await pool.query(
    `UPDATE bus_tasks SET status = $2, result = $3::jsonb WHERE id = $1 RETURNING *`,
    [id, status, JSON.stringify(result ?? {})],
  );
  const row = rows[0];
  await emitOutbox(
    pool,
    'task.update',
    { id: row.id, status: row.status, result: row.result },
    { from_bot: row.from_bot, to_bot: row.to_bot, run_id: row.run_id, trace_id: row.id },
  );
  return row;
}

/** task.cancel — force canceled unless already terminal completed/failed. */
export async function cancelTask(pool, payload) {
  const id = payload?.id || payload?.task_id;
  if (!id) {
    const err = new Error('task.cancel requires id');
    err.code = 'bus_invalid';
    throw err;
  }
  const cur = await getTask(pool, id);
  if (!cur) {
    const err = new Error(`task not found: ${id}`);
    err.code = 'bus_not_found';
    throw err;
  }
  if (cur.status === 'canceled') return cur;
  if (TERMINAL.includes(cur.status) && cur.status !== 'canceled') {
    const err = new Error(`cannot cancel terminal task in status ${cur.status}`);
    err.code = 'bus_bad_transition';
    throw err;
  }
  return updateTask(pool, { id, status: 'canceled', result: payload?.result });
}

export async function getTask(pool, id) {
  const { rows } = await pool.query(`SELECT * FROM bus_tasks WHERE id = $1`, [id]);
  return rows[0] || null;
}
