#!/usr/bin/env node
/**
 * P1.X7 — No-gatekeeping spike (FINAL-PLAN-V2 §10 / Q6).
 *
 * Two bots concurrently write conflicting claims into one `feature-*`
 * namespace. Resolution uses evidence-weighing — never bot identity / tier.
 *
 * Modes:
 *   MEMORY_BACKEND=stub (default) — in-memory adapter, no Neon
 *   DATABASE_URL=... — live PG/Neon (prefer disposable branch)
 *
 * Usage:
 *   node spikes/X7/no-gatekeeping.mjs
 *   DATABASE_URL=... MEMORY_BACKEND=pg node spikes/X7/no-gatekeeping.mjs
 */
import dns from 'node:dns';
import net from 'node:net';
dns.setDefaultResultOrder('ipv4first');
if (typeof net.setDefaultAutoSelectFamily === 'function') {
  net.setDefaultAutoSelectFamily(false);
}

import { randomUUID } from 'node:crypto';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { looksLikeConflict, weighEvidence, scoreEvidence } from '../../lib/evidence-weigh.mjs';
import { resolveConflict } from '../../lib/resolve-conflict.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dir, '..', '..', '.env.local') });

const BACKEND = process.env.MEMORY_BACKEND || (process.env.DATABASE_URL ? 'pg' : 'stub');
const NS = process.env.MEMORY_X7_NS || `feature-auth-x7-${Date.now().toString(36)}`;

function createStubDb() {
  const memories = new Map();
  const reviews = new Map();
  return {
    memories,
    reviews,
    async query(sql, params = []) {
      const s = String(sql).replace(/\s+/g, ' ').trim();
      if (s.startsWith('UPDATE memories SET version = version + 1')) {
        const id = params[0];
        const patch = typeof params[1] === 'string' ? JSON.parse(params[1]) : params[1];
        const row = memories.get(id);
        if (!row) return { rows: [] };
        row.version = (row.version || 1) + 1;
        row.provenance = { ...(row.provenance || {}), ...patch };
        row.strength = Math.min(10, (row.strength || 5) + 0.5);
        return { rows: [{ ...row }] };
      }
      if (s.startsWith('UPDATE memories SET superseded_by')) {
        const id = params[0];
        const winner = params[1];
        const patch = typeof params[2] === 'string' ? JSON.parse(params[2]) : params[2];
        const row = memories.get(id);
        if (!row || row.superseded_by) return { rows: [] };
        row.superseded_by = winner;
        row.approval = 'retired';
        row.provenance = { ...(row.provenance || {}), ...patch };
        return { rows: [{ id: row.id, superseded_by: row.superseded_by, approval: row.approval }] };
      }
      if (s.startsWith('INSERT INTO review_items')) {
        const id = params[0];
        const payload = typeof params[1] === 'string' ? JSON.parse(params[1]) : params[1];
        const decided_by = params[2];
        reviews.set(id, {
          id,
          kind: 'resolution',
          payload,
          status: 'resolved',
          decided_by,
          decided_at: new Date().toISOString(),
        });
        return { rows: [] };
      }
      throw new Error('stub unhandled SQL: ' + s.slice(0, 100));
    },
  };
}

async function insertPg(pool, row) {
  await pool.query(
    `INSERT INTO memories (
       id, namespace, type, scope, text, importance, strength, pinned,
       index_status, approval, grounding_ids, provenance, created_at
     ) VALUES (
       $1, $2, $3, 'global', $4, $5, $6, false,
       'staged', 'live', $7, $8::jsonb, $9::timestamptz
     )`,
    [
      row.id,
      row.namespace,
      row.type,
      row.text,
      row.importance,
      row.strength,
      row.grounding_ids,
      JSON.stringify(row.provenance),
      row.created_at,
    ]
  );
}

