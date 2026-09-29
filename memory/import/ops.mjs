/**
 * Classify each import candidate into a Mem0-style ingestion op (P1.M6):
 *   ADD | UPDATE | NOOP | CONTRADICTION
 *
 * Deterministic rules — no LLM in M6 (embeddings / sim≥0.92 dedup is M7).
 *
 * Order (first match wins):
 *  1. exact content_hash already in DB or earlier in this batch → NOOP
 *  2. same namespace + near-identical normalized text, different yaml_id → CONTRADICTION
 *  3. same provenance.yaml_id (or same id) with different hash:
 *       text differs materially → CONTRADICTION (review; do not auto-write)
 *       else → UPDATE (supersede candidate)
 *  4. provenance.replaces set and target exists → UPDATE
 *  5. else → ADD
 *
 * "Near-identical" / "materially" = normalized-text equality after whitespace
 * collapse + lowercase (see hash.mjs).
 */
import { normalizeText, nearIdentical, differsMaterially } from './hash.mjs';

/**
 * @typedef {'ADD'|'UPDATE'|'NOOP'|'CONTRADICTION'} ImportOp
 * @typedef {object} ClassifiedOp
 * @property {ImportOp} op
 * @property {import('./parse-jsonl.mjs').ImportCandidate} candidate
 * @property {string} [reason]
 * @property {string} [existing_id]   memory to supersede / contradict against
 * @property {string} [existing_hash]
 * @property {string} [existing_yaml_id]
 */

/**
 * Lookup surface the adapter (or an in-memory batch index) must provide.
 * @typedef {object} OpIndex
 * @property {(hash: string) => {id:string, text:string, namespace:string, provenance?:object}|null} findByContentHash
 * @property {(yamlId: string) => {id:string, text:string, namespace:string, content_hash?:string, provenance?:object}|null} findByYamlId
 * @property {(id: string) => {id:string, text:string, namespace:string, content_hash?:string, provenance?:object}|null} findById
 * @property {(namespace: string, normText: string) => {id:string, text:string, namespace:string, provenance?:object}|null} findByNormalizedText
 */

/**
 * Classify one candidate against an OpIndex that already reflects prior
 * DB state plus earlier decisions in this batch.
 * @param {import('./parse-jsonl.mjs').ImportCandidate} candidate
 * @param {OpIndex} index
 * @returns {ClassifiedOp}
 */
export function classifyOne(candidate, index) {
  const hash = candidate.content_hash;
  const yamlId = candidate.provenance?.yaml_id || null;
  const replaces = candidate.provenance?.replaces || null;

  // 1. Exact content_hash → NOOP
  const byHash = index.findByContentHash(hash);
  if (byHash) {
    return {
      op: 'NOOP',
      candidate,
      reason: 'content_hash_exists',
      existing_id: byHash.id,
      existing_hash: hash,
    };
  }

  // 2. Same namespace + near-identical text, different yaml_id → CONTRADICTION
  const norm = normalizeText(candidate.text);
  const byText = index.findByNormalizedText(candidate.namespace, norm);
  if (byText) {
    const existingYaml = byText.provenance?.yaml_id || null;
    const sameYaml =
      (yamlId && existingYaml && yamlId === existingYaml) ||
      byText.id === candidate.id;
    if (!sameYaml && nearIdentical(byText.text, candidate.text)) {
      return {
        op: 'CONTRADICTION',
        candidate,
        reason: 'near_identical_text_different_yaml_id',
        existing_id: byText.id,
        existing_yaml_id: existingYaml || undefined,
      };
    }
  }

  // 3. Same yaml_id or same id with different hash
  let existing = null;
  let matchVia = null;
  if (yamlId) {
    existing = index.findByYamlId(yamlId);
    if (existing) matchVia = 'yaml_id';
  }
  if (!existing) {
    existing = index.findById(candidate.id);
    if (existing) matchVia = 'id';
  }
  if (existing) {
    const existingHash =
      existing.content_hash ||
      existing.provenance?.content_hash ||
      null;
    if (existingHash && existingHash === hash) {
      return {
        op: 'NOOP',
        candidate,
        reason: 'same_id_same_hash',
        existing_id: existing.id,
        existing_hash: hash,
      };
    }
    if (differsMaterially(existing.text, candidate.text)) {
      return {
        op: 'CONTRADICTION',
        candidate,
        reason:
          matchVia === 'yaml_id'
            ? 'same_yaml_id_material_text_diff'
            : 'same_id_material_text_diff',
        existing_id: existing.id,
        existing_hash: existingHash || undefined,
        existing_yaml_id: existing.provenance?.yaml_id || yamlId || undefined,
      };
    }
    return {
      op: 'UPDATE',
      candidate,
      reason:
        matchVia === 'yaml_id'
          ? 'same_yaml_id_non_material'
          : 'same_id_non_material',
      existing_id: existing.id,
      existing_hash: existingHash || undefined,
    };
  }

  // 4. provenance.replaces → UPDATE if target exists
  if (replaces) {
    const targetId = typeof replaces === 'string' ? replaces : replaces.id;
    if (targetId) {
      const target = index.findById(targetId);
      if (target) {
        return {
          op: 'UPDATE',
          candidate,
          reason: 'provenance_replaces',
          existing_id: target.id,
        };
      }
    }
  }

  // 5. else ADD
  return { op: 'ADD', candidate, reason: 'new' };
}

