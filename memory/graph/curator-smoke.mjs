/**
 * P1.G2 curator client smoke (stub MemoryPort — no Neon).
 * Exit 0 = ALL GREEN.
 */
import { CuratorClient, CURATOR_IDENTITY } from './curator-client.mjs';
import { createStubMemoryPort } from './stub-memory-port.mjs';

let failures = 0;
function assert(cond, label, extra = '') {
  if (cond) console.log(`  PASS ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label} ${extra}`);
  }
}

console.log('P1.G2 curator client smoke (stub MemoryPort)');
const port = createStubMemoryPort();
const curator = new CuratorClient(port);
assert(curator.identity === CURATOR_IDENTITY, 'identity svc:curator');

// Queue proposals via write gates
const q1 = await port.propose({
  namespace: 'project-g2',
  text: 'procedural learning needs human/curator',
  metadata: { type: 'procedural', author: 'tester' },
});
assert(q1.decision === 'queued_for_review' && q1.proposal_id, 'procedural queued');

const q2 = await port.propose({
  namespace: 'project-g2',
  text: 'low evidence semantic',
  metadata: { type: 'semantic' },
});
assert(q2.decision === 'queued_for_review', 'low-evidence queued');

const auto = await port.propose({
  namespace: 'project-g2',
  text: 'episodic auto',
  metadata: { type: 'episodic' },
});
assert(auto.decision === 'auto_approved', 'episodic auto-approved');

const list = await curator.listPending();
assert(list.counts.proposals === 2, 'listPending sees 2 proposals', JSON.stringify(list.counts));

const promoted = await curator.approveProposal(q1.proposal_id, 'g2-smoke approve');
assert(promoted.status === 'ok' && promoted.decision === 'approved', 'approveProposal ok');
assert(promoted.decided_by === CURATOR_IDENTITY, 'decided_by svc:curator');
assert(promoted.promoted_id, 'promoted_id set');

const mem = await port.get({ id: promoted.promoted_id });
assert(mem.status === 'ok', 'get promoted memory');
assert(mem.memory.provenance.author === CURATOR_IDENTITY, 'provenance.author svc:curator');
assert(mem.memory.provenance.origin === 'promote', 'provenance.origin promote');
assert(mem.memory.provenance.promoted_from === q1.proposal_id, 'promoted_from set');

const rejected = await curator.rejectProposal(q2.proposal_id, 'not grounded enough');
assert(rejected.decision === 'rejected' && rejected.decided_by === CURATOR_IDENTITY, 'rejectProposal');

const empty = await curator.listPending();
assert(empty.counts.proposals === 0, 'queue drained');

// review_items path
const ri = port.enqueueReviewItem({
  kind: 'import_contradiction',
  payload: { a: 'old', b: 'new' },
});
const list2 = await curator.listPending();
assert(list2.counts.review_items === 1, 'review_item queued');

const decided = await curator.decide({
  target: 'review_item',
  id: ri.id,
  decision: 'resolve',
  note: 'weighed evidence; keep newer',
});
assert(decided.decision === 'resolved' && decided.decided_by === CURATOR_IDENTITY, 'review_decide resolve');

const list3 = await curator.listPending();
assert(list3.counts.review_items === 0, 'review queue empty');

// Conflict: double-promote
const q3 = await port.propose({
  namespace: 'project-g2',
  text: 'another procedural',
  metadata: { type: 'procedural' },
});
await curator.approveProposal(q3.proposal_id);
const again = await curator.approveProposal(q3.proposal_id);
assert(again.status === 'error' && again.error === 'CONFLICT', 'double-promote CONFLICT');

console.log(failures === 0 ? '\nALL GREEN' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
