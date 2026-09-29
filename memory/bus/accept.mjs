/**
 * Bus accept — daemon/graph entrypoint for the 6 A2A vocabulary types.
 * Horizontal bot↔bot only; MCP remains for memory/tools.
 */
import { beat, checkPresence } from '../daemon/presence.mjs';
import { sendMessage } from './messages.mjs';
import { requestTask, updateTask, cancelTask } from './tasks.mjs';
import { wakeRequest } from './wake.mjs';
import { assertType, MESSAGE_TYPES } from './types.mjs';

export { MESSAGE_TYPES };

/**
 * @param {import('pg').Pool|{query: Function}|null} pool  — required for all but wake.request
 * @param {{ type: string, [k: string]: any }} envelope
 * @param {{ wake?: object }} [opts]  — wake opts (url/token/fetchImpl) for wake.request
 */
export async function accept(pool, envelope, opts = {}) {
  const type = envelope?.type;
  assertType(type);

  switch (type) {
    case 'presence.heartbeat': {
      if (!pool) throw Object.assign(new Error('pool required'), { code: 'bus_no_pool' });
      const node = envelope.node || envelope.from || envelope.from_bot;
      if (!node) {
        const err = new Error('presence.heartbeat requires node (or from)');
        err.code = 'bus_invalid';
        throw err;
      }
      await beat(pool, node, envelope.version ?? null, envelope.meta ?? {});
      const presence = await checkPresence(pool, node, envelope.thresholdSecs ?? 300);
      return { type, ok: true, node, presence };
    }

    case 'message.send': {
      if (!pool) throw Object.assign(new Error('pool required'), { code: 'bus_no_pool' });
      const row = await sendMessage(pool, envelope);
      return { type, ok: true, message: row };
    }

    case 'task.request': {
      if (!pool) throw Object.assign(new Error('pool required'), { code: 'bus_no_pool' });
      const row = await requestTask(pool, envelope);
      return { type, ok: true, task: row };
    }

    case 'task.update': {
      if (!pool) throw Object.assign(new Error('pool required'), { code: 'bus_no_pool' });
      const row = await updateTask(pool, envelope);
      return { type, ok: true, task: row };
    }

    case 'task.cancel': {
      if (!pool) throw Object.assign(new Error('pool required'), { code: 'bus_no_pool' });
      const row = await cancelTask(pool, envelope);
      return { type, ok: true, task: row };
    }

    case 'wake.request': {
      const result = await wakeRequest({ ...opts.wake, ...envelope, type: undefined });
      return { type, ok: result.ok, wake: result };
    }

    default: {
      // assertType already guards; keep exhaustiveness
      const err = new Error(`unhandled type: ${type}`);
      err.code = 'bus_unknown_type';
      throw err;
    }
  }
}

/** List peers that beat within thresholdSecs (online registry view). */
export async function listOnline(pool, thresholdSecs = 300) {
  const { rows } = await pool.query(
    `SELECT node, last_beat, version, meta,
            EXTRACT(EPOCH FROM (now() - last_beat))::float AS age_secs
     FROM daemon_presence
     WHERE last_beat >= now() - make_interval(secs => $1)
     ORDER BY last_beat DESC`,
    [thresholdSecs],
  );
  return rows.map((r) => ({
    node: r.node,
    online: true,
    lastBeat: r.last_beat,
    ageSecs: r.age_secs,
    version: r.version,
    meta: r.meta,
  }));
}