/**
 * Classify a full batch. Mutates a working index so in-batch duplicates
 * become NOOP and in-batch near-identical texts become CONTRADICTION.
 *
 * @param {import('./parse-jsonl.mjs').ImportCandidate[]} candidates
 * @param {OpIndex} baseIndex  DB-backed (or empty for stub-only)
 * @returns {ClassifiedOp[]}
 */
export function classifyBatch(candidates, baseIndex) {
  /** In-batch overlays (content that would be written if applied). */
  const batchByHash = new Map();
  const batchByYaml = new Map();
  const batchById = new Map();
  /** namespace → Map<normText, row> */
  const batchByNorm = new Map();

  function remember(row) {
    if (row.content_hash) batchByHash.set(row.content_hash, row);
    if (row.id) batchById.set(row.id, row);
    const y = row.provenance?.yaml_id;
    if (y) batchByYaml.set(y, row);
    const ns = row.namespace;
    if (!batchByNorm.has(ns)) batchByNorm.set(ns, new Map());
    batchByNorm.get(ns).set(normalizeText(row.text), row);
  }

  /** @type {OpIndex} */
  const index = {
    findByContentHash(hash) {
      return batchByHash.get(hash) || baseIndex.findByContentHash(hash);
    },
    findByYamlId(yamlId) {
      return batchByYaml.get(yamlId) || baseIndex.findByYamlId(yamlId);
    },
    findById(id) {
      return batchById.get(id) || baseIndex.findById(id);
    },
    findByNormalizedText(namespace, normText) {
      const m = batchByNorm.get(namespace);
      if (m && m.has(normText)) return m.get(normText);
      return baseIndex.findByNormalizedText(namespace, normText);
    },
  };

  const out = [];
  for (const candidate of candidates) {
    const classified = classifyOne(candidate, index);
    out.push(classified);
    // Only ADD/UPDATE occupy the in-batch index for subsequent lookups.
    // CONTRADICTION / NOOP do not claim the hash (so a later identical ADD
    // against an unresolved contradiction still sees the prior DB/batch row).
    if (classified.op === 'ADD' || classified.op === 'UPDATE') {
      remember({
        id: candidate.id,
        text: candidate.text,
        namespace: candidate.namespace,
        content_hash: candidate.content_hash,
        provenance: candidate.provenance,
      });
    } else if (classified.op === 'NOOP' && classified.existing_id) {
      // Hash is already known; nothing to add.
    }
  }
  return out;
}
