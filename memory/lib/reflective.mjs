/**
 * P3.R2 — ExpeL / reflective deepen (beyond P3.R1 light stub).
 *
 * Extraction + usage-voting sketch. Reflective candidates are always written
 * through propose() (human-gated) — never silent pin/identity promote.
 *
 * Heuristic extract (no LLM required for smoke). Optional OpenRouter cheap-tier
 * swap can replace `extractInsightsFromEpisodic` later without changing the
 * propose / vote contract.
 */

import { routePropose, isHumanGated } from './propose-route.mjs';

/** Default vote threshold before a candidate is ranked "ready to propose". */
export const USAGE_VOTE_THRESHOLD = 2;

/**
 * P3.R1-compatible stub extract (kept for poison smoke / callers).
 * @param {{ episodic_text: string, namespace?: string, grounding_ids?: string[] }} input
 */
export function extractReflectiveStub(input) {
  const text = String(input?.episodic_text || '').trim();
  const namespace = input?.namespace || 'preferences';
  const grounding_ids = Array.isArray(input?.grounding_ids) ? input.grounding_ids : [];
  return {
    type: 'reflective',
    namespace,
    text: text ? `REFLECT: ${text.slice(0, 400)}` : 'REFLECT: (empty episodic)',
    grounding_ids,
    must_human_gate: true,
    note: 'Light stub only — queue via propose(); never silent pin/identity promote.',
  };
}

/**
 * Heuristic ExpeL-style insight lines from one episodic observation.
 * Looks for Wrong/Worked/Next/Lesson/Insight/failed/succeeded cues.
 * @param {string} episodicText
 * @returns {string[]}
 */
export function extractInsightLines(episodicText) {
  const text = String(episodicText || '').trim();
  if (!text) return [];

  const lines = [];
  const labeled =
    text.match(
      /(?:^|[.!?]\s+|;\s*)((?:Wrong|Worked|Next|Lesson|Insight|Failed|Succeeded|Reflect)\s*[:—-]\s*[^.;\n]+)/gi
    ) || [];
  for (const m of labeled) {
    const cleaned = m.replace(/^[\s.;!?]+/, '').trim();
    if (cleaned.length >= 8) lines.push(cleaned.slice(0, 400));
  }

  if (lines.length === 0) {
    lines.push(`REFLECT: ${text.slice(0, 400)}`);
  }

  const seen = new Set();
  const out = [];
  for (const l of lines) {
    const k = l.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(l);
  }
  return out;
}

/**
 * @typedef {{
 *   id: string,
 *   type: 'reflective',
 *   namespace: string,
 *   text: string,
 *   grounding_ids: string[],
 *   source_episodic_ids: string[],
 *   votes: number,
 *   must_human_gate: true,
 *   ready_to_propose: boolean,
 *   note: string,
 * }} ReflectiveCandidate
 */

/**
 * Extract reflective candidates from episodic rows (ExpeL sketch).
 * @param {Array<{ id?: string, text?: string, namespace?: string, grounding_ids?: string[] }>} episodics
 * @param {{ namespace?: string, vote_threshold?: number }} [opts]
 * @returns {ReflectiveCandidate[]}
 */
export function extractInsightsFromEpisodics(episodics, opts = {}) {
  const voteThreshold = opts.vote_threshold ?? USAGE_VOTE_THRESHOLD;
  const list = Array.isArray(episodics) ? episodics : [];
  /** @type {Map<string, ReflectiveCandidate>} */
  const byKey = new Map();

  for (const ep of list) {
    const ns = opts.namespace || ep.namespace || 'project-reflective';
    const epId = ep.id || null;
    const grounding = Array.isArray(ep.grounding_ids)
      ? ep.grounding_ids.filter(Boolean)
      : epId
        ? [epId]
        : [];
    const insights = extractInsightLines(ep.text || '');
    for (let i = 0; i < insights.length; i++) {
      const text = insights[i];
      const key = `${ns}::${text.toLowerCase()}`;
      const prev = byKey.get(key);
      if (prev) {
        if (epId && !prev.source_episodic_ids.includes(epId)) {
          prev.source_episodic_ids.push(epId);
        }
        for (const g of grounding) {
          if (!prev.grounding_ids.includes(g)) prev.grounding_ids.push(g);
        }
        prev.votes += 1;
        prev.ready_to_propose = prev.votes >= voteThreshold;
        continue;
      }
      const id = `refl_${hashShort(key)}`;
      byKey.set(key, {
        id,
        type: 'reflective',
        namespace: ns,
        text,
        grounding_ids: [...grounding],
        source_episodic_ids: epId ? [epId] : [],
        votes: 0,
        must_human_gate: true,
        ready_to_propose: 0 >= voteThreshold,
        note:
          'ExpeL extract → propose() human-gated; usage votes rank readiness; never silent promote.',
      });
    }
  }

  return [...byKey.values()].sort((a, b) => b.votes - a.votes || a.text.localeCompare(b.text));
}

