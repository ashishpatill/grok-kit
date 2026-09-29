/**
 * P2.K4 — refine-harness patch builder that requires cited memory IDs.
 *
 * Patches stay human-gated (≤3). Each patch must cite ≥1 memory id from
 * prior recall/grounding — authority from shared learnings, not vibes
 * (plan §2.12 / IDL grounding).
 *
 * Memory ids are TEXT PKs (UUID / ULID / import prefixes like real_/syn_) —
 * validate shape, not UUID-only.
 *
 * Pure validation + formatting; no Neon writes. Inject recallFn in smoke
 * to pull live IDs.
 */
import { randomUUID } from 'node:crypto';

/** Opaque memory id: non-empty, no whitespace, 8–128 printable chars. */
const MEMORY_ID_RE = /^[\x21-\x7E]{8,128}$/;

export const MAX_PATCHES = 3;

/**
 * @typedef {{
 *   target: string,
 *   evidence: string,
 *   proposed: string,
 *   risk: string,
 *   memory_ids: string[],
 * }} HarnessPatch
 */

export function isMemoryId(id) {
  return typeof id === 'string' && MEMORY_ID_RE.test(id.trim());
}

/**
 * Normalize + validate one patch. Throws on missing fields / bad IDs.
 * @param {Partial<HarnessPatch>} input
 * @returns {HarnessPatch}
 */
export function buildPatch(input = {}) {
  const target = String(input.target ?? '').trim();
  const evidence = String(input.evidence ?? '').trim();
  const proposed = String(input.proposed ?? '').trim();
  const risk = String(input.risk ?? '').trim();
  const rawIds = Array.isArray(input.memory_ids) ? input.memory_ids : [];
  const memory_ids = [
    ...new Set(rawIds.map((id) => String(id).trim()).filter(Boolean)),
  ];

  if (!target) throw new Error('patch.target required');
  if (!evidence) throw new Error('patch.evidence required');
  if (!proposed) throw new Error('patch.proposed required');
  if (!risk) throw new Error('patch.risk required');
  if (memory_ids.length < 1) {
    throw new Error('patch.memory_ids required (≥1 recalled memory id)');
  }
  for (const id of memory_ids) {
    if (!isMemoryId(id)) {
      throw new Error(`patch.memory_ids invalid id: ${id}`);
    }
  }

  return { target, evidence, proposed, risk, memory_ids };
}

/**
 * Build ≤3 patches. Rejects empty set and sets larger than MAX_PATCHES.
 * @param {Partial<HarnessPatch>[]} inputs
 * @returns {HarnessPatch[]}
 */
export function buildPatches(inputs) {
  if (!Array.isArray(inputs) || inputs.length === 0) {
    throw new Error('at least one patch required');
  }
  if (inputs.length > MAX_PATCHES) {
    throw new Error(`at most ${MAX_PATCHES} patches per run (got ${inputs.length})`);
  }
  return inputs.map((p, i) => {
    try {
      return buildPatch(p);
    } catch (err) {
      throw new Error(`patch[${i}]: ${err.message}`);
    }
  });
}

/**
 * Format patches as the human-facing proposal block (markdown).
 * @param {HarnessPatch[]} patches
 */
export function formatPatchProposals(patches) {
  const validated = buildPatches(patches);
  const lines = [
    '# Refine-harness proposals (human-gated)',
    '',
    `_Count: ${validated.length}/${MAX_PATCHES}. Each cites memory_ids from recall._`,
    '',
  ];
  validated.forEach((p, i) => {
    lines.push(`## Patch ${i + 1}`);
    lines.push(`- **Target:** ${p.target}`);
    lines.push(`- **Evidence:** ${p.evidence}`);
    lines.push(`- **Proposed:**`);
    lines.push('```');
    lines.push(p.proposed);
    lines.push('```');
    lines.push(`- **Risk if wrong:** ${p.risk}`);
    lines.push(`- **memory_ids:** ${p.memory_ids.join(', ')}`);
    lines.push('');
  });
  lines.push('Stop. Wait for human approve/reject. Do not auto-apply.');
  return lines.join('\n');
}

/**
 * Attach recalled memory IDs onto draft patches that lack them.
 * Does not invent IDs — recallFn must return real id strings from the store.
 * @param {Partial<HarnessPatch>[]} drafts
 * @param {(query: string) => Promise<string[]>} recallFn
 */
export async function citeFromRecall(drafts, recallFn) {
  if (typeof recallFn !== 'function') {
    throw new Error('recallFn required');
  }
  const out = [];
  for (const draft of drafts) {
    const existing = Array.isArray(draft.memory_ids)
      ? draft.memory_ids.filter(Boolean)
      : [];
    if (existing.length >= 1) {
      out.push(draft);
      continue;
    }
    const query = [draft.target, draft.evidence, draft.proposed]
      .filter(Boolean)
      .join(' ')
      .slice(0, 400);
    const ids = await recallFn(query || 'harness refinement');
    const memory_ids = (ids || []).map(String).filter((id) => isMemoryId(id));
    out.push({ ...draft, memory_ids });
  }
  return buildPatches(out);
}

/** Test helper: mint a valid UUID-shaped id (not a memory write). */
export function fakeMemoryId() {
  return randomUUID();
}

export { MEMORY_ID_RE };
