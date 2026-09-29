/**
 * P1.M9 — cold-start contract unit checks (no DB).
 * Run: node lib/cold-start-contract.test.mjs
 */
import { buildRecallContract, assertContractShape } from './cold-start-contract.mjs';

let failures = 0;
function assert(cond, label, extra = '') {
  if (cond) console.log(`  PASS ${label}`);
  else {
    failures += 1;
    console.log(`  FAIL ${label} ${extra}`);
  }
}

console.log('P1.M9 cold-start contract unit');

const warm = buildRecallContract({
  source: 'neon',
  indexedCount: 10,
  pendingEmbeddings: 0,
  lastSeq: 5208,
  replicaLag: null,
});
assert(assertContractShape(warm) === null, 'warm shape', assertContractShape(warm));
assert(warm.index === 'warm' && warm.daemon === 'warm', 'indexed+seq => index/daemon warm');
assert(warm.replica_lag === null && warm.last_seq === 5208, 'primary lag null');

const coldIdx = buildRecallContract({
  source: 'neon',
  indexedCount: 0,
  pendingEmbeddings: 3,
  lastSeq: 100,
});
assert(coldIdx.index === 'cold' && coldIdx.daemon === 'cold', 'pending embeds => daemon cold');

const stub = buildRecallContract({ source: 'stub', indexedCount: 0, lastSeq: 0 });
assert(stub.daemon === 'unknown' && stub.index === 'cold', 'stub defaults');

const replica = buildRecallContract({
  source: 'replica',
  indexedCount: 5,
  lastSeq: 100,
  replicaLag: 12,
  daemon: 'warm',
});
assert(replica.replica_lag === 12 && replica.source === 'replica', 'replica lag reported');

console.log(failures === 0 ? '\nALL GREEN' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