/**
 * Usage-voting sketch: apply +1 / -1 (or custom delta) to a candidate.
 * @param {ReflectiveCandidate} candidate
 * @param {{ delta?: number, outcome?: 'used_ok'|'used_fail'|'recalled'|'contradicted', vote_threshold?: number }} [vote]
 * @returns {ReflectiveCandidate}
 */
export function applyUsageVote(candidate, vote = {}) {
  const threshold = vote.vote_threshold ?? USAGE_VOTE_THRESHOLD;
  let delta = vote.delta;
  if (delta == null) {
    switch (vote.outcome) {
      case 'used_ok':
      case 'recalled':
        delta = 1;
        break;
      case 'used_fail':
      case 'contradicted':
        delta = -1;
        break;
      default:
        delta = 1;
    }
  }
  const votes = Math.max(0, Number(candidate.votes || 0) + Number(delta));
  return {
    ...candidate,
    votes,
    ready_to_propose: votes >= threshold,
    must_human_gate: true,
  };
}

/**
 * Rank candidates by votes (desc); optionally filter to ready_to_propose.
 * @param {ReflectiveCandidate[]} candidates
 * @param {{ ready_only?: boolean }} [opts]
 */
export function rankByUsageVotes(candidates, opts = {}) {
  const list = Array.isArray(candidates) ? [...candidates] : [];
  const filtered = opts.ready_only ? list.filter((c) => c.ready_to_propose) : list;
  return filtered.sort((a, b) => b.votes - a.votes || a.text.localeCompare(b.text));
}

/**
 * Build a propose()-ready payload. Always type=reflective → human-gated via route.
 * @param {ReflectiveCandidate} candidate
 * @param {{ author?: string, source_session?: string }} [meta]
 */
export function buildReflectiveProposePayload(candidate, meta = {}) {
  const namespace = candidate.namespace || 'project-reflective';
  const grounding_ids = Array.isArray(candidate.grounding_ids) ? candidate.grounding_ids : [];
  const route = routePropose({
    type: 'reflective',
    scope: 'global',
    pinned: false,
    grounding_ids,
    namespace,
  });
  return {
    namespace,
    text: candidate.text,
    metadata: {
      type: 'reflective',
      scope: 'global',
      pinned: false,
      grounding_ids,
      author: meta.author || 'expel-reflective',
      source_session: meta.source_session || `expel-${Date.now()}`,
      origin: 'expel-reflective',
      importance: Math.min(10, 5 + Math.floor(Number(candidate.votes || 0) / 2)),
      reflective_id: candidate.id,
      source_episodic_ids: candidate.source_episodic_ids || [],
      usage_votes: candidate.votes || 0,
      ready_to_propose: Boolean(candidate.ready_to_propose),
    },
    route,
    must_human_gate: true,
    human_gated: isHumanGated(route),
  };
}

/**
 * End-to-end sketch: extract → vote → rank → propose payloads (no I/O).
 * @param {Array<{ id?: string, text?: string, namespace?: string }>} episodics
 * @param {{ namespace?: string, votes?: Array<{ id: string, outcome?: string, delta?: number }>, ready_only?: boolean, vote_threshold?: number }} [opts]
 */
export function runReflectivePipeline(episodics, opts = {}) {
  let candidates = extractInsightsFromEpisodics(episodics, {
    namespace: opts.namespace,
    vote_threshold: opts.vote_threshold,
  });
  const votes = Array.isArray(opts.votes) ? opts.votes : [];
  for (const v of votes) {
    candidates = candidates.map((c) =>
      c.id === v.id ? applyUsageVote(c, { ...v, vote_threshold: opts.vote_threshold }) : c
    );
  }
  const ranked = rankByUsageVotes(candidates, { ready_only: opts.ready_only });
  const proposals = ranked.map((c) => buildReflectiveProposePayload(c));
  return { candidates: ranked, proposals };
}

function hashShort(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
