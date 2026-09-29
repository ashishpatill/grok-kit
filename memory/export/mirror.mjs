/**
 * P3.M1 — mirror_export dry-run (craft-log shaped YAML / JSONL).
 *
 * Export-only dump of live memories into private bot-memory craft shape
 * (`happened` / `wrong` / `worked` / `next`). Default is **dry-run**: write
 * local files only — no git push, no secrets, no dual-write.
 *
 * Corrections still go through propose()/supersede() into Neon (one write path).
 */

export const SECRET_PATTERNS = [
  /DATABASE_URL\s*=/i,
  /WAKE_TOKEN/i,
  /postgres(ql)?:\/\//i,
  /Bearer\s+[A-Za-z0-9._\-]+/i,
  /api[_-]?key\s*[:=]/i,
  /-----BEGIN (RSA |OPENSSH )?PRIVATE KEY-----/,
];

/**
 * Redact / reject secret-looking text. Returns null if the row must be skipped.
 * @param {string} text
 * @returns {{ text: string, redacted: boolean } | null}
 */
export function sanitizeCraftText(text) {
  let t = String(text || '');
  if (!t.trim()) return null;
  for (const re of SECRET_PATTERNS) {
    if (re.test(t)) {
      return null;
    }
  }
  let redacted = false;
  const scrubbed = t.replace(/\b(sk-[A-Za-z0-9]{10,})\b/g, '[REDACTED]');
  if (scrubbed !== t) redacted = true;
  return { text: scrubbed.trim(), redacted };
}

/**
 * Split memory text into craft fields (happened/wrong/worked/next).
 * @param {string} text
 */
export function splitCraftFields(text) {
  const raw = String(text || '').trim();
  const fields = { happened: '', wrong: '', worked: '', next: '' };
  if (!raw) return fields;

  const re =
    /(?:^|[.!?]\s+|;\s*|\n\s*)((?:Happened|Wrong|Worked|Next)\s*[:—-]\s*)([^]*?)(?=(?:(?:^|[.!?]\s+|;\s*|\n\s*)(?:Happened|Wrong|Worked|Next)\s*[:—-])|$)/gi;
  let matched = false;
  let m;
  while ((m = re.exec(raw)) !== null) {
    matched = true;
    const label = m[1].replace(/[:—-\s]+$/i, '').trim().toLowerCase();
    const body = m[2].trim().replace(/[.]+$/, '').trim();
    if (label in fields && body) fields[label] = body.slice(0, 800);
  }

  if (!matched) {
    fields.happened = raw.slice(0, 800);
  }
  return fields;
}

/**
 * @param {object} row
 * @returns {object | null}
 */
export function rowToCraftEntry(row) {
  const sanitized = sanitizeCraftText(row.text);
  if (!sanitized) return null;
  const fields = splitCraftFields(sanitized.text);
  const prov = row.provenance && typeof row.provenance === 'object' ? row.provenance : {};
  return {
    id: row.id,
    namespace: row.namespace || 'unknown',
    type: row.type || 'semantic',
    happened: fields.happened || null,
    wrong: fields.wrong || null,
    worked: fields.worked || null,
    next: fields.next || null,
    importance: row.importance ?? null,
    pinned: Boolean(row.pinned),
    created_at: row.created_at ? new Date(row.created_at).toISOString() : null,
    memory_id: row.id,
    provenance: {
      source_session: prov.source_session || null,
      author: prov.author || null,
      origin: prov.origin || null,
      source_repo: prov.source_repo || null,
      yaml_id: prov.yaml_id || null,
    },
    redacted: sanitized.redacted,
    export: 'mirror_export-dry-run',
  };
}

/**
 * @param {object[]} rows
 * @param {{ generatedAt?: string, source?: string, dryRun?: boolean }} [opts]
 */
export function buildMirrorExport(rows, opts = {}) {
  const generatedAt = opts.generatedAt || new Date().toISOString();
  const source = opts.source || 'neon-live';
  const dryRun = opts.dryRun !== false;
  const entries = [];
  let skipped_secret = 0;
  let skipped_empty = 0;
  for (const row of rows || []) {
    if (!row?.text) {
      skipped_empty += 1;
      continue;
    }
    const entry = rowToCraftEntry(row);
    if (!entry) {
      skipped_secret += 1;
      continue;
    }
    entries.push(entry);
  }

  const jsonl = entries.map((e) => JSON.stringify(e)).join('\n') + (entries.length ? '\n' : '');
  const yaml = formatCraftYaml({ entries, generatedAt, source, dryRun });
  return {
    entries,
    jsonl,
    yaml,
    stats: {
      input: (rows || []).length,
      exported: entries.length,
      skipped_secret,
      skipped_empty,
      dry_run: dryRun,
      generated_at: generatedAt,
      source,
      push: false,
      note: 'dry-run default — local dump only; no git push; no secrets',
    },
  };
}

export function formatCraftYaml({ entries, generatedAt, source, dryRun }) {
  const lines = [
    '# bot-memory craft mirror (export-only)',
    `# generated: ${generatedAt}`,
    `# source: ${source}`,
    `# dry_run: ${dryRun !== false}`,
    '# push: false — never auto-commit secrets or tokens',
    '# corrections: propose()/supersede() into Neon; do not dual-write',
    '',
    'entries:',
  ];
  if (!entries.length) {
    lines.push('  []');
    lines.push('');
    return lines.join('\n');
  }
  for (const e of entries) {
    lines.push(`  - id: ${yamlScalar(e.id)}`);
    lines.push(`    namespace: ${yamlScalar(e.namespace)}`);
    lines.push(`    type: ${yamlScalar(e.type)}`);
    lines.push(`    memory_id: ${yamlScalar(e.memory_id)}`);
    if (e.happened) lines.push(`    happened: ${yamlScalar(e.happened)}`);
    if (e.wrong) lines.push(`    wrong: ${yamlScalar(e.wrong)}`);
    if (e.worked) lines.push(`    worked: ${yamlScalar(e.worked)}`);
    if (e.next) lines.push(`    next: ${yamlScalar(e.next)}`);
    if (e.importance != null) lines.push(`    importance: ${e.importance}`);
    lines.push(`    pinned: ${e.pinned ? 'true' : 'false'}`);
  }
  lines.push('');
  return lines.join('\n');
}

function yamlScalar(v) {
  const s = String(v ?? '');
  if (s === '') return '""';
  if (/[:#{}[\],&*?|>!%@`'"\\]/.test(s) || /\s/.test(s) || /^(true|false|null)$/i.test(s)) {
    return JSON.stringify(s);
  }
  return s;
}

export const MIRROR_SQL = `
SELECT id, namespace, type, text, importance, pinned, created_at, provenance,
       approval, superseded_by
FROM memories
WHERE approval = 'live'
  AND superseded_by IS NULL
  AND merged_into IS NULL
  AND (valid_to IS NULL OR valid_to > now())
ORDER BY created_at DESC
LIMIT $1
`;
