/**
 * Parse bot-memory JSONL shaped like spikes/A0/real-corpus.jsonl:
 *   {id, namespace, type, text, importance, content_hash, provenance}
 *
 * Missing content_hash is filled from hash.mjs. Invalid lines are collected
 * into errors (caller decides whether to abort).
 */
import { readFileSync } from 'node:fs';
import { contentHash } from './hash.mjs';

const MEMORY_TYPES = new Set([
  'working',
  'episodic',
  'semantic',
  'procedural',
  'goals',
  'reflective',
]);

/**
 * @typedef {object} ImportCandidate
 * @property {string} id
 * @property {string} namespace
 * @property {string} type
 * @property {string} text
 * @property {number} importance
 * @property {string} content_hash
 * @property {object} provenance
 * @property {number} line  1-based source line
 */

/**
 * @param {string} filePath
 * @returns {{ candidates: ImportCandidate[], errors: {line:number, detail:string}[] }}
 */
export function parseJsonlFile(filePath) {
  const raw = readFileSync(filePath, 'utf8');
  return parseJsonlText(raw);
}

/**
 * @param {string} raw
 * @returns {{ candidates: ImportCandidate[], errors: {line:number, detail:string}[] }}
 */
export function parseJsonlText(raw) {
  const candidates = [];
  const errors = [];
  const lines = String(raw).split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    const line = lines[i].trim();
    if (!line) continue;

    let obj;
    try {
      obj = JSON.parse(line);
    } catch (e) {
      errors.push({ line: lineNo, detail: `JSON parse: ${e.message || e}` });
      continue;
    }

    if (!obj || typeof obj !== 'object') {
      errors.push({ line: lineNo, detail: 'expected object' });
      continue;
    }

    const text = obj.text;
    const namespace = obj.namespace;
    if (!namespace || typeof namespace !== 'string') {
      errors.push({ line: lineNo, detail: 'namespace required' });
      continue;
    }
    if (!text || typeof text !== 'string') {
      errors.push({ line: lineNo, detail: 'text required' });
      continue;
    }

    const type = obj.type || 'semantic';
    if (!MEMORY_TYPES.has(type)) {
      errors.push({ line: lineNo, detail: `bad type: ${type}` });
      continue;
    }

    let importance = obj.importance ?? 5;
    if (typeof importance !== 'number' || importance < 1 || importance > 10) {
      errors.push({ line: lineNo, detail: 'importance must be 1..10' });
      continue;
    }

    const provenance =
      obj.provenance && typeof obj.provenance === 'object' ? { ...obj.provenance } : {};

    let hash =
      typeof obj.content_hash === 'string' && obj.content_hash.length > 0
        ? obj.content_hash
        : contentHash(text);

    // Prefer explicit id; else bm-<hash prefix> like the spike export.
    const id =
      typeof obj.id === 'string' && obj.id.length > 0
        ? obj.id
        : `bm-${hash.slice(0, 16)}`;

    candidates.push({
      id,
      namespace,
      type,
      text,
      importance,
      content_hash: hash,
      provenance,
      line: lineNo,
    });
  }

  return { candidates, errors };
}
