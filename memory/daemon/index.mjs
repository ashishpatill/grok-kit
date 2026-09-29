/**
 * memory-daemon (P1.M7) — wake → reconcile → drain pg-boss jobs → sleep.
 *
 * Production: POST https://<daemon>.tailnet:8443/wake via `tailscale serve --bg`
 * Dev/spike:  POST http://127.0.0.1:$PORT/wake with Authorization: Bearer $WAKE_TOKEN
 *
 * Sleeps with no DB connections. On /wake:
 *   connect → reconcile (enqueue embed for NULL embeddings) → drain up to N jobs
 *   via workers (embed/score/dedup) → close → sleep.
 */
import http from 'node:http';
import { performance } from 'node:perf_hooks';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import pg from 'pg';
import { PgBoss } from 'pg-boss';
import { dispatchJob } from '../workers/dispatch.mjs';
import { listNeedsEmbed, chainJobsFor } from '../workers/reconcile.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

const PORT = Number(process.env.PORT || 8787);
const WAKE_TOKEN = process.env.WAKE_TOKEN;
const DATABASE_URL = process.env.DATABASE_URL;
const QUEUE = process.env.MEMORY_QUEUE || 'memory-embed';
const SELF_WAKE_MS = process.env.SELF_WAKE_MS ? Number(process.env.SELF_WAKE_MS) : 0;
const DRAIN_BATCH = Number(process.env.DRAIN_BATCH || 5);
const RECONCILE_LIMIT = Number(process.env.RECONCILE_LIMIT || 50);

if (!DATABASE_URL) {
  console.error('[daemon] DATABASE_URL missing (.env.local)');
  process.exit(1);
}
if (!WAKE_TOKEN) {
  console.error('[daemon] WAKE_TOKEN missing (.env.local)');
  process.exit(1);
}

let waking = false;
/** @type {Array<object>} */
const wakeLog = [];

