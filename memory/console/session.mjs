/**
 * Console session — local product surface over the same store/recall/propose
 * gates as memory-mcp. Default backend is an in-memory stub seeded for demos
 * (no Neon required). Optional DATABASE_URL + MEMORY_BACKEND=pg for live reads
 * of review_list / recall (writes still go through the same gate helpers).
 *
 * Honest: human-gated propose, visible recall provenance, hot-pin export preview.
 * Not a fake dashboard — every action maps to real IDL paths.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { store, recall, listNamespaces } from '../cli/core.mjs';
import { createStubAdapter } from '../cli/stub.mjs';
import { routePropose, isHumanGated } from '../lib/propose-route.mjs';
import { buildHotPinExport } from '../export/hot-pin.mjs';
import { CURATOR_IDENTITY } from '../lib/curator-decide.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const DEFAULT_SEED = join(__dir, 'fixtures', 'demo-seed.json');

/**
 * In-memory Queryable for proposals + review_items so curator helpers can run
 * without Postgres during stub demos.
 */
function createMemoryDb(initialProposals = []) {
  /** @type {Map<string, object>} */
  const proposals = new Map();
  /** @type {Map<string, object>} */
  const reviewItems = new Map();
  for (const p of initialProposals) proposals.set(p.id, { ...p });

  function matchUpdate(sql, params) {
    // Minimal SQL surface used by curator-decide.mjs
    const s = sql.replace(/\s+/g, ' ').trim();
    if (/^SELECT \* FROM proposals WHERE id = \$1/i.test(s) || /^SELECT id, status FROM proposals WHERE id = \$1/i.test(s)) {
      const row = proposals.get(params[0]);
      return { rows: row ? [row] : [] };
    }
    if (/FROM proposals/i.test(s) && /WHERE status = \$1/i.test(s)) {
      const status = params[0];
      const rows = [...proposals.values()]
        .filter((p) => p.status === status)
        .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
      return { rows };
    }
    if (/FROM review_items/i.test(s) && /WHERE status = \$1/i.test(s)) {
      const status = params[0];
      const rows = [...reviewItems.values()]
        .filter((r) => r.status === status)
        .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
      return { rows };
    }
    if (/^SELECT \* FROM review_items WHERE id = \$1/i.test(s)) {
      const row = reviewItems.get(params[0]);
      return { rows: row ? [row] : [] };
    }
    if (/^INSERT INTO memories/i.test(s)) {
      // Handled by session.promote — stub path inserts via adapter instead.
      return { rows: [] };
    }
    if (/^UPDATE proposals/i.test(s) && /status = 'approved'/i.test(s)) {
      const [id, decided_by, promoted_id] = params;
      const row = proposals.get(id);
      if (row) {
        row.status = 'approved';
        row.decided_by = decided_by;
        row.decided_at = new Date().toISOString();
        row.promoted_id = promoted_id;
      }
      return { rows: [] };
    }
    if (/^UPDATE proposals/i.test(s) && /status = 'rejected'/i.test(s)) {
      const [id, decided_by] = params;
      const row = proposals.get(id);
      if (row) {
        row.status = 'rejected';
        row.decided_by = decided_by;
        row.decided_at = new Date().toISOString();
      }
      return { rows: [] };
    }
    if (/^UPDATE review_items/i.test(s)) {
      const [id, newStatus, decided_by, payloadJson] = params;
      const row = reviewItems.get(id);
      if (row) {
        row.status = newStatus;
        row.decided_by = decided_by;
        row.decided_at = new Date().toISOString();
        if (payloadJson) row.payload = JSON.parse(payloadJson);
      }
      return { rows: [] };
    }
    if (/^INSERT INTO proposals/i.test(s)) {
      // unused — we insert via session.propose
      return { rows: [] };
    }
    throw new Error(`memory-db unsupported SQL: ${s.slice(0, 120)}`);
  }

  return {
    proposals,
    reviewItems,
    async query(sql, params = []) {
      return matchUpdate(sql, params);
    },
  };
}

