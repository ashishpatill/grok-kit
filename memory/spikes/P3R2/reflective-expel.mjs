/**
 * P3.R2 ExpeL / reflective deepen smoke.
 *
 * Extraction + usage-voting → propose payloads (always human-gated).
 *
 *   node spikes/P3R2/reflective-expel.mjs
 *   DATABASE_URL=… node spikes/P3R2/reflective-expel.mjs --live
 *
 * Live uses Neon **main** only; disposable namespaces; always cleans up.
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import {
  extractReflectiveStub,
  extractInsightLines,
  extractInsightsFromEpisodics,
  applyUsageVote,
  rankByUsageVotes,
  buildReflectiveProposePayload,
  runReflectivePipeline,
  USAGE_VOTE_THRESHOLD,
} from '../../lib/reflective.mjs';
import { routePropose, isHumanGated } from '../../lib/propose-route.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(__dir, '..', '..', 'package.json'));

let failures = 0;
function assert(cond, label, extra = '') {
  if (cond) console.log(`  PASS ${label}`);
  else {
    failures += 1;
    console.log(`  FAIL ${label} ${extra}`);
  }
}

const EPISODICS = [
  {
    id: 'ep-1',
    namespace: 'project-p3r2-expel',
    text: 'Wrong: claimed Tailscale serve without binary. Worked: localhost /wake smoke. Next: install Tailscale then wire serve.',
  },
  {
    id: 'ep-2',
    namespace: 'project-p3r2-expel',
    text: 'Worked: localhost /wake smoke again on launchd. Lesson: never invent X1 green.',
  },
  {
    id: 'ep-3',
    namespace: 'project-p3r2-expel',
    text: 'Session closed after poison red-team; no silent pin promote.',
  },
];

console.log('P3.R2 reflective / ExpeL smoke');

console.log('stub back-compat:');
{
  const stub = extractReflectiveStub({
    episodic_text: 'agent tried to pin a false preference',
    namespace: 'preferences',
  });
  assert(stub.type === 'reflective', 'stub type');
  assert(stub.must_human_gate === true, 'stub must_human_gate');
}

console.log('insight extract:');
{
  const lines = extractInsightLines(EPISODICS[0].text);
  assert(lines.length >= 2, `labeled lines >=2 (got ${lines.length})`);
  assert(lines.some((l) => /Wrong/i.test(l)), 'has Wrong');
  assert(lines.some((l) => /Worked/i.test(l)), 'has Worked');
  assert(lines.some((l) => /Next/i.test(l)), 'has Next');
}

console.log('extract + usage voting:');
{
  let cands = extractInsightsFromEpisodics(EPISODICS, {
    namespace: 'project-p3r2-expel',
    vote_threshold: USAGE_VOTE_THRESHOLD,
  });
  assert(cands.length >= 3, `candidates >=3 (got ${cands.length})`);
  assert(cands.every((c) => c.type === 'reflective'), 'all reflective');
  assert(cands.every((c) => c.must_human_gate === true), 'all must_human_gate');

  const worked = cands.find((c) => /Worked:.*wake/i.test(c.text) || /Worked: localhost/i.test(c.text));
  assert(worked, 'found Worked wake candidate');
  let voted = applyUsageVote(worked, { outcome: 'used_ok' });
  voted = applyUsageVote(voted, { outcome: 'recalled' });
  assert(voted.votes >= USAGE_VOTE_THRESHOLD, `votes >= threshold (${voted.votes})`);
  assert(voted.ready_to_propose === true, 'ready after votes');

  const ranked = rankByUsageVotes(
    cands.map((c) => (c.id === worked.id ? voted : c)),
    { ready_only: true }
  );
  assert(ranked.length >= 1, 'ready_only non-empty');
  assert(ranked[0].id === worked.id, 'top ranked is voted candidate');
}

console.log('propose payloads human-gated:');
{
  const { proposals } = runReflectivePipeline(EPISODICS, {
    namespace: 'project-p3r2-expel',
    vote_threshold: 1,
    ready_only: false,
  });
  assert(proposals.length >= 1, 'proposals built');
  for (const p of proposals) {
    assert(p.metadata.type === 'reflective', 'payload type reflective');
    assert(p.must_human_gate === true, 'payload must_human_gate');
    assert(p.human_gated === true, 'payload human_gated');
    assert(p.route.decision === 'queued_for_review', 'route queued');
    assert(p.route.reason === 'reflective-human-always', 'route reflective-human-always');
    assert(isHumanGated(p.route), 'isHumanGated');
  }
  const r = routePropose({
    type: 'reflective',
    namespace: 'project-ok',
    grounding_ids: ['a', 'b', 'c'],
  });
  assert(r.reason === 'reflective-human-always', 'reflective never auto even with grounding');
}

if (process.argv.includes('--live')) {
  console.log('live Neon main:');
  const dotenv = require('dotenv');
  dotenv.config({ path: join(__dir, '..', '..', '.env.local') });
  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) {
    console.log('  SKIP live (DATABASE_URL missing)');
  } else {
    const pg = require('pg');
    const dns = await import('node:dns');
    const net = await import('node:net');
    dns.setDefaultResultOrder('ipv4first');
    if (typeof net.setDefaultAutoSelectFamily === 'function') {
      net.setDefaultAutoSelectFamily(false);
    }
    const pool = new pg.Pool({
      connectionString: DATABASE_URL,
      max: 2,
      connectionTimeoutMillis: 20_000,
    });
    const stamp = Date.now();
    const ns = `project-p3r2-expel-${stamp}`;
    const proposalIds = [];
    try {
      const { proposals } = runReflectivePipeline(
        EPISODICS.map((e) => ({ ...e, namespace: ns })),
        { namespace: ns, vote_threshold: 1, ready_only: false }
      );
      assert(proposals.length >= 1, 'live: proposals to insert');

      for (const p of proposals.slice(0, 5)) {
        const id = randomUUID();
        proposalIds.push(id);
        await pool.query(
          `INSERT INTO proposals (id, namespace, type, scope, text, importance, strength,
                                  pinned, grounding_ids, provenance, route_reason)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11)`,
          [
            id,
            ns,
            'reflective',
            'global',
            p.text,
            p.metadata.importance ?? 5,
            5.0,
            false,
            p.metadata.grounding_ids || [],
            JSON.stringify({
              source_session: `p3r2-expel-${stamp}`,
              author: 'p3r2-expel-smoke',
              origin: 'expel-reflective',
              created_at: new Date().toISOString(),
              reflective_id: p.metadata.reflective_id,
              usage_votes: p.metadata.usage_votes,
            }),
            p.route.reason,
          ]
        );
      }

      const propCheck = await pool.query(
        `SELECT id, type, status, route_reason, pinned FROM proposals WHERE id = ANY($1::text[])`,
        [proposalIds]
      );
      assert(propCheck.rows.length === proposalIds.length, 'live: all reflective in proposals');
      for (const row of propCheck.rows) {
        assert(row.type === 'reflective', `live type reflective ${row.id}`);
        assert(row.status === 'pending', `live pending ${row.id}`);
        assert(row.route_reason === 'reflective-human-always', `live reason ${row.route_reason}`);
        assert(row.pinned === false, `live not pinned ${row.id}`);
      }

      const memCheck = await pool.query(
        `SELECT id FROM memories WHERE namespace = $1 AND type = 'reflective'`,
        [ns]
      );
      assert(memCheck.rows.length === 0, 'live: no reflective auto-promoted to memories');

      await pool.query(`DELETE FROM proposals WHERE id = ANY($1::text[])`, [proposalIds]);
      await pool.query(`DELETE FROM memories WHERE namespace = $1`, [ns]);
      assert(true, 'live cleanup');
    } catch (e) {
      failures += 1;
      console.log(`  FAIL live (${e.code || ''} ${e.message})`);
      try {
        if (proposalIds.length) {
          await pool.query(`DELETE FROM proposals WHERE id = ANY($1::text[])`, [proposalIds]);
        }
        await pool.query(`DELETE FROM memories WHERE namespace = $1`, [ns]);
      } catch {
        /* ignore */
      }
    } finally {
      await pool.end().catch(() => {});
    }
  }
}

console.log(
  failures === 0 ? '\nALL GREEN — P3.R2 reflective / ExpeL smoke' : `\n${failures} FAILURES`
);
process.exit(failures === 0 ? 0 : 1);
