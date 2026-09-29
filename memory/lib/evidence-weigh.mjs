/**
 * P1.X7 — evidence-weighing resolution (FINAL-PLAN-V2 §10).
 *
 * Contradiction is not a "disputed" label — weigh evidence for old vs new
 * (recency, source reliability, corroboration via grounding_ids, pinned,
 * importance/strength) and pick a winner. Identity / bot_id never tips the
 * scale (Q6 no-gatekeeping).
 */

/** @typedef {{ id: string, text?: string, created_at?: string|Date, grounding_ids?: string[], pinned?: boolean, importance?: number, strength?: number, provenance?: object, version?: number, bot_id?: string }} EvidenceCandidate */

const SOURCE_RELIABILITY = {
  'svc:curator': 0.95,
  curator: 0.95,
  ashish: 1.0,
  human: 1.0,
  'import-bot-memory': 0.7,
  mcp: 0.75,
  cli: 0.7,
  spike: 0.6,
  default: 0.65,
};

function asDate(v) {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function sourceKey(c) {
  const p = c.provenance || {};
  return (
    p.author ||
    p.origin ||
    c.bot_id ||
    p.bot_id ||
    'default'
  );
}

function reliabilityOf(c) {
  const key = String(sourceKey(c)).toLowerCase();
  if (SOURCE_RELIABILITY[key] != null) return SOURCE_RELIABILITY[key];
  // bot-* identities are equal — no privilege
  if (key.startsWith('bot-') || key.startsWith('svc:')) return 0.7;
  return SOURCE_RELIABILITY.default;
}

/**
 * Score one candidate. Higher = stronger evidence for keeping as current truth.
 * @param {EvidenceCandidate} c
 * @param {{ now?: Date }} [opts]
 */
export function scoreEvidence(c, opts = {}) {
  const now = opts.now || new Date();
  const created = asDate(c.created_at) || asDate(c.provenance?.created_at) || now;
  const ageMs = Math.max(0, now.getTime() - created.getTime());
  // Recency: full credit at t=0, decays toward 0 over ~30 days
  const recency = Math.exp(-ageMs / (30 * 24 * 60 * 60 * 1000));
  const grounding = Array.isArray(c.grounding_ids) ? c.grounding_ids.length : 0;
  const corroboration = Math.min(1, grounding / 3); // 3+ citations → full
  const reliability = reliabilityOf(c);
  const importance = Math.max(1, Math.min(10, Number(c.importance) || 5)) / 10;
  const strength = Math.max(0, Math.min(10, Number(c.strength) || 5)) / 10;
  const pinnedBonus = c.pinned ? 0.25 : 0;

  // Weights chosen so identity never appears; bot_id excluded from formula.
  const total =
    0.3 * recency +
    0.25 * reliability +
    0.25 * corroboration +
    0.1 * importance +
    0.1 * strength +
    pinnedBonus;

  return {
    total: Number(total.toFixed(6)),
    parts: {
      recency: Number(recency.toFixed(6)),
      reliability: Number(reliability.toFixed(6)),
      corroboration: Number(corroboration.toFixed(6)),
      importance: Number(importance.toFixed(6)),
      strength: Number(strength.toFixed(6)),
      pinned_bonus: pinnedBonus,
    },
    source_key: sourceKey(c),
    grounding_count: grounding,
    // Explicit: bot identity was NOT a scoring input
    identity_used: false,
  };
}

/**
 * Weigh two (or more) candidates; return winner/loser with full provenance.
 * Tie → prefer higher grounding, then newer created_at — still not identity.
 * @param {EvidenceCandidate[]} candidates
 * @param {{ now?: Date, reason?: string }} [opts]
 */
export function weighEvidence(candidates, opts = {}) {
  if (!Array.isArray(candidates) || candidates.length < 2) {
    throw new Error('weighEvidence requires >= 2 candidates');
  }
  const scored = candidates.map((c) => ({
    candidate: c,
    score: scoreEvidence(c, opts),
  }));
  scored.sort((a, b) => {
    if (b.score.total !== a.score.total) return b.score.total - a.score.total;
    const gA = a.score.grounding_count;
    const gB = b.score.grounding_count;
    if (gB !== gA) return gB - gA;
    const tA = asDate(a.candidate.created_at)?.getTime() || 0;
    const tB = asDate(b.candidate.created_at)?.getTime() || 0;
    return tB - tA;
  });
  const winner = scored[0];
  const losers = scored.slice(1);
  const margin = Number((winner.score.total - losers[0].score.total).toFixed(6));
  const confidence = margin >= 0.15 ? 'high' : margin >= 0.05 ? 'medium' : 'low';

  return {
    winner_id: winner.candidate.id,
    loser_ids: losers.map((l) => l.candidate.id),
    margin,
    confidence,
    reason: opts.reason || 'evidence_weigh',
    scores: scored.map((s) => ({
      id: s.candidate.id,
      bot_id: s.candidate.bot_id || s.candidate.provenance?.bot_id || null,
      total: s.score.total,
      parts: s.score.parts,
      source_key: s.score.source_key,
      identity_used: false,
    })),
    identity_gatekeeping: false,
    at: (opts.now || new Date()).toISOString(),
  };
}

/**
 * Decide whether two texts look like a material conflict (vs reinforce).
 * Simple heuristic for the spike — not an LLM judge.
 */
export function looksLikeConflict(aText, bText) {
  const a = String(aText || '').toLowerCase();
  const b = String(bText || '').toLowerCase();
  if (!a || !b) return false;
  if (a === b) return false;
  const neg = /\b(not|never|no longer|deprecated|wrong|false|instead)\b/;
  const aNeg = neg.test(a);
  const bNeg = neg.test(b);
  if (aNeg !== bNeg) return true;
  // Shared tokens but different claim verbs / numbers
  const tokens = (s) => new Set(s.split(/[^a-z0-9]+/).filter((t) => t.length > 2));
  const ta = tokens(a);
  const tb = tokens(b);
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter += 1;
  const union = ta.size + tb.size - inter || 1;
  const jaccard = inter / union;
  return jaccard >= 0.25 && jaccard < 0.92;
}
