/**
 * Shared store / recall / list_namespaces handlers for the CLI twin (P1.M5).
 * Same JSON envelopes as memory-mcp tools. Adapters supply persistence.
 */
import { randomUUID } from 'node:crypto';

export const MEMORY_TYPES = new Set([
  'working',
  'episodic',
  'semantic',
  'procedural',
  'goals',
  'reflective',
]);
export const MEMORY_SCOPES = new Set(['global', 'node_local', 'edge']);

export function validationError(detail) {
  return { status: 'error', error: 'VALIDATION', detail, _isError: true };
}

export function errorEnvelope(error) {
  return { status: 'error', error: String(error), _isError: true };
}

/**
 * @typedef {object} MemoryAdapter
 * @property {(row: object) => Promise<object>} insertMemory
 * @property {(memoryId: string) => Promise<{jobId: *, enqueue_error: *}>} [enqueueEmbed]
 * @property {(args: {namespace:string,query:string,k:number}) => Promise<{
 *   rows: object[], legs: {keyword:number,vector:number}, hybrid: boolean, liveCount: number
 * }>} recall
 * @property {() => Promise<{namespace:string,n:number}[]>} listNamespaces
 */

/**
 * store(namespace, text, metadata?) → MCP store envelope
 * @param {MemoryAdapter} adapter
 */
export async function store(adapter, namespace, text, metadata = {}) {
  if (!namespace || typeof namespace !== 'string') {
    return validationError('namespace is required');
  }
  if (!text || typeof text !== 'string') {
    return validationError('text is required');
  }

  const type = metadata.type || 'semantic';
  const scope = metadata.scope || 'global';
  const author = metadata.author || 'cli';
  const origin = metadata.origin || 'cli-store';
  const source_session = metadata.source_session || `cli-${Date.now()}`;
  const importance = metadata.importance ?? 5;
  const strength = metadata.strength ?? 5.0;
  const pinned = Boolean(metadata.pinned);
  const id = metadata.id || randomUUID();
  const createdAt = new Date().toISOString();

  if (!MEMORY_TYPES.has(type)) {
    return validationError(`type must be one of ${[...MEMORY_TYPES].join(',')}`);
  }
  if (!MEMORY_SCOPES.has(scope)) {
    return validationError(`scope must be one of ${[...MEMORY_SCOPES].join(',')}`);
  }
  if (typeof importance !== 'number' || importance < 1 || importance > 10) {
    return validationError('importance must be 1..10');
  }

  const grounding_ids = Array.isArray(metadata.grounding_ids) ? metadata.grounding_ids : [];
  const provenance = {
    source_session,
    author,
    origin,
    created_at: createdAt,
    embedding_model: null,
  };
  for (const key of ['bot_id', 'caller_node_id', 'trajectory_ref', 'evidence_refs', 'import_batch', 'filename']) {
    if (metadata[key] != null) provenance[key] = metadata[key];
  }

  try {
    const row = await adapter.insertMemory({
      id,
      namespace,
      type,
      scope,
      text,
      importance,
      strength,
      pinned,
      grounding_ids,
      provenance,
      index_status: 'staged',
      approval: 'live',
    });

    let embed_job_id = null;
    let enqueue_error = null;
    if (typeof adapter.enqueueEmbed === 'function') {
      try {
        const enq = await adapter.enqueueEmbed(row.id);
        embed_job_id = enq?.jobId ?? null;
        enqueue_error = enq?.enqueue_error ?? null;
      } catch (e) {
        enqueue_error = String(e.message || e);
      }
    }

    return {
      status: 'ok',
      id: row.id,
      namespace: row.namespace,
      index_status: row.index_status,
      approval: row.approval,
      embedding: null,
      embed_job_id,
      enqueue_error,
      created_at: row.created_at,
    };
  } catch (e) {
    return errorEnvelope(e.message || e);
  }
}

/**
 * recall(namespace, query, k?) → MCP recall envelope
 * @param {MemoryAdapter} adapter
 */
export async function recall(adapter, namespace, query, k = 8) {
  if (!namespace || typeof namespace !== 'string') {
    return validationError('namespace is required');
  }
  if (!query || typeof query !== 'string') {
    return validationError('query is required');
  }
  const kk = Number.isFinite(k) ? Math.trunc(k) : 8;
  if (kk < 1 || kk > 50) {
    return validationError('k must be 1..50');
  }

  try {
    const { rows, legs, hybrid, liveCount } = await adapter.recall({
      namespace,
      query,
      k: kk,
    });

    let status = 'ok';
    if (rows.length === 0) {
      status = liveCount === 0 ? 'cold_start' : 'thin';
    }

    return {
      status,
      namespace,
      query,
      k: kk,
      legs: legs || { keyword: 0, vector: 0 },
      hybrid: Boolean(hybrid),
      count: rows.length,
      results: rows.map((row) => ({
        id: row.id,
        text: row.text,
        index_status: row.index_status,
        approval: row.approval,
        type: row.type,
        importance: row.importance,
        rrf: Number(row.rrf),
        created_at: row.created_at,
      })),
    };
  } catch (e) {
    return errorEnvelope(e.message || e);
  }
}

/**
 * list_namespaces() → MCP list_namespaces envelope
 * @param {MemoryAdapter} adapter
 */
export async function listNamespaces(adapter) {
  try {
    const namespaces = await adapter.listNamespaces();
    return {
      status: 'ok',
      count: namespaces.length,
      namespaces,
    };
  } catch (e) {
    return errorEnvelope(e.message || e);
  }
}
