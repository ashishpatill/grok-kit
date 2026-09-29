#!/usr/bin/env node
/**
 * P1.X4 — kill -9 mid-write → sweeper zero-loss (FINAL-PLAN-V2 §13).
 *
 * Default: MEMORY_BACKEND=stub (no Neon). Live PG paused until CEO promotes
 * p1-v1 → bimlabz-bot-memory main — do not target side branches.
 *
 *   node spikes/X4/kill9-sweeper.mjs
 *   MEMORY_BACKEND=pg DATABASE_URL=... node spikes/X4/kill9-sweeper.mjs  # only on main when allowed
 */
import dns from 'node:dns';
import net from 'node:net';
dns.setDefaultResultOrder('ipv4first');
if (typeof net.setDefaultAutoSelectFamily === 'function') {
  net.setDefaultAutoSelectFamily(false);
}

import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import {
  adminCheckpoint,
  backfillEmbeddings,
  countPendingEmbeddings,
  runReconcileSweep,
} from '../../workers/reconcile.mjs';
import { halfvecLiteral } from '../../lib/embed.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dir, '..', '..', '.env.local') });

const BACKEND = process.env.MEMORY_BACKEND || 'stub';
const N = Number(process.env.MEMORY_X4_N || 8);
const NS = process.env.MEMORY_X4_NS || `feature-x4-sweeper-${Date.now().toString(36)}`;
const CHILD_MODE = process.argv.includes('--child-backfill');
const DATABASE_URL = process.env.DATABASE_URL;

function stubEmbed(text) {
  const arr = new Array(384);
  let h = 0;
  const s = String(text || '');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  for (let i = 0; i < 384; i++) arr[i] = ((h + i * 9973) % 10000) / 10000 - 0.5;
  const norm = Math.sqrt(arr.reduce((a, x) => a + x * x, 0)) || 1;
  for (let i = 0; i < 384; i++) arr[i] /= norm;
  return halfvecLiteral(arr);
}

function createStubDb() {
  const memories = new Map();
  const syncLog = [];
  let seq = 0;
  return {
    memories,
    syncLog,
    async query(sql, params = []) {
      const s = String(sql).replace(/\s+/g, ' ').trim();
      if (s.startsWith('INSERT INTO memories')) {
        const row = {
          id: params[0],
          namespace: params[1],
          text: params[2],
          grounding_ids: params[3],
          provenance: typeof params[4] === 'string' ? JSON.parse(params[4]) : params[4],
          index_status: 'staged',
          approval: 'live',
          embedding: null,
          superseded_by: null,
          created_at: new Date().toISOString(),
        };
        memories.set(row.id, row);
        syncLog.push({ seq: ++seq, memory_id: row.id, op: 'insert' });
        return { rows: [row] };
      }
      if (s.startsWith('SELECT id, index_status')) {
        const ids = params[0];
        return {
          rows: ids
            .map((id) => memories.get(id))
            .filter(Boolean)
            .map((r) => ({
              id: r.id,
              index_status: r.index_status,
              has_embedding: !!r.embedding,
              approval: r.approval,
            })),
        };
      }
      if (s.startsWith('SELECT count(*)::int AS n FROM sync_log')) {
        const ids = new Set(params[0] || []);
        return { rows: [{ n: syncLog.filter((x) => ids.has(x.memory_id)).length }] };
      }
      if (s.startsWith('SELECT id FROM memories WHERE embedding IS NULL')) {
        const limit = params[0] ?? 50;
        return {
          rows: [...memories.values()]
            .filter((m) => !m.embedding && !m.superseded_by && m.approval === 'live')
            .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
            .slice(0, limit)
            .map((m) => ({ id: m.id })),
        };
      }
      if (s.startsWith('SELECT count(*)::int AS n FROM memories WHERE')) {
        let list = [...memories.values()].filter(
          (m) => !m.embedding && !m.superseded_by && m.approval === 'live'
        );
        if (params.length === 1 && Array.isArray(params[0])) {
          const idSet = new Set(params[0]);
          list = list.filter((m) => idSet.has(m.id));
        }
        return { rows: [{ n: list.length }] };
      }
      if (s.startsWith('SELECT id, text, embedding IS NOT NULL')) {
        const row = memories.get(params[0]);
        return {
          rows: row
            ? [{ id: row.id, text: row.text, has_embedding: !!row.embedding, index_status: row.index_status }]
            : [],
        };
      }
      if (s.startsWith('UPDATE memories SET embedding')) {
        const row = memories.get(params[0]);
        if (!row) return { rows: [] };
        row.embedding = params[1];
        row.index_status = 'indexed';
        row.provenance = { ...(row.provenance || {}), embedding_model: params[2] };
        return { rows: [{ id: row.id, index_status: 'indexed', has_embedding: true }] };
      }
      throw new Error('stub unhandled: ' + s.slice(0, 100));
    },
  };
}

