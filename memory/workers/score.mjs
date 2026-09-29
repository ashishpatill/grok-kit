/**
 * P1.M7 score_importance worker — 1..10 importance.
 * Prefers OpenRouter cheap tier when OPENROUTER_API_KEY is set;
 * otherwise a deterministic heuristic (type + length + pinned).
 * Idempotent: overwrites importance; logs model in provenance.
 */
const TYPE_BASE = {
  procedural: 7,
  goals: 8,
  semantic: 6,
  episodic: 5,
  reflective: 5,
  working: 4,
};

function heuristicScore(row) {
  let s = TYPE_BASE[row.type] ?? 5;
  const len = String(row.text || '').length;
  if (len > 280) s += 1;
  if (len < 40) s -= 1;
  if (row.pinned) s = Math.max(s, 9);
  return Math.max(1, Math.min(10, Math.round(s)));
}

async function openRouterScore(row) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return null;
  const model = process.env.OPENROUTER_SCORE_MODEL || 'openai/gpt-4o-mini';
  const prompt = `Rate importance 1-10 for this memory. Reply with ONLY an integer.\nType: ${row.type}\nText: ${String(row.text).slice(0, 500)}`;
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 8,
      temperature: 0,
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`openrouter_http_${res.status}: ${t.slice(0, 200)}`);
  }
  const j = await res.json();
  const raw = j?.choices?.[0]?.message?.content || '';
  const n = parseInt(String(raw).match(/\d+/)?.[0] || '', 10);
  if (!Number.isFinite(n) || n < 1 || n > 10) {
    throw new Error(`openrouter_bad_score: ${raw}`);
  }
  return { score: n, model };
}

/**
 * @param {{ query: Function }} db
 * @param {{ memory_id: string }} job
 */
export async function handleScore(db, job) {
  const memoryId = job?.memory_id;
  if (!memoryId) {
    return { ok: false, error: 'memory_id required', skipped: true };
  }
  const sel = await db.query(
    `SELECT id, text, type, pinned, importance FROM memories WHERE id = $1`,
    [memoryId]
  );
  const row = sel.rows[0];
  if (!row) {
    return { ok: false, error: 'memory_not_found', memory_id: memoryId, skipped: true };
  }

  let score;
  let model = 'heuristic@1';
  let route = 'heuristic';
  try {
    const or = await openRouterScore(row);
    if (or) {
      score = or.score;
      model = or.model;
      route = 'openrouter';
    } else {
      score = heuristicScore(row);
    }
  } catch (e) {
    score = heuristicScore(row);
    route = `heuristic_fallback:${e.message}`;
  }

  await db.query(
    `UPDATE memories
     SET importance = $2,
         provenance = COALESCE(provenance, '{}'::jsonb) || jsonb_build_object('importance_model', $3::text)
     WHERE id = $1`,
    [memoryId, score, model]
  );

  return {
    ok: true,
    kind: 'score',
    memory_id: memoryId,
    importance: score,
    previous: row.importance,
    model,
    route,
  };
}
