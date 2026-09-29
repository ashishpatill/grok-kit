/**
 * P3.V1 — visible recall shaping (Referenced-Chats style).
 *
 * Recall envelopes expose memory ids + short provenance + a removal path note
 * so agents/humans can cite and unlearn without inventing silent DELETE.
 */

export const REMOVAL_NOTE =
  'Referenced memories include id + provenance. To remove: get(id) then propose supersede/UPDATE with grounding, or curator review_decide. Pinned rows are human-gated only; consolidate DELETE skips pinned.';

const PROV_KEYS = [
  'author',
  'origin',
  'source_session',
  'bot_id',
  'caller_node_id',
  'import_batch',
  'filename',
  'decided_by',
];

/** @param {unknown} p */
export function normalizeProvenance(p) {
  if (p == null) return null;
  let obj = p;
  if (typeof p === 'string') {
    try {
      obj = JSON.parse(p);
    } catch {
      return null;
    }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const k of PROV_KEYS) {
    if (obj[k] != null && obj[k] !== '') out[k] = obj[k];
  }
  return Object.keys(out).length ? out : null;
}

/**
 * @param {object} row
 * @returns {string}
 */
export function removalHint(row) {
  const id = row?.id || '?';
  if (row?.pinned) {
    return `Pinned id=${id}: human-gated only — propose supersede or curator decide; never silent DELETE.`;
  }
  return `id=${id}: propose supersede/UPDATE with grounding, or curator review_decide; consolidate may DELETE non-pinned expired rows.`;
}

/**
 * Shape one recall hit for MCP/CLI envelopes.
 * @param {object} row
 */
export function shapeRecallResult(row) {
  return {
    id: row.id,
    text: row.text,
    index_status: row.index_status,
    approval: row.approval,
    type: row.type,
    importance: row.importance,
    pinned: Boolean(row.pinned),
    rrf: Number(row.rrf),
    created_at: row.created_at,
    provenance: normalizeProvenance(row.provenance),
    removal: removalHint(row),
  };
}

/**
 * Attach envelope-level removal_note without dropping existing fields.
 * @param {object} payload
 */
export function withVisibleRecall(payload) {
  return {
    ...payload,
    removal_note: REMOVAL_NOTE,
  };
}
