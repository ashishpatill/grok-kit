/**
 * In-memory MemoryPort for curator / graph smokes (no Neon).
 * Mirrors proposals + review_items + memories enough for G2–G4.
 */
import { randomUUID } from 'node:crypto';
import { CURATOR_IDENTITY } from '../lib/curator-decide.mjs';

export function createStubMemoryPort() {
  /** @type {Map<string, object>} */
  const proposals = new Map();
  /** @type {Map<string, object>} */
  const reviewItems = new Map();
  /** @type {Map<string, object>} */
  const memories = new Map();

  function propose({ namespace, text, metadata = {} }) {
    const type = metadata.type || 'semantic';
    const scope = metadata.scope || 'global';
    const pinned = Boolean(metadata.pinned);
    const grounding_ids = Array.isArray(metadata.grounding_ids) ? metadata.grounding_ids : [];

    if (type === 'episodic' || scope === 'node_local') {
      const id = randomUUID();
      memories.set(id, {
        id,
        namespace,
        type,
        scope,
        text,
        provenance: { author: metadata.author || 'stub', origin: 'propose-auto' },
        grounding_ids,
        approval: 'live',
        index_status: 'staged',
      });
      return { status: 'ok', decision: 'auto_approved', reason: 'episodic-or-node_local', id };
    }
    let route_reason = null;
    if (type === 'procedural') route_reason = 'procedural-human-always';
    else if (pinned) route_reason = 'pinned-human-always';
    else if (grounding_ids.length < 2) route_reason = 'low-evidence';
    if (!route_reason) {
      const id = randomUUID();
      memories.set(id, {
        id,
        namespace,
        type,
        scope,
        text,
        provenance: { author: metadata.author || 'stub', origin: 'propose-auto' },
        grounding_ids,
        approval: 'live',
        index_status: 'staged',
      });
      return { status: 'ok', decision: 'auto_approved', reason: 'grounding_ids>=2', id };
    }
    const id = metadata.id || randomUUID();
    proposals.set(id, {
      id,
      namespace,
      type,
      scope,
      text,
      importance: metadata.importance ?? 5,
      strength: metadata.strength ?? 5.0,
      pinned,
      grounding_ids,
      provenance: {
        author: metadata.author || 'stub',
        origin: metadata.origin || 'propose',
        created_at: new Date().toISOString(),
      },
      route_reason,
      status: 'pending',
      decided_by: null,
      decided_at: null,
      promoted_id: null,
      created_at: new Date().toISOString(),
    });
    return { status: 'ok', decision: 'queued_for_review', reason: route_reason, proposal_id: id };
  }

  function enqueueReviewItem({ kind = 'import_contradiction', payload = {} }) {
    const id = randomUUID();
    reviewItems.set(id, {
      id,
      kind,
      payload,
      status: 'queued',
      created_at: new Date().toISOString(),
      decided_at: null,
      decided_by: null,
    });
    return { status: 'ok', id };
  }

  async function review_list(opts = {}) {
    const propStatus = opts.status === 'queued' ? 'pending' : opts.status || 'pending';
    const reviewStatus = opts.status === 'pending' ? 'queued' : opts.status || 'queued';
    const props = [...proposals.values()].filter((p) => p.status === propStatus);
    const revs = [...reviewItems.values()].filter((r) => r.status === reviewStatus);
    return {
      status: 'ok',
      proposals: props,
      review_items: revs,
      counts: { proposals: props.length, review_items: revs.length },
    };
  }

  async function promote({ proposal_id, decided_by = CURATOR_IDENTITY, note }) {
    const row = proposals.get(proposal_id);
    if (!row) return { status: 'error', error: 'NOT_FOUND', detail: `proposal ${proposal_id}` };
    if (row.status !== 'pending') {
      return { status: 'error', error: 'CONFLICT', detail: `proposal status=${row.status}` };
    }
    const memory_id = randomUUID();
    const provenance = {
      ...row.provenance,
      author: decided_by,
      origin: 'promote',
      promoted_from: proposal_id,
      decided_by,
      created_at: new Date().toISOString(),
    };
    if (note) provenance.decision_note = note;
    memories.set(memory_id, {
      id: memory_id,
      namespace: row.namespace,
      type: row.type,
      scope: row.scope,
      text: row.text,
      importance: row.importance,
      strength: row.strength,
      pinned: row.pinned,
      grounding_ids: row.grounding_ids,
      provenance,
      approval: 'live',
      index_status: 'staged',
    });
    row.status = 'approved';
    row.decided_by = decided_by;
    row.decided_at = new Date().toISOString();
    row.promoted_id = memory_id;
    return {
      status: 'ok',
      decision: 'approved',
      proposal_id,
      promoted_id: memory_id,
      decided_by,
    };
  }

  async function reject_proposal({ proposal_id, decided_by = CURATOR_IDENTITY, note }) {
    const row = proposals.get(proposal_id);
    if (!row) return { status: 'error', error: 'NOT_FOUND', detail: `proposal ${proposal_id}` };
    if (row.status !== 'pending') {
      return { status: 'error', error: 'CONFLICT', detail: `proposal status=${row.status}` };
    }
    row.status = 'rejected';
    row.decided_by = decided_by;
    row.decided_at = new Date().toISOString();
    return { status: 'ok', decision: 'rejected', proposal_id, decided_by, note: note || null };
  }

  async function review_decide(opts) {
    const target = opts.target || opts.kind;
    const decision = opts.decision;
    const decided_by = opts.decided_by || CURATOR_IDENTITY;
    const id = opts.id || opts.proposal_id || opts.review_item_id;
    if (target === 'proposal') {
      if (decision === 'approve' || decision === 'promote') {
        return promote({ proposal_id: id, decided_by, note: opts.note });
      }
      if (decision === 'reject') {
        return reject_proposal({ proposal_id: id, decided_by, note: opts.note });
      }
      return { status: 'error', error: 'VALIDATION', detail: 'bad proposal decision' };
    }
    if (target !== 'review_item') {
      return { status: 'error', error: 'VALIDATION', detail: 'target must be proposal|review_item' };
    }
    const row = reviewItems.get(id);
    if (!row) return { status: 'error', error: 'NOT_FOUND', detail: `review_item ${id}` };
    if (row.status !== 'queued') {
      return { status: 'error', error: 'CONFLICT', detail: `review_item status=${row.status}` };
    }
    const statusMap = { approve: 'approved', reject: 'rejected', resolve: 'resolved' };
    if (!statusMap[decision]) {
      return { status: 'error', error: 'VALIDATION', detail: 'decision must be approve|reject|resolve' };
    }
    row.status = statusMap[decision];
    row.decided_by = decided_by;
    row.decided_at = new Date().toISOString();
    row.payload = { ...row.payload, decided_by, decision_note: opts.note || undefined };
    return {
      status: 'ok',
      decision: row.status,
      review_item_id: id,
      kind: row.kind,
      decided_by,
    };
  }

  async function get({ id }) {
    const m = memories.get(id);
    if (!m) return { status: 'error', error: 'NOT_FOUND' };
    return { status: 'ok', memory: m };
  }

  async function store({ namespace, text, metadata = {} }) {
    const id = randomUUID();
    memories.set(id, {
      id,
      namespace,
      type: metadata.type || 'semantic',
      scope: metadata.scope || 'global',
      text,
      provenance: {
        author: metadata.author || 'stub',
        origin: metadata.origin || 'store',
        caller_node_id: metadata.caller_node_id,
      },
      grounding_ids: metadata.grounding_ids || [],
      approval: 'live',
      index_status: 'staged',
    });
    return { status: 'ok', id };
  }

  async function recall({ namespace, query, k = 8 }) {
    const hits = [...memories.values()]
      .filter((m) => m.namespace === namespace)
      .filter((m) => !query || m.text.toLowerCase().includes(String(query).toLowerCase().split(/\s+/)[0] || ''))
      .slice(0, k);
    // Fallback: any in namespace
    const results =
      hits.length > 0
        ? hits
        : [...memories.values()].filter((m) => m.namespace === namespace).slice(0, k);
    return {
      status: results.length ? 'ok' : 'cold_start',
      count: results.length,
      results: results.map((m) => ({ id: m.id, text: m.text, namespace: m.namespace, provenance: m.provenance })),
    };
  }

  async function ingest_file({ namespace, filename, content_base64, metadata = {} }) {
    const text = Buffer.from(content_base64, 'base64').toString('utf8');
    const chunks = text.split(/\n\n+/).filter(Boolean);
    const ids = [];
    for (const chunk of chunks) {
      const r = await store({
        namespace,
        text: chunk.slice(0, 2000),
        metadata: { ...metadata, author: metadata.author || 'moose-standin', filename },
      });
      ids.push(r.id);
    }
    return { status: 'ok', filename, chunks: chunks.length, stored: ids.length, ids };
  }

  return {
    propose,
    review_list,
    promote,
    reject_proposal,
    review_decide,
    get,
    store,
    recall,
    ingest_file,
    enqueueReviewItem,
    // test introspection
    _proposals: proposals,
    _reviewItems: reviewItems,
    _memories: memories,
  };
}
