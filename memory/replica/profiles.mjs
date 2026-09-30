/**
 * P2.R1 — per-device replica sync profiles (plan §6).
 *
 * Replica = read cache. Daemon/Neon = single writer. Devices never write
 * to the replica directly.
 *
 *   hot      — pinned + last-30d episodic + active project-* namespaces
 *   standard — hot + full semantic/procedural text (no vectors)
 *   full     — everything incl. vectors (P1.M8; not re-claimed here)
 */

export const PROFILE_NAMES = Object.freeze(['hot', 'standard', 'full']);

/** Days of episodic history included in the hot set. */
export const HOT_EPISODIC_DAYS = 30;

/**
 * @typedef {'hot'|'standard'|'full'} ReplicaProfile
 *
 * @typedef {object} MemoryRow
 * @property {string} id
 * @property {string} namespace
 * @property {string} type
 * @property {boolean|number} [pinned]
 * @property {string} [approval]
 * @property {string|Date|null} [created_at]
 * @property {string|Date|null} [valid_to]
 * @property {string} [text]
 * @property {unknown} [embedding]
 */

/**
 * @param {string} name
 * @returns {ReplicaProfile}
 */
export function assertProfile(name) {
  const p = String(name || '').toLowerCase();
  if (!PROFILE_NAMES.includes(p)) {
    throw new Error(`unknown replica profile: ${name} (want ${PROFILE_NAMES.join('|')})`);
  }
  return /** @type {ReplicaProfile} */ (p);
}

/**
 * Active project-* = live approval, currently valid, namespace matches project-*.
 * Optional allowlist further restricts (empty/null = all matching project-*).
 * @param {MemoryRow} row
 * @param {string[]|null|undefined} activeProjects
 */
export function isActiveProject(row, activeProjects) {
  const ns = String(row.namespace || '');
  if (!ns.startsWith('project-')) return false;
  if (row.approval && row.approval !== 'live') return false;
  if (row.valid_to != null && row.valid_to !== '') return false;
  if (activeProjects && activeProjects.length > 0) {
    return activeProjects.includes(ns);
  }
  return true;
}

/**
 * @param {MemoryRow} row
 * @param {{ now?: Date, activeProjects?: string[]|null, episodicDays?: number }} [opts]
 */
export function matchesHot(row, opts = {}) {
  const now = opts.now || new Date();
  const days = opts.episodicDays ?? HOT_EPISODIC_DAYS;
  if (row.pinned === true || row.pinned === 1) return true;
  if (row.type === 'episodic') {
    const t = row.created_at ? new Date(row.created_at).getTime() : 0;
    const cutoff = now.getTime() - days * 24 * 60 * 60 * 1000;
    if (t >= cutoff) return true;
  }
  if (isActiveProject(row, opts.activeProjects)) return true;
  return false;
}

/**
 * standard = hot ∪ {semantic, procedural} text rows (still valid/live preferred).
 * @param {MemoryRow} row
 * @param {{ now?: Date, activeProjects?: string[]|null, episodicDays?: number }} [opts]
 */
export function matchesStandard(row, opts = {}) {
  if (matchesHot(row, opts)) return true;
  if (row.type === 'semantic' || row.type === 'procedural') {
    if (row.approval && row.approval !== 'live') return false;
    if (row.valid_to != null && row.valid_to !== '') return false;
    return true;
  }
  return false;
}

/**
 * @param {ReplicaProfile} profile
 * @param {MemoryRow} row
 * @param {{ now?: Date, activeProjects?: string[]|null, episodicDays?: number }} [opts]
 */
export function matchesProfile(profile, row, opts = {}) {
  const p = assertProfile(profile);
  if (p === 'full') return true;
  if (p === 'hot') return matchesHot(row, opts);
  return matchesStandard(row, opts);
}

/**
 * Whether this profile stores embedding vectors locally.
 * hot/standard = text only; full = vectors (P1.M8 substrate).
 * @param {ReplicaProfile} profile
 */
export function storesVectors(profile) {
  return assertProfile(profile) === 'full';
}

/**
 * Human-readable profile summary (docs / evidence).
 * @param {ReplicaProfile} profile
 */
export function describeProfile(profile) {
  const p = assertProfile(profile);
  if (p === 'hot') {
    return {
      name: 'hot',
      includes: ['pinned', `episodic_last_${HOT_EPISODIC_DAYS}d`, 'active project-*'],
      vectors: false,
      for: 'phone / low-storage',
    };
  }
  if (p === 'standard') {
    return {
      name: 'standard',
      includes: ['hot', 'semantic', 'procedural'],
      vectors: false,
      for: 'laptop / fast text search',
    };
  }
  return {
    name: 'full',
    includes: ['everything', 'vectors'],
    vectors: true,
    for: 'daemon host (P1.M8)',
    note: 'P1.M8 — not re-claimed by P2.R1',
  };
}

/**
 * SQL WHERE fragment for filtering memories to a profile (Neon side).
 * Params: $1 = now (timestamptz), $2 = episodic days (int).
 * Active-project allowlist is applied in JS when provided.
 * @param {ReplicaProfile} profile
 */
export function profileSqlPredicate(profile) {
  const p = assertProfile(profile);
  if (p === 'full') return 'TRUE';
  const hot = `(
    pinned = TRUE
    OR (type = 'episodic' AND created_at >= ($1::timestamptz - ($2::int * INTERVAL '1 day')))
    OR (
      namespace LIKE 'project-%'
      AND approval = 'live'
      AND valid_to IS NULL
    )
  )`;
  if (p === 'hot') return hot;
  return `(${hot} OR (
    type IN ('semantic','procedural')
    AND approval = 'live'
    AND valid_to IS NULL
  ))`;
}
