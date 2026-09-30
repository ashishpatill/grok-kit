#!/usr/bin/env node
/**
 * Console session smoke — synthetic stub only (no Neon).
 */
import { createConsoleSession } from './session.mjs';

let failures = 0;
function assert(cond, label, extra = '') {
  if (cond) console.log(`  PASS ${label}`);
  else {
    failures += 1;
    console.log(`  FAIL ${label} ${extra}`);
  }
}

console.log('memory-console smoke (synthetic stub)');
const s = createConsoleSession();
const st = await s.status();
assert(st.status === 'ok' && st.backend === 'stub' && st.memories_live >= 5, 'status', JSON.stringify(st));
assert(st.pending_proposals >= 2, 'seeded pending proposals');

const rc = await s.recall('project-demo', 'hybrid recall RRF', 5);
assert(rc.status === 'ok' && rc.count >= 1, 'recall hits demo learning');
assert(rc.results[0].id && rc.results[0].provenance && rc.results[0].removal, 'visible recall fields');
assert(typeof rc.removal_note === 'string', 'removal_note');

const queued = await s.propose('preferences', 'Preference: synthetic console gate check.', {
  type: 'semantic',
  author: 'console-smoke',
});
assert(queued.decision === 'queued_for_review' && queued.reason === 'identity-ns-human-always', 'identity gated', JSON.stringify(queued));

const auto = await s.propose('project-demo', 'Episode: console smoke auto path.', {
  type: 'episodic',
  author: 'console-smoke',
});
assert(auto.decision === 'auto_approved' && auto.id, 'episodic auto', JSON.stringify(auto));

const list = await s.reviewList();
const target = list.proposals.find((p) => p.id === queued.proposal_id) || list.proposals[0];
assert(target, 'review list has proposal');
const promoted = await s.promote(target.id, 'human:console-smoke');
assert(promoted.status === 'ok' && promoted.promoted_id, 'promote', JSON.stringify(promoted));

const hot = await s.hotPinPreview();
assert(hot.status === 'ok' && hot.memory_md.includes('Hot-pin MEMORY'), 'hot-pin preview');
assert(hot.memory_md.includes('source: console-stub'), 'hot-pin labels console-stub');
assert(!/source: neon-pinned/i.test(hot.memory_md), 'hot-pin does not claim neon-pinned');
assert(
  !/\/Users\/|\/Volumes\/|MagicDNS|tailnet_ip|100\.\d+\.\d+\.\d+/i.test(JSON.stringify(hot)) &&
    !/ashi[\w]*pisey/i.test(JSON.stringify(hot)),
  'hot-pin has no personal leaks'
);

console.log(failures === 0 ? '\nALL GREEN — memory-console smoke' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
