/**
 * P1.M7 job dispatcher — routes pg-boss job.data.kind to handlers.
 */
import { handleEmbed } from './embed.mjs';
import { handleScore } from './score.mjs';
import { handleDedup } from './dedup.mjs';

const HANDLERS = {
  embed: handleEmbed,
  'spike-embed': handleEmbed,
  score: handleScore,
  score_importance: handleScore,
  dedup: handleDedup,
  dedup_check: handleDedup,
};

export async function dispatchJob(db, jobData = {}) {
  const kind = jobData.kind || 'embed';
  const handler = HANDLERS[kind];
  if (!handler) {
    return { ok: false, error: `unknown_kind:${kind}`, skipped: true, kind };
  }
  return handler(db, jobData);
}

export function knownKinds() {
  return Object.keys(HANDLERS);
}
