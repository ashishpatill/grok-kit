/**
 * P2.K4 unit: refine-harness patches must cite memory IDs.
 * Offline — no DATABASE_URL.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_PATCHES,
  buildPatch,
  buildPatches,
  formatPatchProposals,
  citeFromRecall,
  fakeMemoryId,
} from './cite-patches.mjs';

const base = () => ({
  target: 'skills/refine-harness/SKILL.md',
  evidence: 'Trajectory skipped gated propose twice.',
  proposed: 'Require memory_ids on every patch.',
  risk: 'Blocks ungrounded harness edits.',
});

describe('buildPatch', () => {
  it('accepts a patch with ≥1 valid memory UUID', () => {
    const id = fakeMemoryId();
    const p = buildPatch({ ...base(), memory_ids: [id] });
    assert.equal(p.memory_ids.length, 1);
    assert.equal(p.memory_ids[0], id);
  });

  it('rejects missing memory_ids', () => {
    assert.throws(() => buildPatch(base()), /memory_ids required/);
  });

  it('rejects empty memory_ids', () => {
    assert.throws(() => buildPatch({ ...base(), memory_ids: [] }), /memory_ids required/);
  });

  it('rejects malformed memory_ids', () => {
    assert.throws(
      () => buildPatch({ ...base(), memory_ids: ['bad id'] }),
      /invalid id/
    );
    assert.throws(
      () => buildPatch({ ...base(), memory_ids: ['short'] }),
      /invalid id/
    );
  });

  it('dedupes memory_ids', () => {
    const id = fakeMemoryId();
    const p = buildPatch({ ...base(), memory_ids: [id, id] });
    assert.equal(p.memory_ids.length, 1);
  });
  it('accepts import-prefixed memory ids', () => {
    const p = buildPatch({ ...base(), memory_ids: ['real_ab618b1beb64b21c1ee1a389c2'] });
    assert.equal(p.memory_ids[0], 'real_ab618b1beb64b21c1ee1a389c2');
  });

});

describe('buildPatches', () => {
  it('caps at MAX_PATCHES', () => {
    const drafts = Array.from({ length: MAX_PATCHES + 1 }, (_, i) => ({
      ...base(),
      target: `t-${i}`,
      memory_ids: [fakeMemoryId()],
    }));
    assert.throws(() => buildPatches(drafts), /at most 3/);
  });

  it('builds ≤3 valid patches', () => {
    const patches = buildPatches([
      { ...base(), memory_ids: [fakeMemoryId()] },
      { ...base(), target: 'skills/foo/SKILL.md', memory_ids: [fakeMemoryId()] },
    ]);
    assert.equal(patches.length, 2);
  });
});

describe('formatPatchProposals', () => {
  it('renders memory_ids in the proposal block', () => {
    const id = fakeMemoryId();
    const md = formatPatchProposals([{ ...base(), memory_ids: [id] }]);
    assert.match(md, /memory_ids/);
    assert.match(md, new RegExp(id));
    assert.match(md, /human-gated/i);
  });
});

describe('citeFromRecall', () => {
  it('fills memory_ids from recallFn when missing', async () => {
    const id = fakeMemoryId();
    const patches = await citeFromRecall([base()], async () => [id]);
    assert.equal(patches[0].memory_ids[0], id);
  });

  it('fails closed when recall returns no valid ids', async () => {
    await assert.rejects(
      () => citeFromRecall([base()], async () => ['garbage']),
      /memory_ids required/
    );
  });
});
