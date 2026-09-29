/**
 * P3.H1 — hot-pin export from Neon pinned / identity memories.
 *
 * Generates a human-editable MEMORY.md (and optional topic index) using the
 * inject-index pattern: put the compact index in the prompt; load full topic
 * bodies on demand via recall/get. Export-only — never dual-write the hot pin
 * from multiple agent homes (see docs/icm-setup.md).
 */

export const MEMORY_CAP = 2200;
export const USER_CAP = 1375;
export const ENTRY_SEP = '\n§\n';

/** Strip synthetic seed noise so near-duplicates collapse. */
export function normalizeHotText(text) {
  return String(text || '')
    .replace(/\s*Context tag MEMKEY-\d+[-\w]*\.?/gi, '')
    .replace(/\s*Related:?\s*.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * @typedef {{ id: string, namespace: string, type?: string, text: string, importance?: number|null, pinned?: boolean, created_at?: string|Date, provenance?: object }} HotPinRow
 */

/**
 * Dedupe by normalized text; keep highest importance then earliest created_at.
 * @param {HotPinRow[]} rows
 * @returns {HotPinRow[]}
 */
export function dedupePinned(rows) {
  /** @type {Map<string, HotPinRow & { core: string }>} */
  const best = new Map();
  for (const row of rows) {
    const core = normalizeHotText(row.text);
    if (!core) continue;
    const key = core.toLowerCase();
    const prev = best.get(key);
    const cand = { ...row, text: core, core };
    if (!prev) {
      best.set(key, cand);
      continue;
    }
    const impA = Number(cand.importance ?? 0);
    const impB = Number(prev.importance ?? 0);
    if (impA > impB) {
      best.set(key, cand);
      continue;
    }
    if (impA < impB) continue;
    const tA = new Date(cand.created_at || 0).getTime();
    const tB = new Date(prev.created_at || 0).getTime();
    if (tA < tB) best.set(key, cand);
  }
  return [...best.values()].sort((a, b) => {
    const d = Number(b.importance ?? 0) - Number(a.importance ?? 0);
    if (d !== 0) return d;
    return String(a.created_at || '').localeCompare(String(b.created_at || ''));
  });
}

/**
 * Pack entries under a character budget (joined with § separators).
 * @param {HotPinRow[]} entries
 * @param {number} cap
 */
export function selectWithinCap(entries, cap) {
  /** @type {HotPinRow[]} */
  const out = [];
  let used = 0;
  for (const e of entries) {
    const piece = e.text;
    const extra = out.length === 0 ? piece.length : ENTRY_SEP.length + piece.length;
    if (used + extra > cap) continue;
    out.push(e);
    used += extra;
  }
  return { entries: out, chars: used, omitted: entries.length - out.length };
}

/**
 * @param {object} opts
 * @param {HotPinRow[]} opts.entries
 * @param {string} [opts.generatedAt]
 * @param {string} [opts.source]
 * @param {number} [opts.cap]
 * @param {number} [opts.omitted]
 * @param {number} [opts.candidates]
 */
export function formatMemoryMd(opts) {
  const {
    entries,
    generatedAt = new Date().toISOString(),
    source = 'neon-pinned',
    cap = MEMORY_CAP,
    omitted = 0,
    candidates = entries.length,
  } = opts;
  const body = entries.map((e) => e.text).join(ENTRY_SEP);
  const header = [
    '# Hot-pin MEMORY (exported)',
    '',
    `<!-- generated: ${generatedAt}; source: ${source}; cap: ${cap};`,
    `     entries: ${entries.length}/${candidates}; omitted_by_cap: ${omitted};`,
    '     export-only — one write path into Neon; do not dual-write this file',
    '     from multiple agent homes. Edit → propose() back; never silent store. -->',
    '',
  ].join('\n');
  return body ? `${header}${body}\n` : `${header}_(empty — no pinned/identity rows selected)_\n`;
}

/**
 * Compact topic index for prompt injection (full bodies via recall/get).
 * @param {{ entries: HotPinRow[] }} opts
 */
export function formatTopicIndex(opts) {
  const { entries } = opts;
  const lines = [
    '# Hot-pin topic index (inject-index)',
    '',
    'Inject this index into the prompt. Load full text on demand with',
    '`recall(namespace, query)` or `get(id)` — do not paste every body.',
    '',
    '| namespace | id | chars | preview |',
    '| --- | --- | ---: | --- |',
  ];
  for (const e of entries) {
    const preview = e.text.replace(/\|/g, '\\|').slice(0, 72);
    lines.push(`| ${e.namespace} | \`${e.id}\` | ${e.text.length} | ${preview} |`);
  }
  lines.push('');
  return lines.join('\n');
}

/**
 * Build export artifacts from raw memory rows.
 * @param {HotPinRow[]} rows
 * @param {{ memoryCap?: number, userCap?: number, generatedAt?: string, source?: string }} [opts]
 */
export function buildHotPinExport(rows, opts = {}) {
  const memoryCap = opts.memoryCap ?? MEMORY_CAP;
  const userCap = opts.userCap ?? USER_CAP;
  const generatedAt = opts.generatedAt || new Date().toISOString();
  const source = opts.source || 'neon-pinned';

  const deduped = dedupePinned(rows);
  const memPack = selectWithinCap(deduped, memoryCap);
  const userCandidates = deduped.filter(
    (r) => r.namespace === 'preferences' || /prefer|timezone|hardware|commit/i.test(r.text)
  );
  const userPack = selectWithinCap(userCandidates, userCap);

  const memory_md = formatMemoryMd({
    entries: memPack.entries,
    generatedAt,
    source,
    cap: memoryCap,
    omitted: memPack.omitted,
    candidates: deduped.length,
  });
  const user_md = formatMemoryMd({
    entries: userPack.entries,
    generatedAt,
    source: `${source}+preferences`,
    cap: userCap,
    omitted: userPack.omitted,
    candidates: userCandidates.length,
  }).replace('# Hot-pin MEMORY (exported)', '# Hot-pin USER (exported)');
  const topics_md = formatTopicIndex({ entries: memPack.entries });

  return {
    memory_md,
    user_md,
    topics_md,
    stats: {
      candidates: rows.length,
      unique: deduped.length,
      memory_entries: memPack.entries.length,
      memory_chars: memPack.chars,
      memory_omitted: memPack.omitted,
      user_entries: userPack.entries.length,
      user_chars: userPack.chars,
      memory_cap: memoryCap,
      user_cap: userCap,
      ids: memPack.entries.map((e) => e.id),
    },
  };
}

/**
 * SQL filter for hot-pin export candidates.
 * pinned=true OR identity namespaces (preferences / workspace-routing / models).
 */
export const HOT_PIN_SQL = `
  SELECT id, namespace, type, text, importance, pinned, created_at, provenance
  FROM memories
  WHERE approval = 'live'
    AND (valid_to IS NULL OR valid_to > now())
    AND superseded_by IS NULL
    AND (
      pinned = true
      OR namespace IN ('preferences', 'workspace-routing', 'models')
    )
  ORDER BY pinned DESC, importance DESC NULLS LAST, created_at ASC
`;