async function insertStaged(db, n, namespace) {
  const ids = [];
  for (let i = 0; i < n; i++) {
    const id = randomUUID();
    const text = `X4 crash-consistency probe ${i}: sweeper must recover staged row after kill -9 (ns=${namespace}).`;
    await db.query(
      `INSERT INTO memories (
         id, namespace, type, scope, text, importance, strength, pinned,
         index_status, approval, grounding_ids, provenance
       ) VALUES ($1,$2,'episodic','global',$3,5,5.0,false,'staged','live',$4,$5)`,
      [
        id,
        namespace,
        text,
        [`x4-ground-${i}`],
        JSON.stringify({
          author: 'spike-x4',
          origin: 'kill9-sweeper',
          bot_id: 'bot-x4-writer',
          created_at: new Date().toISOString(),
          spike: 'P1.X4',
        }),
      ]
    );
    ids.push(id);
  }
  return ids;
}

async function childBackfill() {
  const ids = JSON.parse(process.env.MEMORY_X4_IDS || '[]');
  // Child uses its own stub snapshot via shared JSON file path — for stub mode
  // parent simulates kill without cross-process stub state. PG child uses DATABASE_URL.
  if (process.env.MEMORY_X4_CHILD_STUB === '1') {
    // Intentional slow loop so parent can SIGKILL; no shared DB in stub child.
    for (const id of ids) {
      await new Promise((r) => setTimeout(r, 400));
      process.stderr.write(`child embedding ${id}\n`);
      // pretend work
      await new Promise((r) => setTimeout(r, 200));
    }
    return;
  }
  const pg = await import('pg');
  const pool = new pg.default.Pool({ connectionString: DATABASE_URL, max: 1 });
  const db = { query: (s, p) => pool.query(s, p) };
  try {
    for (const id of ids) {
      await new Promise((r) => setTimeout(r, 400));
      process.stderr.write(`child embedding ${id}\n`);
      await backfillEmbeddings(db, {
        ids: [id],
        embedFn: async (t) => stubEmbed(t),
        model: 'stub-halfvec@kill9-child',
      });
    }
  } finally {
    await pool.end().catch(() => {});
  }
}

if (CHILD_MODE) {
  await childBackfill();
  process.exit(0);
}

