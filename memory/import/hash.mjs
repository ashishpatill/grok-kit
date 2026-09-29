/**
 * Content-hash helpers for the import pipeline (P1.M6).
 *
 * content_hash = sha256 of normalized text. Matches the spike export intent
 * (see spikes/A0/scripts/export_real_memories.py) and adds whitespace
 * normalization so "foo  bar" and "foo bar" collide to one hash.
 *
 * Normalization (spell-out): trim ends, collapse any run of whitespace to a
 * single space, then lowercase. Hash is hex sha256 of UTF-8 bytes.
 */
import { createHash } from 'node:crypto';

/**
 * Normalize text for hashing / near-identical comparison.
 * @param {string} text
 * @returns {string}
 */
export function normalizeText(text) {
  return String(text ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/**
 * sha256 hex digest of normalized text.
 * @param {string} text
 * @returns {string} 64-char hex
 */
export function contentHash(text) {
  const norm = normalizeText(text);
  return createHash('sha256').update(norm, 'utf8').digest('hex');
}

/**
 * True when two texts are near-identical after normalization (exact match
 * on the normalized form — deterministic, no LLM).
 * @param {string} a
 * @param {string} b
 */
export function nearIdentical(a, b) {
  return normalizeText(a) === normalizeText(b);
}

/**
 * True when texts differ "materially" (normalized forms are not equal).
 * Used when the same yaml_id / id arrives with a different content_hash.
 */
export function differsMaterially(a, b) {
  return normalizeText(a) !== normalizeText(b);
}
