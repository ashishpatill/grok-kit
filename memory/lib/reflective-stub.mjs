/**
 * P3.R1 light reflective stub — re-exports from reflective.mjs (P3.R2 deepen).
 * Prefer importing from `./reflective.mjs` for extraction + usage voting.
 */
export {
  extractReflectiveStub,
  extractInsightLines,
  extractInsightsFromEpisodics,
  applyUsageVote,
  rankByUsageVotes,
  buildReflectiveProposePayload,
  runReflectivePipeline,
  USAGE_VOTE_THRESHOLD,
} from './reflective.mjs';
