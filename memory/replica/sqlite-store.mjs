/**
 * P2.R1 — local SQLite + FTS5 read-cache substrate (ICM-shaped; node:sqlite).
 *
 * ICM binary is out-of-tree; this minimal module mirrors its SQLite+FTS5 shape
 * for hot/standard profiles (text only). full vectors stay P1.M8.
 *
 * Single-writer discipline: only pull.apply writes here; devices never
 * invent writes into Neon via this path.
 */

import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const SCHEMA = `
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

/**
 * @param {string} pathOrMemory  filesystem path or ':memory:'
 * @returns {DatabaseSync}
 */
export function openReplicaDb(pathOrMemory = ':memory:') {
  if (pathOrMemory !== ':memory:') {
    mkdirSync(dirname(pathOrMemory), { recursive: true });
  }
  const db = new DatabaseSync(pathOrMemory);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  return db;
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
 * @param {DatabaseSync} db
 * @param {string} matchQuery  FTS5 query
 * @param {number} [limit]
 */
export function ftsSearch(db, matchQuery, limit = 20) {
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
  };
}

export function closeReplicaDb(db) {
  try {
    db.close();
  } catch {
    /* already closed */
  }
}
