/**
 * Neon-backed blackboard + outbox accessors (P1.G1).
 * Uses `pg` Pool; works with stub Pool-like objects in smoke tests.
 */
import type { BlackboardRow, OutboxRow, OutboxStatus } from './types.ts';

export type Queryable = {
  query: (text: string, params?: unknown[]) => Promise<{ rows: any[] }>;
};

export async function blackboardPut(
  db: Queryable,
  opts: {
    run_id?: string;
    key: string;
    value: unknown;
    updated_by?: string;
  }
): Promise<BlackboardRow> {
  const run_id = opts.run_id || 'global';
  const r = await db.query(
    `INSERT INTO blackboard (run_id, key, value, updated_by)
     VALUES ($1, $2, $3::jsonb, $4)
     ON CONFLICT (run_id, key) DO UPDATE SET
       value = EXCLUDED.value,
       version = blackboard.version + 1,
       updated_by = EXCLUDED.updated_by,
       updated_at = now()
     RETURNING id, run_id, key, value, version, updated_by,
               created_at::text, updated_at::text`,
    [run_id, opts.key, JSON.stringify(opts.value ?? {}), opts.updated_by ?? null]
  );
  return r.rows[0] as BlackboardRow;
}

export async function blackboardGet(
  db: Queryable,
  opts: { run_id?: string; key: string }
): Promise<BlackboardRow | null> {
  const run_id = opts.run_id || 'global';
  const r = await db.query(
    `SELECT id, run_id, key, value, version, updated_by,
            created_at::text, updated_at::text
     FROM blackboard WHERE run_id = $1 AND key = $2`,
    [run_id, opts.key]
  );
  return (r.rows[0] as BlackboardRow) || null;
}

export async function outboxEnqueue(
  db: Queryable,
  opts: {
    topic: string;
    payload?: unknown;
    trace_id?: string;
    from_node?: string;
    to_node?: string;
    run_id?: string;
  }
): Promise<OutboxRow> {
  const r = await db.query(
    `INSERT INTO outbox (topic, payload, trace_id, from_node, to_node, run_id)
     VALUES ($1, $2::jsonb, $3, $4, $5, $6)
     RETURNING id, topic, payload, trace_id, from_node, to_node, run_id, status,
               created_at::text, claimed_at::text, done_at::text`,
    [
      opts.topic,
      JSON.stringify(opts.payload ?? {}),
      opts.trace_id ?? null,
      opts.from_node ?? null,
      opts.to_node ?? null,
      opts.run_id ?? null,
    ]
  );
  return r.rows[0] as OutboxRow;
}

export async function outboxClaimNext(
  db: Queryable,
  opts: { topics?: string[]; claimer?: string } = {}
): Promise<OutboxRow | null> {
  const topics = opts.topics;
  const r = topics?.length
    ? await db.query(
        `UPDATE outbox SET status = 'claimed', claimed_at = now()
         WHERE id = (
           SELECT id FROM outbox
           WHERE status = 'pending' AND topic = ANY($1::text[])
           ORDER BY created_at ASC
           FOR UPDATE SKIP LOCKED
           LIMIT 1
         )
         RETURNING id, topic, payload, trace_id, from_node, to_node, run_id, status,
                   created_at::text, claimed_at::text, done_at::text`,
        [topics]
      )
    : await db.query(
        `UPDATE outbox SET status = 'claimed', claimed_at = now()
         WHERE id = (
           SELECT id FROM outbox
           WHERE status = 'pending'
           ORDER BY created_at ASC
           FOR UPDATE SKIP LOCKED
           LIMIT 1
         )
         RETURNING id, topic, payload, trace_id, from_node, to_node, run_id, status,
                   created_at::text, claimed_at::text, done_at::text`
      );
  return (r.rows[0] as OutboxRow) || null;
}

export async function outboxComplete(
  db: Queryable,
  id: number,
  status: Extract<OutboxStatus, 'done' | 'dead'> = 'done'
): Promise<OutboxRow | null> {
  const r = await db.query(
    `UPDATE outbox SET status = $2, done_at = now()
     WHERE id = $1
     RETURNING id, topic, payload, trace_id, from_node, to_node, run_id, status,
               created_at::text, claimed_at::text, done_at::text`,
    [id, status]
  );
  return (r.rows[0] as OutboxRow) || null;
}
