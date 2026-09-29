/**
 * Unit checks for propose-route (P3.P1 identity harden).
 */
import assert from 'node:assert/strict';
import {
  routePropose,
  isIdentityNamespace,
  MIN_EVIDENCE_AUTO,
  isHumanGated,
} from './propose-route.mjs';

assert.equal(isIdentityNamespace('preferences'), true);
assert.equal(isIdentityNamespace('project-foo'), false);
assert.equal(MIN_EVIDENCE_AUTO, 2);

const episodic = routePropose({ type: 'episodic', namespace: 'handoff-x' });
assert.equal(episodic.decision, 'auto_approved');
assert.equal(episodic.reason, 'episodic-or-node_local');

const pinned = routePropose({
  type: 'semantic',
  pinned: true,
  grounding_ids: ['a', 'b', 'c'],
  namespace: 'project-x',
});
assert.equal(pinned.decision, 'queued_for_review');
assert.equal(pinned.reason, 'pinned-human-always');
assert.equal(isHumanGated(pinned), true);

const prefs = routePropose({
  type: 'semantic',
  pinned: false,
  grounding_ids: ['fake-1', 'fake-2'],
  namespace: 'preferences',
});
assert.equal(prefs.decision, 'queued_for_review');
assert.equal(prefs.reason, 'identity-ns-human-always');

const procedural = routePropose({ type: 'procedural', namespace: 'project-x' });
assert.equal(procedural.reason, 'procedural-human-always');

const low = routePropose({ type: 'semantic', namespace: 'project-x', grounding_ids: [] });
assert.equal(low.reason, 'low-evidence');

const ok = routePropose({
  type: 'semantic',
  namespace: 'project-x',
  grounding_ids: ['g1', 'g2'],
});
assert.equal(ok.decision, 'auto_approved');
assert.match(ok.reason, /grounding_ids>=2/);

console.log('ALL GREEN — propose-route unit');