function loadSeed(path) {
  const p = path || process.env.MEMORY_CONSOLE_SEED || DEFAULT_SEED;
  if (!existsSync(p)) return [];
  const raw = JSON.parse(readFileSync(p, 'utf8'));
  return Array.isArray(raw) ? raw : [];
}

/**
 * @param {{ seedPath?: string, seedProposals?: object[] }} [opts]
 */
export function createConsoleSession(opts = {}) {
  const seed = loadSeed(opts.seedPath);
  const adapter = createStubAdapter(seed);
  const db = createMemoryDb(opts.seedProposals || defaultPendingProposals());
  const startedAt = new Date().toISOString();

  async function status() {
    const ns = await listNamespaces(adapter);
    const pending = [...db.proposals.values()].filter((p) => p.status === 'pending');
    const all = adapter._dump();
    return {
      status: 'ok',
      product: 'bot-memory-console',
      backend: 'stub',
      started_at: startedAt,
      memories_live: all.filter((m) => m.approval === 'live').length,
      namespaces: ns.namespaces,
      pending_proposals: pending.length,
      note:
        'Stub demo session. Same propose gates + visible recall shaping as memory-mcp. Point MEMORY_BACKEND=pg + DATABASE_URL at Neon for live MCP/CLI.',
    };
  }

  async function doStore(namespace, text, metadata = {}) {
    return store(adapter, namespace, text, { ...metadata, origin: metadata.origin || 'console-store' });
  }

  async function doRecall(namespace, query, k = 8) {
    return recall(adapter, namespace, query, k);
  }

  async function doListNamespaces() {
    return listNamespaces(adapter);
  }

  async function doPropose(namespace, text, metadata = {}) {
    const type = metadata.type || 'semantic';
    const scope = metadata.scope || 'global';
    const pinned = Boolean(metadata.pinned);
    const grounding_ids = Array.isArray(metadata.grounding_ids) ? metadata.grounding_ids : [];
    const routed = routePropose({ type, scope, pinned, grounding_ids, namespace });

    if (!isHumanGated(routed)) {
      const stored = await store(adapter, namespace, text, {
        ...metadata,
        type,
        scope,
        pinned,
        grounding_ids,
        origin: metadata.origin || 'console-propose-auto',
        author: metadata.author || 'console',
      });
      if (stored.status === 'error') return stored;
      return {
        status: 'ok',
        decision: 'auto_approved',
        reason: routed.reason,
        id: stored.id,
      };
    }

    const id = metadata.id || randomUUID();
    const created_at = new Date().toISOString();
    const proposal = {
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
        source_session: metadata.source_session || `console-${Date.now()}`,
        author: metadata.author || 'console',
        origin: metadata.origin || 'console-propose',
        created_at,
      },
      route_reason: routed.reason,
      status: 'pending',
      decided_by: null,
      decided_at: null,
      promoted_id: null,
      created_at,
    };
    db.proposals.set(id, proposal);
    return {
      status: 'ok',
      decision: 'queued_for_review',
      reason: routed.reason,
      proposal_id: id,
    };
  }

  async function doReviewList() {
    const proposals = [...db.proposals.values()]
      .filter((p) => p.status === 'pending')
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    const review_items = [...db.reviewItems.values()].filter((r) => r.status === 'queued');
    return {
      status: 'ok',
      proposals,
      review_items,
      counts: { proposals: proposals.length, review_items: review_items.length },
    };
  }

  async function doPromote(proposal_id, decided_by = 'human:console', note) {
    const row = db.proposals.get(proposal_id);
    if (!row) return { status: 'error', error: 'NOT_FOUND', detail: `proposal ${proposal_id}` };
    if (row.status !== 'pending') {
      return { status: 'error', error: 'CONFLICT', detail: `proposal status=${row.status}` };
    }
    const stored = await store(adapter, row.namespace, row.text, {
      type: row.type,
      scope: row.scope,
      pinned: row.pinned,
      importance: row.importance,
      strength: row.strength,
      grounding_ids: row.grounding_ids || [],
      author: decided_by,
      origin: 'promote',
      source_session: row.provenance?.source_session,
    });
    if (stored.status === 'error') return stored;
    // stamp promote provenance extras onto the memory if present
    const mem = adapter._dump().find((m) => m.id === stored.id);
    if (mem) {
      mem.provenance = {
        ...(mem.provenance || {}),
        ...(row.provenance || {}),
        author: decided_by,
        origin: 'promote',
        promoted_from: proposal_id,
        decided_by,
        ...(note ? { decision_note: note } : {}),
      };
      if (row.pinned) mem.pinned = true;
    }
    row.status = 'approved';
    row.decided_by = decided_by;
    row.decided_at = new Date().toISOString();
    row.promoted_id = stored.id;
    return {
      status: 'ok',
      decision: 'approved',
      proposal_id,
      promoted_id: stored.id,
      decided_by,
    };
  }

  async function doReject(proposal_id, decided_by = 'human:console', note) {
    const row = db.proposals.get(proposal_id);
    if (!row) return { status: 'error', error: 'NOT_FOUND', detail: `proposal ${proposal_id}` };
    if (row.status !== 'pending') {
      return { status: 'error', error: 'CONFLICT', detail: `proposal status=${row.status}` };
    }
    row.status = 'rejected';
    row.decided_by = decided_by;
    row.decided_at = new Date().toISOString();
    if (note) row.reject_note = note;
    return { status: 'ok', decision: 'rejected', proposal_id, decided_by, note: note || null };
  }

  async function hotPinPreview() {
    const rows = adapter
      ._dump()
      .filter((m) => m.approval === 'live')
      .filter(
        (m) =>
          m.pinned ||
          m.namespace === 'preferences' ||
          m.namespace === 'workspace-routing' ||
          m.namespace === 'models'
      );
    const built = buildHotPinExport(rows, { topics: true });
    return {
      status: 'ok',
      source: 'console-stub',
      ...built,
    };
  }

  return {
    status,
    store: doStore,
    recall: doRecall,
    listNamespaces: doListNamespaces,
    propose: doPropose,
    reviewList: doReviewList,
    promote: doPromote,
    reject: doReject,
    hotPinPreview,
    adapter,
    curatorIdentity: CURATOR_IDENTITY,
  };
}

