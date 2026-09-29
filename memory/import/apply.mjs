/**
 * Apply classified import ops against a PG or stub adapter (P1.M6).
 *
 * ADD           → insert staged memory (index_status=staged, approval=live)
 *                 provenance includes content_hash + import_batch
 * UPDATE        → insert new row + set superseded_by on old
 * CONTRADICTION → insert review_items only (kind=import_contradiction)
 * NOOP          → count only
 *
 * dryRun: classify + summarize without writes (review_ids empty).
 */
import { randomUUID } from 'node:crypto';

/**
 * Build provenance for an inserted memory from a candidate + batch name.
 */
export function buildProvenance(candidate, importBatch) {
  const base =
    candidate.provenance && typeof candidate.provenance === 'object'
      ? { ...candidate.provenance }
      : {};
  return {
    ...base,
    content_hash: candidate.content_hash,
    import_batch: importBatch,
    origin: base.origin || 'import',
    author: base.author || (base.bot ? `bot:${base.bot}` : 'import:jsonl'),
    created_at: base.created_at || new Date().toISOString(),
  };
}

/**
 * Choose an id for the superseding row: reuse candidate.id when it differs
 * from the row being superseded; otherwise mint a fresh uuid so the old
 * row stays immutable (honesty model §10 — originals preserved).
 */
function supersedeInsertId(candidateId, existingId) {
  if (existingId && candidateId === existingId) return randomUUID();
  return candidateId || randomUUID();
}

/**
 * @param {import('./ops.mjs').ClassifiedOp[]} ops
 * @param {object} adapter  stub or pg import adapter
 * @param {{ dryRun?: boolean, importBatch?: string }} [opts]
 * @returns {Promise<{added:number, updated:number, noop:number, contradicted:number, review_ids:string[], dry_run:boolean, import_batch:string}>}
 */
export async function applyOps(ops, adapter, opts = {}) {
  const dryRun = Boolean(opts.dryRun);
  const importBatch = opts.importBatch || `import-${new Date().toISOString().slice(0, 10)}`;

  let added = 0;
  let updated = 0;
  let noop = 0;
  let contradicted = 0;
  /** @type {string[]} */
  const review_ids = [];

  for (const item of ops) {
    const { op, candidate, reason, existing_id } = item;

    if (op === 'NOOP') {
      noop += 1;
      continue;
    }

    if (op === 'CONTRADICTION') {
      contradicted += 1;
      if (!dryRun) {
        const review = await adapter.insertReviewItem({
          kind: 'import_contradiction',
          payload: {
            reason,
            candidate: {
              id: candidate.id,
              namespace: candidate.namespace,
              type: candidate.type,
              text: candidate.text,
              importance: candidate.importance,
              content_hash: candidate.content_hash,
              provenance: candidate.provenance,
              line: candidate.line,
            },
            existing_id: existing_id || null,
            existing_yaml_id: item.existing_yaml_id || null,
            existing_hash: item.existing_hash || null,
            import_batch: importBatch,
          },
        });
        review_ids.push(review.id);
      }
      continue;
    }

    if (op === 'ADD') {
      added += 1;
      if (!dryRun) {
        await adapter.insertMemory({
          id: candidate.id,
          namespace: candidate.namespace,
          type: candidate.type,
          scope: 'global',
          text: candidate.text,
          importance: candidate.importance,
          strength: 5.0,
          pinned: false,
          grounding_ids: [],
          provenance: buildProvenance(candidate, importBatch),
          index_status: 'staged',
          approval: 'live',
        });
      }
      continue;
    }

    if (op === 'UPDATE') {
      updated += 1;
      if (!dryRun) {
        const id = supersedeInsertId(candidate.id, existing_id);
        await adapter.insertMemory({
          id,
          namespace: candidate.namespace,
          type: candidate.type,
          scope: 'global',
          text: candidate.text,
          importance: candidate.importance,
          strength: 5.0,
          pinned: false,
          grounding_ids: existing_id ? [existing_id] : [],
          provenance: {
            ...buildProvenance(candidate, importBatch),
            supersedes: existing_id,
            update_reason: reason,
          },
          index_status: 'staged',
          approval: 'live',
        });
        if (existing_id) {
          await adapter.supersede(existing_id, id);
        }
      }
      continue;
    }

    throw new Error(`unknown op: ${op}`);
  }

  return {
    added,
    updated,
    noop,
    contradicted,
    review_ids,
    dry_run: dryRun,
    import_batch: importBatch,
  };
}