async function main() {
  const evidence = {
    gate: 'P1.X7',
    backend: BACKEND,
    namespace: NS,
    started_at: new Date().toISOString(),
    identity_gatekeeping: false,
  };

  const botA = {
    bot_id: 'bot-coder-01',
    text: 'feature-auth: session tokens must use RS256 JWT; HS256 is not allowed in production.',
    grounding_ids: ['g-security-review-1', 'g-owasp-jwt-2', 'g-incident-2026-03'],
    importance: 8,
    strength: 7,
    created_at: new Date(Date.now() - 60_000).toISOString(), // slightly older
    provenance: {
      author: 'bot-coder-01',
      origin: 'spike-x7',
      bot_id: 'bot-coder-01',
      created_at: new Date(Date.now() - 60_000).toISOString(),
    },
  };
  const botB = {
    bot_id: 'bot-verifier-01',
    text: 'feature-auth: HS256 HMAC sessions are fine for production; RS256 is not required.',
    grounding_ids: ['g-legacy-note'], // weaker corroboration
    importance: 7,
    strength: 6,
    created_at: new Date().toISOString(), // newer but weaker evidence
    provenance: {
      author: 'bot-verifier-01',
      origin: 'spike-x7',
      bot_id: 'bot-verifier-01',
      created_at: new Date().toISOString(),
    },
  };

  // Pure weigh unit (no DB) — proves identity is not a factor
  const swapA = { ...botA, id: 'a', bot_id: 'bot-zzz-low-privilege' };
  const swapB = { ...botB, id: 'b', bot_id: 'bot-aaa-ceo-tier' };
  const pure = weighEvidence([swapA, swapB]);
  evidence.pure_weigh = pure;
  if (pure.identity_gatekeeping !== false) throw new Error('identity leaked into weigh');
  if (pure.winner_id !== 'a') {
    throw new Error(`expected stronger-grounding A to win despite "low privilege" id; got ${pure.winner_id}`);
  }
  // Flip identities — same winner
  const flip = weighEvidence([
    { ...swapA, bot_id: 'bot-aaa-ceo-tier', id: 'a2' },
    { ...swapB, bot_id: 'bot-zzz-low-privilege', id: 'b2' },
  ]);
  evidence.identity_swap = { winner: flip.winner_id, scores: flip.scores };
  if (flip.winner_id !== 'a2') {
    throw new Error('identity swap changed winner — gatekeeping regression');
  }
  console.log('[X7] pure weigh: winner=A (stronger grounding); identity swap stable');

  if (!looksLikeConflict(botA.text, botB.text)) {
    throw new Error('expected conflicting claims to lookLikeConflict');
  }

  const idA = randomUUID();
  const idB = randomUUID();
  const rowA = { id: idA, namespace: NS, type: 'semantic', ...botA };
  const rowB = { id: idB, namespace: NS, type: 'semantic', ...botB };

  let db;
  let pool;
  if (BACKEND === 'pg') {
    const pg = await import('pg');
    pool = new pg.default.Pool({
      connectionString: process.env.DATABASE_URL,
      max: 2,
      connectionTimeoutMillis: 30_000,
    });
    db = { query: (s, p) => pool.query(s, p), connect: () => pool.connect() };
    // Concurrent writes
    await Promise.all([insertPg(pool, rowA), insertPg(pool, rowB)]);
    console.log(`[X7] concurrent PG inserts into ${NS}`);
  } else {
    db = createStubDb();
    // Concurrent stub writes
    await Promise.all([
      Promise.resolve(db.memories.set(idA, { ...rowA, version: 1, superseded_by: null, approval: 'live' })),
      Promise.resolve(db.memories.set(idB, { ...rowB, version: 1, superseded_by: null, approval: 'live' })),
    ]);
    console.log(`[X7] concurrent stub inserts into ${NS}`);
  }

  evidence.writes = {
    bot_a: { id: idA, bot_id: botA.bot_id, grounding: botA.grounding_ids.length },
    bot_b: { id: idB, bot_id: botB.bot_id, grounding: botB.grounding_ids.length },
  };

  const resolution = await resolveConflict(db, {
    candidates: [
      { ...rowA, id: idA },
      { ...rowB, id: idB },
    ],
    decided_by: 'svc:resolver',
    namespace: NS,
    reason: 'feature_concurrent_conflict',
  });
  evidence.resolution = resolution;

  if (resolution.status !== 'ok') {
    throw new Error('resolveConflict failed: ' + JSON.stringify(resolution));
  }
  if (resolution.winner_id !== idA) {
    throw new Error(`expected botA (stronger evidence) to win; got ${resolution.winner_id}`);
  }
  if (resolution.identity_gatekeeping !== false) {
    throw new Error('resolution claimed identity gatekeeping');
  }
  if (!resolution.superseded.some((s) => s.id === idB)) {
    throw new Error('loser not superseded');
  }

  // Live truth: only winner active
  if (BACKEND === 'pg') {
    const live = await pool.query(
      `SELECT id, approval, superseded_by, version
       FROM memories WHERE namespace = $1 AND id = ANY($2::text[])`,
      [NS, [idA, idB]]
    );
    evidence.live_rows = live.rows;
    const winnerRow = live.rows.find((r) => r.id === idA);
    const loserRow = live.rows.find((r) => r.id === idB);
    if (winnerRow.approval !== 'live' || winnerRow.superseded_by) {
      throw new Error('winner not live');
    }
    if (loserRow.approval !== 'retired' || loserRow.superseded_by !== idA) {
      throw new Error('loser not properly superseded');
    }
  } else {
    const w = db.memories.get(idA);
    const l = db.memories.get(idB);
    evidence.live_rows = [w, l];
    if (w.approval !== 'live' || w.superseded_by) throw new Error('stub winner not live');
    if (l.approval !== 'retired' || l.superseded_by !== idA) throw new Error('stub loser bad');
    if (!db.reviews.size) throw new Error('no review_items resolution row');
  }

  evidence.pass = true;
  evidence.finished_at = new Date().toISOString();
  mkdirSync(join(__dir, 'out'), { recursive: true });
  const outPath = join(__dir, 'out', `x7-no-gatekeeping-${BACKEND}.json`);
  writeFileSync(outPath, JSON.stringify(evidence, null, 2));
  console.log(`[X7] evidence → ${outPath}`);
  console.log(
    `winner=${resolution.winner_id.slice(0, 8)}… margin=${resolution.weighing.margin} confidence=${resolution.weighing.confidence}`
  );
  console.log('ALL GREEN — P1.X7 no-gatekeeping spike (evidence-weighing, no identity privilege)');
  if (pool) await pool.end();
}

main().catch((e) => {
  console.error('[X7] failed', e);
  process.exit(1);
});
