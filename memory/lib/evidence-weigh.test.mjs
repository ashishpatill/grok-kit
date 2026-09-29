#!/usr/bin/env node
/**
 * Stub unit tests for evidence-weigh (no DB).
 */
import assert from 'node:assert/strict';
import { scoreEvidence, weighEvidence, looksLikeConflict } from './evidence-weigh.mjs';

const olderStrong = {
  id: 'old',
  text: 'Use RS256',
  created_at: '2026-09-01T00:00:00Z',
  grounding_ids: ['a', 'b', 'c'],
  importance: 8,
  strength: 8,
  provenance: { author: 'bot-coder-01', bot_id: 'bot-coder-01' },
  bot_id: 'bot-coder-01',
};
const newerWeak = {
  id: 'new',
  text: 'HS256 is fine',
  created_at: '2026-09-29T00:00:00Z',
  grounding_ids: ['x'],
  importance: 6,
  strength: 5,
  provenance: { author: 'bot-ceo-standin', bot_id: 'bot-ceo-standin' },
  bot_id: 'bot-ceo-standin',
};

const s1 = scoreEvidence(olderStrong);
const s2 = scoreEvidence(newerWeak);
assert.equal(s1.identity_used, false);
assert.equal(s2.identity_used, false);
assert.ok(s1.total > s2.total, 'stronger grounding should outrank newer weak');

const w = weighEvidence([olderStrong, newerWeak]);
assert.equal(w.winner_id, 'old');
assert.equal(w.identity_gatekeeping, false);
assert.deepEqual(w.loser_ids, ['new']);

// Identity swap must not flip winner
const w2 = weighEvidence([
  { ...olderStrong, id: 'old2', bot_id: 'bot-zzz', provenance: { author: 'bot-zzz', bot_id: 'bot-zzz' } },
  { ...newerWeak, id: 'new2', bot_id: 'bot-aaa-ceo', provenance: { author: 'bot-aaa-ceo', bot_id: 'bot-aaa-ceo' } },
]);
assert.equal(w2.winner_id, 'old2', 'identity must not gatekeep');

assert.equal(looksLikeConflict('RS256 required', 'HS256 is fine; RS256 is not required'), true);
assert.equal(looksLikeConflict('same claim here', 'same claim here'), false);

console.log('ALL GREEN — evidence-weigh unit');
