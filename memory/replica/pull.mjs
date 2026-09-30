/**
 * P2.R1 — pull deltas from sync_log into a local SQLite replica by profile.
 *
 * Mechanism (plan §6): devices pull WHERE seq > last_token.
 * Profile filter decides which memories land in the hot/standard cache.
 */

import {
  assertProfile,
  matchesProfile,
  storesVectors,
  describeProfile,
} from './profiles.mjs';
import {
  getLastToken,
  setLastToken,
  setMeta,
  upsertMemory,
  retireMemory,
  snapshotStats,
} from './sqlite-store.mjs';

/**
 * Apply one sync_log delta to the local replica if it matches the profile.
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {import('./source.mjs').SyncDelta} delta
 * @param {import('./profiles.mjs').ReplicaProfile} profile
 * @param {{ now?: Date, activeProjects?: string[]|null }} [opts]
 * @returns {'applied'|'skipped'|'retired'|'missing'}
 */
export function applyDelta(db, delta, profile, opts = {}) {
  const op = delta.op;
  if (op === 'retire') {
    retireMemory(db, delta.memory_id, delta.seq);
    return 'retired';
  }
  const row = delta.memory;
  if (!row) return 'missing';
  if (!matchesProfile(profile, row, opts)) return 'skipped';
  // hot/standard never store vectors even if source has them
  const local = storesVectors(profile) ? row : { ...row, embedding: undefined };
  upsertMemory(db, local, op, delta.seq);
  return 'applied';
}

/**
 * Pull + apply deltas from a source into db.
 *
 * @param {object} args
 * @param {import('node:sqlite').DatabaseSync} args.db
 * @param {{ fetchDeltas: Function, getSourceMaxSeq: Function, kind?: string }} args.source
 * @param {import('./profiles.mjs').ReplicaProfile} args.profile
 * @param {number} [args.lastToken]  override; default = replica_meta.last_token
 * @param {string[]|null} [args.activeProjects]
 * @param {Date} [args.now]
 * @param {number} [args.limit]
 * @param {boolean} [args.dryRun]  compute what would apply without writing
 */
export async function pullSync(args) {
  const profile = assertProfile(args.profile);
  const lastToken =
    args.lastToken != null ? Number(args.lastToken) : getLastToken(args.db);
  const opts = {
    now: args.now || new Date(),
    activeProjects: args.activeProjects ?? null,
  };

  const deltas = await args.source.fetchDeltas(lastToken, { limit: args.limit ?? 5000 });
  const sourceMax = await args.source.getSourceMaxSeq();

  let applied = 0;
  let skipped = 0;
  let retired = 0;
  let missing = 0;
  let maxSeen = lastToken;

  /** @type {object[]} */
  const dryApplied = [];

  for (const delta of deltas) {
    maxSeen = Math.max(maxSeen, Number(delta.seq));
    if (args.dryRun) {
      if (delta.op === 'retire') {
        retired += 1;
        continue;
      }
      if (!delta.memory) {
        missing += 1;
        continue;
      }
      if (matchesProfile(profile, delta.memory, opts)) {
        applied += 1;
        dryApplied.push({
          seq: delta.seq,
          id: delta.memory.id,
          namespace: delta.memory.namespace,
          type: delta.memory.type,
          pinned: Boolean(delta.memory.pinned),
        });
      } else {
        skipped += 1;
      }
      continue;
    }

    const result = applyDelta(args.db, delta, profile, opts);
    if (result === 'applied') applied += 1;
    else if (result === 'skipped') skipped += 1;
    else if (result === 'retired') retired += 1;
    else missing += 1;
  }

  if (!args.dryRun) {
    setLastToken(args.db, maxSeen);
    setMeta(args.db, 'profile', profile);
    setMeta(args.db, 'source_kind', args.source.kind || 'unknown');
    setMeta(args.db, 'pulled_at', new Date().toISOString());
    setMeta(args.db, 'source_max_seq', sourceMax);
  }

  const replicaLag = Math.max(0, Number(sourceMax) - Number(maxSeen));
  const stats = args.dryRun ? null : snapshotStats(args.db);

  return {
    ok: true,
    profile,
    profile_info: describeProfile(profile),
    last_token_before: lastToken,
    last_token_after: maxSeen,
    source_max_seq: Number(sourceMax),
    replica_lag: replicaLag,
    deltas_seen: deltas.length,
    applied,
    skipped,
    retired,
    missing,
    dry_run: Boolean(args.dryRun),
    stores_vectors: storesVectors(profile),
    source_kind: args.source.kind || 'unknown',
    stats,
    dry_applied_sample: args.dryRun ? dryApplied.slice(0, 20) : undefined,
  };
}