function defaultPendingProposals() {
  const now = new Date().toISOString();
  return [
    {
      id: 'prop_identity_01',
      namespace: 'preferences',
      type: 'semantic',
      scope: 'global',
      text: 'Preference: keep public docs free of private project names and credentials; use synthetic examples in demos.',
      importance: 8,
      strength: 5.0,
      pinned: false,
      grounding_ids: [],
      provenance: {
        author: 'memory-sync',
        origin: 'memory-sync',
        source_session: 'demo-seed',
        created_at: now,
      },
      route_reason: 'identity-ns-human-always',
      status: 'pending',
      decided_by: null,
      decided_at: null,
      promoted_id: null,
      created_at: now,
    },
    {
      id: 'prop_proc_01',
      namespace: 'project-demo',
      type: 'procedural',
      scope: 'global',
      text: 'Procedure: after a deep session, run session-handoff then memory-sync — propose only, never silent identity writes.',
      importance: 7,
      strength: 5.0,
      pinned: false,
      grounding_ids: ['mem_gate_01'],
      provenance: {
        author: 'bot:coder-01',
        origin: 'refine-harness',
        source_session: 'demo-seed',
        bot_id: 'coder-01',
        created_at: now,
      },
      route_reason: 'procedural-human-always',
      status: 'pending',
      decided_by: null,
      decided_at: null,
      promoted_id: null,
      created_at: now,
    },
    {
      id: 'prop_low_01',
      namespace: 'project-demo',
      type: 'semantic',
      scope: 'global',
      text: 'Learning: the review queue is the human gate for low-evidence and poison-shaped proposes.',
      importance: 5,
      strength: 5.0,
      pinned: false,
      grounding_ids: [],
      provenance: {
        author: 'bot:researcher-01',
        origin: 'propose',
        source_session: 'demo-seed',
        created_at: now,
      },
      route_reason: 'low-evidence',
      status: 'pending',
      decided_by: null,
      decided_at: null,
      promoted_id: null,
      created_at: now,
    },
  ];
}

export { DEFAULT_SEED, loadSeed };