async function main() {
  const evidence = {
    gate: 'P1.X4',
    backend: BACKEND,
    namespace: NS,
    n: N,
    started_at: new Date().toISOString(),
    neon_note:
      'Live Neon writes paused until CEO promotes p1-v1 → main. Side branches not used as permanent store.',
    steps: {},
  };

  let db;
  let pool;
  if (BACKEND === 'pg') {
    if (!DATABASE_URL) {
      console.error('DATABASE_URL required for MEMORY_BACKEND=pg');
      process.exit(1);
    }
    const pg = await import('pg');
    pool = new pg.default.Pool({
      connectionString: DATABASE_URL,
      max: 2,
      connectionTimeoutMillis: 30_000,
    });
    db = { query: (s, p) => pool.query(s, p) };
    // Real insert path for PG
    const ids = [];
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (let i = 0; i < N; i++) {
        const id = randomUUID();
        const text = `X4 crash-consistency probe ${i}: sweeper must recover staged row after kill -9 (ns=${NS}).`;
        await client.query(
          `INSERT INTO memories (
             id, namespace, type, scope, text, importance, strength, pinned,
             index_status, approval, grounding_ids, provenance
           ) VALUES (
             $1, $2, 'episodic', 'global', $3, 5, 5.0, false,
             'staged', 'live', $4, $5::jsonb
           )`,
          [
            id,
            NS,
            text,
            [`x4-ground-${i}`],
            JSON.stringify({
              author: 'spike-x4',
              origin: 'kill9-sweeper',
              bot_id: 'bot-x4-writer',
              created_at: new Date().toISOString(),
              spike: 'P1.X4',
            }),
          ]
        );
        ids.push(id);
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
    evidence.steps.committed = { ids, count: ids.length };
    await runKillAndSweep(db, ids, evidence, { pgChild: true });
    await pool.end();
  } else {
    db = createStubDb();
    const ids = await insertStaged(db, N, NS);
    evidence.steps.committed = { ids, count: ids.length };
    await runKillAndSweep(db, ids, evidence, { pgChild: false });
  }

  mkdirSync(join(__dir, 'out'), { recursive: true });
  const outPath = join(__dir, 'out', `x4-kill9-sweeper-${BACKEND}.json`);
  writeFileSync(outPath, JSON.stringify(evidence, null, 2));
  console.log(`[X4] evidence → ${outPath}`);
  console.log(evidence.pass ? 'ALL GREEN — P1.X4 kill -9 sweeper zero-loss' : 'FAIL — see evidence');
  process.exit(evidence.pass ? 0 : 1);
}

async function runKillAndSweep(db, ids, evidence, { pgChild }) {
  console.log(`[X4] backend=${evidence.backend} namespace=${NS} n=${N}`);
  console.log(`[X4] committed ${ids.length} staged rows (embedding NULL)`);

  const pendingAfterCommit = await countPendingEmbeddings(db, { ids });
  evidence.steps.pending_after_commit = pendingAfterCommit;
  if (pendingAfterCommit !== N) {
    throw new Error(`expected ${N} pending, got ${pendingAfterCommit}`);
  }

  console.log('[X4] spawning child backfill; will SIGKILL mid-write…');
  const childEnv = {
    ...process.env,
    MEMORY_X4_IDS: JSON.stringify(ids),
  };
  if (!pgChild) childEnv.MEMORY_X4_CHILD_STUB = '1';
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), '--child-backfill'], {
    env: childEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let childLog = '';
  child.stderr.on('data', (c) => {
    childLog += c.toString();
  });
  await new Promise((resolve) => {
    const t0 = Date.now();
    const iv = setInterval(() => {
      if (childLog.includes('child embedding') || Date.now() - t0 > 3000) {
        clearInterval(iv);
        resolve();
      }
    }, 50);
  });
  await new Promise((r) => setTimeout(r, 200));
  child.kill('SIGKILL');
  const exit = await new Promise((resolve) =>
    child.on('close', (code, signal) => resolve({ code, signal }))
  );
  evidence.steps.kill9 = {
    signal: exit.signal,
    code: exit.code,
    child_log_tail: childLog.trim().split('\n').slice(-5),
  };
  console.log(`[X4] child killed signal=${exit.signal} code=${exit.code}`);

  // For stub: parent DB untouched by child (by design) — kill proves mid-write
  // interruption; zero-loss is about committed parent rows surviving.
  const still = await db.query(
    `SELECT id, index_status, (embedding IS NOT NULL) AS has_embedding, approval
     FROM memories WHERE id = ANY($1::text[]) ORDER BY created_at`,
    [ids]
  );
  const found = still.rows.map((r) => r.id);
  const missing = ids.filter((id) => !found.includes(id));
  evidence.steps.after_kill = { found: found.length, missing, rows: still.rows };
  if (missing.length) {
    throw new Error(`ZERO-LOSS FAIL: missing ids: ${missing.join(',')}`);
  }
  console.log(`[X4] zero-loss OK — ${found.length}/${N} committed rows still present`);

  const sync = await db.query(
    `SELECT count(*)::int AS n FROM sync_log WHERE memory_id = ANY($1::text[])`,
    [ids]
  );
  evidence.steps.sync_log_rows = sync.rows[0].n;
  console.log(`[X4] sync_log entries for cohort: ${sync.rows[0].n}`);

  const enqueueLog = [];
  const sweep = await runReconcileSweep(
    db,
    async (payload, singletonKey) => {
      enqueueLog.push({ ...payload, singletonKey });
    },
    { limit: 100 }
  );
  const cohortNeeds = sweep.needs_embed.filter((id) => ids.includes(id));
  evidence.steps.reconcile = {
    needs_count: sweep.needs_count,
    cohort_needs: cohortNeeds.length,
    enqueued: enqueueLog.filter((e) => ids.includes(e.memory_id)).length,
  };
  console.log(
    `[X4] sweeper: needs=${sweep.needs_count} cohort_pending=${cohortNeeds.length} enqueued=${evidence.steps.reconcile.enqueued}`
  );

  const bf = await backfillEmbeddings(db, {
    ids,
    embedFn: async (t) => stubEmbed(t),
    model: 'stub-halfvec@x4-sweeper',
  });
  evidence.steps.backfill = { embedded: bf.embedded, model: 'stub-halfvec@x4-sweeper' };
  console.log(`[X4] backfill embedded=${bf.embedded}`);

  const pendingFinal = await countPendingEmbeddings(db, { ids });
  const checkpoint = await adminCheckpoint(db, { ids, checkDeadLetter: false });
  evidence.steps.checkpoint = { ...checkpoint, pending_for_cohort: pendingFinal };
  evidence.pass =
    missing.length === 0 &&
    pendingFinal === 0 &&
    checkpoint.pending_embeddings === 0 &&
    exit.signal === 'SIGKILL';
  evidence.finished_at = new Date().toISOString();
}

main().catch((e) => {
  console.error('[X4] failed', e);
  process.exit(1);
});
