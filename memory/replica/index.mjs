/**
 * P2.R1 public surface — replica profiles + sync_log pull.
 */

export {
  PROFILE_NAMES,
  HOT_EPISODIC_DAYS,
  assertProfile,
  matchesHot,
  matchesStandard,
  matchesProfile,
  storesVectors,
  describeProfile,
  profileSqlPredicate,
  isActiveProject,
} from './profiles.mjs';

export {
  openReplicaDb,
  closeReplicaDb,
  getLastToken,
  setLastToken,
  setMeta,
  getMeta,
  upsertMemory,
  retireMemory,
  ftsSearch,
  countMemories,
  snapshotStats,
} from './sqlite-store.mjs';

export { createStubSource, createPgSource } from './source.mjs';
export { applyDelta, pullSync } from './pull.mjs';
