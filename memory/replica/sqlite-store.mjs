/**
 * P2.R1 — local SQLite read-cache substrate (ICM-shaped; node:sqlite).
 *
 * Prefer FTS5 when the host Node build compiled sqlite with ENABLE_FTS5.
 * Some Cursor cloud / Node 22 builds ship ENABLE_FTS5=0 ("no such module: fts5").
 * In that case we keep the same memories table + a portable LIKE text search so
 * hot/standard profiles and smoke stay green without a Mac-only Node sqlite.
 *
 * ICM binary stays out-of-tree. full vectors stay P1.M8.
 *
 * Single-writer discipline: only pull.apply writes here; devices never
 * invent writes into Neon via this path.
 */

import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const SCHEMA_BASE = `
CREATE TABLE IF NOT EXISTS replica_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS memories (
  id               TEXT PRIMARY KEY,
  namespace         TEXT NOT NULL,
  type             TEXT NOT NULL,
  scope            TEXT NOT NULL DEFAULT 'global',
  text             TEXT NOT NULL,
  importance       INTEGER NOT NULL DEFAULT 5,
  strength         REAL NOT NULL DEFAULT 5.0,
  pinned           INTEGER NOT NULL DEFAULT 0,
  approval         TEXT NOT NULL DEFAULT 'live',
  valid_from       TEXT,
  valid_to         TEXT,
  created_at       TEXT,
  updated_at       TEXT,
  grounding_ids    TEXT NOT NULL DEFAULT '[]',
  provenance       TEXT NOT NULL DEFAULT '{}',
  last_op          TEXT,
  last_seq         INTEGER
);

CREATE INDEX IF NOT EXISTS memories_ns ON memories (namespace);
CREATE INDEX IF NOT EXISTS memories_type ON memories (type);
CREATE INDEX IF NOT EXISTS memories_pinned ON memories (pinned) WHERE pinned = 1;
CREATE INDEX IF NOT EXISTS memories_text_ns ON memories (namespace, type);
`;

const SCHEMA_FTS = `
CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
  text,
  namespace,
  type,
  content='memories',
  content_rowid='rowid'
);

CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
  INSERT INTO memories_fts(rowid, text, namespace, type)
  VALUES (new.rowid, new.text, new.namespace, new.type);
END;

CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
  INSERT INTO memories_fts(memories_fts, rowid, text, namespace, type)
  VALUES ('delete', old.rowid, old.text, old.namespace, old.type);
END;

CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
  INSERT INTO memories_fts(memories_fts, rowid, text, namespace, type)
  VALUES ('delete', old.rowid, old.text, old.namespace, old.type);
  INSERT INTO memories_fts(rowid, text, namespace, type)
  VALUES (new.rowid, new.text, new.namespace, new.type);
END;
`;

/** @type {WeakMap<object, 'fts5'|'like'>} */
const searchBackendByDb = new WeakMap();

/**
 * Probe whether this process's node:sqlite can create an FTS5 virtual table.
 * compileoption alone is not enough — some builds advertise oddly; CREATE is truth.
 * @returns {boolean}
 */
/**
 * Raw compile-option + CREATE probe (ignores GROK_REPLICA_FORCE_LIKE_SEARCH).
 * @returns {boolean}
 */
export function probeFts5CompileOption() {
  let db;
  try {
    db = new DatabaseSync(':memory:');
    const row = db.prepare("SELECT sqlite_compileoption_used('ENABLE_FTS5') AS v").get();
    if (Number(row?.v) !== 1) return false;
    db.exec('CREATE VIRTUAL TABLE __fts5_probe USING fts5(c)');
    db.exec('DROP TABLE __fts5_probe');
    return true;
  } catch {
    return false;
  } finally {
    try {
      db?.close();
    } catch {
      /* ignore */
    }
  }
}

/**
 * Whether openReplicaDb will attempt FTS5 (honors force-like env).
 * @returns {boolean}
 */
export function probeFts5Available() {
  if (process.env.GROK_REPLICA_FORCE_LIKE_SEARCH === '1') return false;
  return probeFts5CompileOption();
}

/**
 * @param {string} pathOrMemory  filesystem path or ':memory:'
 * @param {{ forceLikeSearch?: boolean }} [opts]
 * @returns {DatabaseSync}
 */
