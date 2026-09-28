/**
 * memory-daemon (B0 spike) — local stand-in for Tailscale wake.
 *
 * Production: POST https://<daemon>.tailnet:8443/wake via `tailscale serve --bg`
 * Spike:      POST http://127.0.0.1:$PORT/wake with Authorization: Bearer $WAKE_TOKEN
 *
 * Sleeps with no DB connections. On /wake: connect → drain one pg-boss job → close → sleep.
 *
 * Adapted to schema v1.sql: memory ids are TEXT (not uuid).
 */
import http from 'node:http';
import { performance } from 'node:perf_hooks';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { PgBoss } from 'pg-boss';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

const PORT = Number(process.env.PORT || 8787);
const WAKE_TOKEN = process.env.WAKE_TOKEN;
const DATABASE_URL = process.env.DATABASE_URL;
const QUEUE = process.env.MEMORY_QUEUE || 'memory-embed';
const SELF_WAKE_MS = process.env.SELF_WAKE_MS ? Number(process.env.SELF_WAKE_MS) : 0;

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

/**
 * Cold-start chain: webhook received → first Neon row touch.
 * Uses pg-boss fetch (one job). If queue empty, still touches Neon via SELECT 1
 * so we always get a cold-start timing.
 */
async function drainOnce(meta = {}) {
  const tWake = performance.now();
  const marks = { tWake };

  const boss = new PgBoss({
    connectionString: DATABASE_URL,
    // Spike: no LISTEN (Neon pooler + scale-to-zero); fetch is enough.
    // migrate:true creates pgboss schema on first start.
    migrate: true,
    supervise: false,
    schedule: false,
  });
  boss.on('error', (err) => console.error('[daemon] pg-boss error', err.message));

  await boss.start();
  marks.tBossStarted = performance.now();

  // Ensure queue exists (idempotent)
  try {
    await boss.createQueue(QUEUE);
  } catch {
    // already exists
  }
  marks.tQueueReady = performance.now();

  // First Neon row touch — prefer claiming a job; else a trivial SELECT via getDb
  let job = null;
  let firstTouchKind = 'fetch';
  const jobs = await boss.fetch(QUEUE, { batchSize: 1 });
  marks.tFirstNeonTouch = performance.now();

  if (jobs && jobs.length) {
    job = jobs[0];
    // Simulate embed worker: touch memories table once
    // v1.sql: id is TEXT (ULID-ish), not uuid — no ::uuid cast
    const db = await boss.getDb();
    await db.executeSql(
      `SELECT id FROM memories WHERE id = $1 OR $1 IS NULL LIMIT 1`,
      [job.data?.memory_id || null]
    );
    await boss.complete(QUEUE, job.id, {
      ok: true,
      drained_at: new Date().toISOString(),
      spike: 'B0',
      ...meta,
    });
  } else {
    firstTouchKind = 'select_fallback';
    const db = await boss.getDb();
    await db.executeSql(`SELECT 1 AS ok FROM memories LIMIT 1`);
    marks.tFirstNeonTouch = performance.now(); // refine if fetch returned empty quickly
  }

  marks.tDrained = performance.now();
  await boss.stop({ graceful: false, timeout: 5_000 });
  marks.tStopped = performance.now();

  const coldStartMs = marks.tFirstNeonTouch - marks.tWake;
  const result = {
    ok: true,
    queue: QUEUE,
    job_id: job?.id || null,
    job_data: job?.data || null,
    first_touch_kind: firstTouchKind,
    cold_start_ms: Number(coldStartMs.toFixed(2)),
    phases_ms: {
      boss_start: Number((marks.tBossStarted - marks.tWake).toFixed(2)),
      queue_ready: Number((marks.tQueueReady - marks.tBossStarted).toFixed(2)),
      first_neon_touch: Number((marks.tFirstNeonTouch - marks.tWake).toFixed(2)),
      drain_total: Number((marks.tDrained - marks.tWake).toFixed(2)),
      stop: Number((marks.tStopped - marks.tDrained).toFixed(2)),
      wall: Number((marks.tStopped - marks.tWake).toFixed(2)),
    },
    target_ms: 2000,
    pass: coldStartMs < 2000,
    at: new Date().toISOString(),
    note: 'Spike uses localhost only. Production wake = Tailscale serve (tailnet HTTPS), never funnel/public.',
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
      `[daemon] wake done cold_start_ms=${result.cold_start_ms} pass=${result.pass} job=${result.job_id || 'none'} kind=${result.first_touch_kind}`
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
  console.log(`[daemon] listening http://127.0.0.1:${PORT} (localhost spike; prod = Tailscale serve)`);
  console.log(`[daemon] sleeping — POST /wake with bearer token to drain one ${QUEUE} job`);
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
        console.log(`[daemon] self-wake result cold_start_ms=${j.cold_start_ms} pass=${j.pass}`);
      } catch (e) {
        console.error('[daemon] self-wake failed', e.message);
      }
    }, SELF_WAKE_MS);
  }
});

process.on('SIGINT', () => {
  console.log('[daemon] shutting down');
  server.close(() => process.exit(0));
});
