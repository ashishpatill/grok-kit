/**
 * In-memory adapter for CLI smoke tests (no Neon / Postgres required).
 * Keyword-only recall; hybrid=false. Matches MCP envelope shapes via core.mjs.
 *
 * Optional MEMORY_STUB_PATH: persist rows to a JSON file so successive CLI
 * process invocations share state (used by smoke.mjs process round-trip).
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

function tokenize(s) {
  return String(s)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1);
}

function loadSeed(path) {
  if (!path || !existsSync(path)) return [];
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8'));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function persist(path, memories) {
  if (!path) return;
  writeFileSync(path, JSON.stringify([...memories.values()], null, 2));
}

export function createStubAdapter(seed = [], opts = {}) {
  const stubPath = opts.path || process.env.MEMORY_STUB_PATH || null;
  const initial = seed.length ? seed : loadSeed(stubPath);
  /** @type {Map<string, object>} */
  const memories = new Map();
  for (const row of initial) {
    memories.set(row.id, { ...row });
  }

  return {
    async insertMemory(row) {
      const created_at = new Date().toISOString();
      const stored = {
        ...row,
        created_at,
        updated_at: created_at,
      };
      memories.set(stored.id, stored);
      persist(stubPath, memories);
      return {
        id: stored.id,
        namespace: stored.namespace,
        index_status: stored.index_status,
        approval: stored.approval,
        created_at: stored.created_at,
      };
    },

    async enqueueEmbed(_memoryId) {
      return { jobId: null, enqueue_error: null };
    },

    async recall({ namespace, query, k }) {
      const live = [...memories.values()].filter(
        (m) =>
          m.namespace === namespace &&
          m.approval === 'live' &&
          (m.index_status === 'indexed' || m.index_status === 'staged')
      );
      const qTokens = new Set(tokenize(query));
      const scored = [];
      for (const m of live) {
        const tTokens = tokenize(m.text);
        let hits = 0;
        for (const t of tTokens) if (qTokens.has(t)) hits += 1;
        if (hits === 0) continue;
        scored.push({ m, hits });
      }
      scored.sort(
        (a, b) =>
          b.hits - a.hits ||
          String(b.m.created_at).localeCompare(String(a.m.created_at))
      );
      const top = scored.slice(0, k);
      const rows = top.map((s, i) => ({
        id: s.m.id,
        text: s.m.text,
        index_status: s.m.index_status,
        approval: s.m.approval,
        type: s.m.type,
        importance: s.m.importance,
        rrf: s.hits / (60 + i + 1),
        created_at: s.m.created_at,
      }));
      return {
        rows,
        legs: { keyword: rows.length, vector: 0 },
        hybrid: false,
        liveCount: live.length,
      };
    },

    async listNamespaces() {
      const counts = new Map();
      for (const m of memories.values()) {
        if (m.approval !== 'live') continue;
        counts.set(m.namespace, (counts.get(m.namespace) || 0) + 1);
      }
      return [...counts.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([namespace, n]) => ({ namespace, n }));
    },

    _dump() {
      return [...memories.values()];
    },
  };
}