export function openReplicaDb(pathOrMemory = ':memory:', opts = {}) {
  if (pathOrMemory !== ':memory:') {
    mkdirSync(dirname(pathOrMemory), { recursive: true });
  }
  const db = new DatabaseSync(pathOrMemory);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA_BASE);

  const forceLike =
    opts.forceLikeSearch === true || process.env.GROK_REPLICA_FORCE_LIKE_SEARCH === '1';
  let backend = 'like';
  if (!forceLike) {
    try {
      const row = db.prepare("SELECT sqlite_compileoption_used('ENABLE_FTS5') AS v").get();
      if (Number(row?.v) === 1) {
        db.exec(SCHEMA_FTS);
        backend = 'fts5';
      }
    } catch (err) {
      const msg = err && typeof err === 'object' && 'message' in err ? String(err.message) : String(err);
      if (!/no such module:\s*fts5/i.test(msg) && !/fts5/i.test(msg)) throw err;
      backend = 'like';
    }
  }

  searchBackendByDb.set(db, backend);
  // meta table exists after SCHEMA_BASE
  db.prepare(
    `INSERT INTO replica_meta (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run('search_backend', backend);

  return db;
}

/**
 * @param {DatabaseSync} db
 * @returns {'fts5'|'like'}
 */
export function getSearchBackend(db) {
  const cached = searchBackendByDb.get(db);
  if (cached) return cached;
  const v = getMeta(db, 'search_backend');
  return v === 'fts5' ? 'fts5' : 'like';
}

/**
 * @param {DatabaseSync} db
 * @param {string} key
 * @param {string|number|null} value
 */
export function setMeta(db, key, value) {
  db.prepare(
    `INSERT INTO replica_meta (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(key, value == null ? '' : String(value));
}

/**
 * @param {DatabaseSync} db
 * @param {string} key
 * @returns {string|null}
 */
export function getMeta(db, key) {
  const row = db.prepare('SELECT value FROM replica_meta WHERE key = ?').get(key);
  return row ? String(row.value) : null;
}

/**
 * @param {DatabaseSync} db
 * @returns {number}
 */
export function getLastToken(db) {
  const v = getMeta(db, 'last_token');
  if (v == null || v === '') return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * @param {DatabaseSync} db
 * @param {number} token
 */
export function setLastToken(db, token) {
  setMeta(db, 'last_token', Number(token) || 0);
}

/**
 * @param {DatabaseSync} db
 * @param {object} row
 * @param {string} op
 * @param {number} seq
 */
export function upsertMemory(db, row, op, seq) {
  const pinned = row.pinned === true || row.pinned === 1 ? 1 : 0;
  const grounding =
    Array.isArray(row.grounding_ids) ? JSON.stringify(row.grounding_ids) : String(row.grounding_ids || '[]');
  const provenance =
    row.provenance && typeof row.provenance === 'object'
      ? JSON.stringify(row.provenance)
      : String(row.provenance || '{}');

  db.prepare(
    `INSERT INTO memories (
       id, namespace, type, scope, text, importance, strength, pinned, approval,
       valid_from, valid_to, created_at, updated_at, grounding_ids, provenance,
       last_op, last_seq
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       namespace = excluded.namespace,
       type = excluded.type,
       scope = excluded.scope,
       text = excluded.text,
       importance = excluded.importance,
       strength = excluded.strength,
       pinned = excluded.pinned,
       approval = excluded.approval,
       valid_from = excluded.valid_from,
       valid_to = excluded.valid_to,
       created_at = excluded.created_at,
       updated_at = excluded.updated_at,
       grounding_ids = excluded.grounding_ids,
       provenance = excluded.provenance,
       last_op = excluded.last_op,
       last_seq = excluded.last_seq`
  ).run(
    row.id,
    row.namespace || 'unknown',
    row.type || 'semantic',
    row.scope || 'global',
    String(row.text || ''),
    Number(row.importance ?? 5),
    Number(row.strength ?? 5),
    pinned,
    row.approval || 'live',
    row.valid_from ? new Date(row.valid_from).toISOString() : null,
    row.valid_to ? new Date(row.valid_to).toISOString() : null,
    row.created_at ? new Date(row.created_at).toISOString() : null,
    row.updated_at ? new Date(row.updated_at).toISOString() : null,
    grounding,
    provenance,
    op,
    Number(seq)
  );
}

/**
 * Retire / remove a memory from the local cache on sync retire.
 * @param {DatabaseSync} db
 * @param {string} memoryId
 * @param {number} seq
 */
export function retireMemory(db, memoryId, seq) {
  const existing = db.prepare('SELECT id FROM memories WHERE id = ?').get(memoryId);
  if (existing) {
    db.prepare('DELETE FROM memories WHERE id = ?').run(memoryId);
  }
  // Keep watermark advancement even if row was never hot-set locally.
  void seq;
}

/**
 * Split a simple FTS5-ish query (`a OR b OR c`) into tokens for LIKE fallback.
 * @param {string} matchQuery
 * @returns {string[]}
 */
function tokenizeSearchQuery(matchQuery) {
  return String(matchQuery || '')
    .split(/\s+OR\s+/i)
    .map((t) => t.replace(/^["']|["']$/g, '').trim())
    .filter(Boolean)
    .map((t) => t.replace(/[%_]/g, '')); // strip LIKE wildcards from user token
}

/**
 * Portable text search for P2.R1 when FTS5 is unavailable.
 * @param {DatabaseSync} db
 * @param {string} matchQuery
 * @param {number} limit
 */
function likeSearch(db, matchQuery, limit) {
  const tokens = tokenizeSearchQuery(matchQuery);
  if (tokens.length === 0) return [];
  const clauses = tokens.map(() => `(m.text LIKE ? ESCAPE '\\' OR m.namespace LIKE ? ESCAPE '\\' OR m.type LIKE ? ESCAPE '\\')`);
  const params = [];
  for (const t of tokens) {
    const p = `%${t}%`;
    params.push(p, p, p);
  }
  return db
    .prepare(
      `SELECT m.id, m.namespace, m.type, m.text, m.pinned, m.importance, m.last_seq
       FROM memories m
       WHERE ${clauses.join(' OR ')}
       LIMIT ?`
    )
    .all(...params, limit);
}

/**
 * @param {DatabaseSync} db
 * @param {string} matchQuery  FTS5 query (or OR-joined tokens for LIKE fallback)
 * @param {number} [limit]
 */
export function ftsSearch(db, matchQuery, limit = 20) {
  if (getSearchBackend(db) === 'fts5') {
    return db
      .prepare(
        `SELECT m.id, m.namespace, m.type, m.text, m.pinned, m.importance, m.last_seq
         FROM memories_fts f
         JOIN memories m ON m.rowid = f.rowid
         WHERE memories_fts MATCH ?
         LIMIT ?`
      )
      .all(matchQuery, limit);
  }
  return likeSearch(db, matchQuery, limit);
}

/**
 * @param {DatabaseSync} db
 */
export function countMemories(db) {
  const row = db.prepare('SELECT COUNT(*) AS n FROM memories').get();
  return Number(row?.n || 0);
}

/**
 * @param {DatabaseSync} db
 */
export function snapshotStats(db) {
  const total = countMemories(db);
  const pinned = Number(db.prepare('SELECT COUNT(*) AS n FROM memories WHERE pinned = 1').get()?.n || 0);
  const episodic = Number(
    db.prepare(`SELECT COUNT(*) AS n FROM memories WHERE type = 'episodic'`).get()?.n || 0
  );
  const project = Number(
    db.prepare(`SELECT COUNT(*) AS n FROM memories WHERE namespace LIKE 'project-%'`).get()?.n || 0
  );
  const semantic = Number(
    db.prepare(`SELECT COUNT(*) AS n FROM memories WHERE type = 'semantic'`).get()?.n || 0
  );
  const procedural = Number(
    db.prepare(`SELECT COUNT(*) AS n FROM memories WHERE type = 'procedural'`).get()?.n || 0
  );
  return {
    total,
    pinned,
    episodic,
    project,
    semantic,
    procedural,
    last_token: getLastToken(db),
    profile: getMeta(db, 'profile'),
    search_backend: getSearchBackend(db),
  };
}

export function closeReplicaDb(db) {
  try {
    db.close();
  } catch {
    /* already closed */
  }
}
