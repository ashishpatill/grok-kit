/**
 * In-memory import adapter for smoke tests (no Neon / Postgres).
 * Implements OpIndex lookups + apply mutations used by apply.mjs.
 */
import { randomUUID } from 'node:crypto';
import { normalizeText } from './hash.mjs';

/**
 * @param {object[]} [seed] optional existing memory rows
 */
export function createStubImportAdapter(seed = []) {
  /** @type {Map<string, object>} */
  const memories = new Map();
  /** @type {Map<string, object>} */
  const reviewItems = new Map();

  for (const row of seed) {
    memories.set(row.id, { ...row });
  }

  function asIndexRow(row) {
    if (!row) return null;
    return {
      id: row.id,
      text: row.text,
      namespace: row.namespace,
      content_hash: row.provenance?.content_hash || row.content_hash || null,
      provenance: row.provenance || {},
    };
  }

  return {
    /** OpIndex */
    findByContentHash(hash) {
      for (const row of memories.values()) {
        const h = row.provenance?.content_hash || row.content_hash;
        if (h === hash && !row.superseded_by) return asIndexRow(row);
      }
      return null;
    },

    findByYamlId(yamlId) {
      for (const row of memories.values()) {
        if (row.superseded_by) continue;
        if (row.provenance?.yaml_id === yamlId) return asIndexRow(row);
      }
      return null;
    },

    findById(id) {
      const row = memories.get(id);
      if (!row || row.superseded_by) return null;
      return asIndexRow(row);
    },

    findByNormalizedText(namespace, normText) {
      for (const row of memories.values()) {
        if (row.superseded_by) continue;
        if (row.namespace !== namespace) continue;
        if (normalizeText(row.text) === normText) return asIndexRow(row);
      }
      return null;
    },

    /**
     * Insert a staged live memory. provenance must already include content_hash.
     */
    async insertMemory(row) {
      const created_at = new Date().toISOString();
      const stored = {
        id: row.id,
        namespace: row.namespace,
        type: row.type || 'semantic',
        scope: row.scope || 'global',
        text: row.text,
        importance: row.importance ?? 5,
        strength: row.strength ?? 5.0,
        pinned: Boolean(row.pinned),
        grounding_ids: row.grounding_ids || [],
        provenance: row.provenance,
        index_status: row.index_status || 'staged',
        approval: row.approval || 'live',
        superseded_by: null,
        created_at,
        updated_at: created_at,
      };
      memories.set(stored.id, stored);
      return {
        id: stored.id,
        namespace: stored.namespace,
        index_status: stored.index_status,
        approval: stored.approval,
        created_at: stored.created_at,
      };
    },

    /**
     * Point old memory at newId via superseded_by (supersede chain, §10).
     */
    async supersede(oldId, newId) {
      const old = memories.get(oldId);
      if (!old) throw new Error(`supersede: missing ${oldId}`);
      old.superseded_by = newId;
      old.updated_at = new Date().toISOString();
      // Keep approval live so history remains readable; recall filters can
      // skip superseded rows via superseded_by IS NULL when needed.
      return { id: oldId, superseded_by: newId };
    },

    async insertReviewItem({ kind, payload, id }) {
      const reviewId = id || randomUUID();
      const created_at = new Date().toISOString();
      const item = {
        id: reviewId,
        kind,
        payload,
        status: 'queued',
        created_at,
        decided_at: null,
        decided_by: null,
      };
      reviewItems.set(reviewId, item);
      return item;
    },

    async end() {
      /* no-op */
    },

    _dumpMemories() {
      return [...memories.values()];
    },

    _dumpReviews() {
      return [...reviewItems.values()];
    },
  };
}