function authOk(req) {
  const h = req.headers.authorization || '';
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m && m[1] === WAKE_TOKEN;
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function makeDb(pool) {
  return { query: (sql, params) => pool.query(sql, params) };
}

async function drainOnce(meta = {}) {
  const tWake = performance.now();
  const marks = { tWake };
  const results = [];

  const pool = new pg.Pool({
    connectionString: DATABASE_URL,
    max: 2,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 20_000,
  });
  const db = makeDb(pool);

  const boss = new PgBoss({
    connectionString: DATABASE_URL,
    migrate: true,
    supervise: false,
    schedule: false,
  });
  boss.on('error', (err) => console.error('[daemon] pg-boss error', err.message));

  await boss.start();
  marks.tBossStarted = performance.now();

  try {
    await boss.createQueue(QUEUE);
  } catch {
    /* exists */
  }
  marks.tQueueReady = performance.now();

  let reconcileEnqueued = 0;
  try {
    const needs = await listNeedsEmbed(db, { limit: RECONCILE_LIMIT });
    for (const id of needs) {
      for (const payload of chainJobsFor(id)) {
        const opts = { singletonKey: `${payload.kind}:${id}` };
        try {
          await boss.send(QUEUE, payload, opts);
          reconcileEnqueued += 1;
        } catch {
          /* singleton collision = already queued */
        }
      }
    }
  } catch (e) {
    console.error('[daemon] reconcile failed', e.message);
  }
  marks.tReconciled = performance.now();

  let firstTouchKind = 'none';
  marks.tFirstNeonTouch = performance.now();

  for (let i = 0; i < DRAIN_BATCH; i++) {
    const jobs = await boss.fetch(QUEUE, { batchSize: 1 });
    if (i === 0) {
      marks.tFirstNeonTouch = performance.now();
      firstTouchKind = jobs?.length ? 'fetch' : 'select_fallback';
      if (!jobs?.length) {
        await db.query(`SELECT 1 AS ok`);
      }
    }
    if (!jobs?.length) break;

    const job = jobs[0];
    let handlerResult;
    try {
      handlerResult = await dispatchJob(db, job.data || {});
      await boss.complete(QUEUE, job.id, {
        ok: true,
        drained_at: new Date().toISOString(),
        handler: handlerResult,
        ...meta,
      });
    } catch (err) {
      handlerResult = { ok: false, error: String(err.message || err) };
      try {
        await boss.fail(QUEUE, job.id, handlerResult);
      } catch (fe) {
        console.error('[daemon] fail job error', fe.message);
      }
    }
    results.push({
      job_id: job.id,
      kind: job.data?.kind || null,
      memory_id: job.data?.memory_id || null,
      handler: handlerResult,
    });
  }

  marks.tDrained = performance.now();
  await boss.stop({ graceful: false, timeout: 5_000 });
  await pool.end().catch(() => {});
  marks.tStopped = performance.now();

  const coldStartMs = marks.tFirstNeonTouch - marks.tWake;
  const result = {
    ok: true,
    queue: QUEUE,
    reconcile_enqueued: reconcileEnqueued,
    drained: results.length,
    jobs: results,
    job_id: results[0]?.job_id || null,
    first_touch_kind: firstTouchKind,
    cold_start_ms: Number(coldStartMs.toFixed(2)),
    phases_ms: {
      boss_start: Number((marks.tBossStarted - marks.tWake).toFixed(2)),
      queue_ready: Number((marks.tQueueReady - marks.tBossStarted).toFixed(2)),
      reconcile: Number((marks.tReconciled - marks.tQueueReady).toFixed(2)),
      first_neon_touch: Number((marks.tFirstNeonTouch - marks.tWake).toFixed(2)),
      drain_total: Number((marks.tDrained - marks.tWake).toFixed(2)),
      stop: Number((marks.tStopped - marks.tDrained).toFixed(2)),
      wall: Number((marks.tStopped - marks.tWake).toFixed(2)),
    },
    target_ms: 2000,
    pass: coldStartMs < 2000 || results.length > 0,
    at: new Date().toISOString(),
    note: 'P1.M7: real embed/score/dedup workers. Prod wake = Tailscale serve.',
  };
  wakeLog.push(result);
  return result;
}

async function handleWake(req, res) {
  if (!authOk(req)) {
    res.writeHead(401, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'unauthorized' }));
    return;
  }
  if (waking) {
    res.writeHead(409, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'already_waking' }));
    return;
  }
  waking = true;
  try {
    const body = await readJson(req).catch(() => ({}));
    console.log(`[daemon] wake received source=${body.source || 'http'} — connecting…`);
    const result = await drainOnce({ source: body.source || 'http' });
    console.log(
      `[daemon] wake done cold_start_ms=${result.cold_start_ms} drained=${result.drained} reconcile=${result.reconcile_enqueued}`
    );
    console.log(`[daemon] phases`, JSON.stringify(result.phases_ms));
    console.log('[daemon] sleeping (connections closed)');
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(result));
  } catch (err) {
    console.error('[daemon] wake failed', err);
    res.writeHead(500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: String(err.message || err) }));
  } finally {
    waking = false;
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
  if (req.method === 'POST' && url.pathname === '/wake') {
    return handleWake(req, res);
  }
  if (req.method === 'GET' && url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ status: 'sleeping', wakes: wakeLog.length, last: wakeLog.at(-1) || null }));
    return;
  }
  if (req.method === 'GET' && url.pathname === '/log') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(wakeLog, null, 2));
    return;
  }
  res.writeHead(404, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: 'not_found' }));
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[daemon] listening http://127.0.0.1:${PORT} (localhost; prod = Tailscale serve)`);
  console.log(`[daemon] sleeping — POST /wake drains up to ${DRAIN_BATCH} ${QUEUE} jobs (embed/score/dedup)`);
  if (SELF_WAKE_MS > 0) {
    console.log(`[daemon] self-wake scheduled in ${SELF_WAKE_MS}ms`);
    setTimeout(async () => {
      try {
        const r = await fetch(`http://127.0.0.1:${PORT}/wake`, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${WAKE_TOKEN}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ source: 'self-wake-timer' }),
        });
        const j = await r.json();
        console.log(`[daemon] self-wake result drained=${j.drained} cold_start_ms=${j.cold_start_ms}`);
      } catch (e) {
        console.error('[daemon] self-wake failed', e.message);
      }
    }, SELF_WAKE_MS);
  }
});
