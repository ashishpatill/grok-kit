/**
 * Unit smoke for P3.V1 visible-recall helpers.
 * Run: node --test lib/visible-recall.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  REMOVAL_NOTE,
  normalizeProvenance,
  removalHint,
  shapeRecallResult,
  withVisibleRecall,
} from './visible-recall.mjs';

test('normalizeProvenance keeps known keys only', () => {
  assert.deepEqual(
    normalizeProvenance({
      author: 'human:ashish',
      origin: 'import',
      secret: 'nope',
      bot_id: 'bot-1',
    }),
    { author: 'human:ashish', origin: 'import', bot_id: 'bot-1' }
  );
  assert.equal(normalizeProvenance(null), null);
  assert.equal(normalizeProvenance('{"author":"a"}').author, 'a');
});

test('shapeRecallResult includes id + provenance + removal', () => {
  const r = shapeRecallResult({
    id: 'mem_1',
    text: 'Prefer Asia/Calcutta',
    index_status: 'indexed',
    approval: 'live',
    type: 'semantic',
    importance: 8,
    pinned: true,
    rrf: 0.02,
    created_at: '2026-09-30T00:00:00.000Z',
    provenance: { author: 'human:ashish', origin: 'internal' },
  });
  assert.equal(r.id, 'mem_1');
  assert.equal(r.pinned, true);
  assert.deepEqual(r.provenance, { author: 'human:ashish', origin: 'internal' });
  assert.match(r.removal, /Pinned id=mem_1/);
  assert.match(REMOVAL_NOTE, /propose supersede/);
  assert.equal(withVisibleRecall({ status: 'ok' }).removal_note, REMOVAL_NOTE);
  assert.match(removalHint({ id: 'x', pinned: false }), /id=x/);
});
