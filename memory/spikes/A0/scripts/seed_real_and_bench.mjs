/**
 * A0.2 follow-up: seed Ashish's real-corpus.jsonl into legacy Neon p0-spike
 * and measure hybrid/keyword/vector recall@10 on real gold queries.
 * Does NOT wipe the synthetic 5k rows.
 */
import pg from 'pg';
import { pipeline } from '@xenova/transformers';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const CORPUS = resolve(__dir, '../real-corpus.jsonl');
const OUT_DIR = resolve(__dir, '../out');
const EMBEDDING_MODEL = 'minilm-l6-v2@1';
const MODEL = 'Xenova/all-MiniLM-L6-v2';
const BATCH = 16;
const RRF_K = 60;
const TOPK = 10;
const N_QUERIES = 50;

function halfvecLiteral(arr) {
  let s = '[';
  for (let i = 0; i < arr.length; i++) {
    if (i) s += ',';
    s += Number(arr[i]).toFixed(6);
  }
  return s + ']';
}

function uuidFromHash(hex) {
  const h = (hex + '0'.repeat(32)).slice(0, 32);
  const variant = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${variant}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

function queryFromText(text) {
  const words = text.replace(/[^\w\s.-]/g, ' ').split(/\s+/).filter((w) => w.length > 2);
  if (words.length <= 8) return text.slice(0, 120);
  // Prefer middle slice for less boilerplate prefixes like "Wrong:" / "Next:"
  const start = Math.min(3, Math.max(0, words.length - 10));
  return words.slice(start, start + 10).join(' ');
}

const rows = readFileSync(CORPUS, 'utf8')
  .split('\n')
  .filter(Boolean)
  .map((l) => JSON.parse(l));
console.log('corpus', rows.length);

const embedder = await pipeline('feature-extraction', MODEL);
async function embedBatch(texts) {
  const out = [];
  for (let i = 0; i < texts.length; i += BATCH) {
    const slice = texts.slice(i, i + BATCH);
    for (const t of slice) {
      const tensor = await embedder(t, { pooling: 'mean', normalize: true });
      out.push(Array.from(tensor.data));
    }
    console.log(`embed ${Math.min(i + BATCH, texts.length)}/${texts.length}`);
  }
  return out;
}

console.log('embedding…');
const embeddings = await embedBatch(rows.map((r) => r.text));

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();

// Delete prior real import if re-run (author prefix real-corpus)
await client.query(`DELETE FROM memories WHERE author = 'import:real-corpus'`);

const idMap = new Map(); // content_hash -> uuid
let inserted = 0;
for (let i = 0; i < rows.length; i++) {
  const r = rows[i];
  const id = uuidFromHash(r.content_hash);
  idMap.set(r.content_hash, id);
  const emb = halfvecLiteral(embeddings[i]);
  await client.query(
    `INSERT INTO memories (
      id, type, scope, namespace, bot_id, text, embedding, embedding_model,
      importance, strength, status, pinned, source_session, trajectory_ref,
      author, origin, valid_from, version
    ) VALUES (
      $1::uuid, $2, 'global', $3, $4, $5, $6::halfvec, $7,
      $8, 5.0, 'indexed', false, $9, null,
      'import:real-corpus', 'external', now(), 1
    )`,
    [
      id,
      r.type,
      r.namespace,
      r.provenance?.bot || null,
      r.text,
      emb,
      EMBEDDING_MODEL,
      r.importance ?? 5,
      r.provenance?.yaml_id || r.id,
    ],
  );
  inserted++;
}
console.log('inserted', inserted);

// Build queries: first N_QUERIES rows (stable order)
const qRows = rows.slice(0, N_QUERIES);
const queries = [];
for (let i = 0; i < qRows.length; i++) {
  const r = qRows[i];
  queries.push({
    id: `rq-${i + 1}`,
    query: queryFromText(r.text),
    gold_id: idMap.get(r.content_hash),
    gold_hash: r.content_hash,
    namespace: r.namespace,
    type: r.type,
  });
}

async function embedOne(text) {
  const tensor = await embedder(text, { pooling: 'mean', normalize: true });
  return halfvecLiteral(Array.from(tensor.data));
}

async function recallHybrid(q, embLit) {
  const sql = `
WITH q AS (
  SELECT plainto_tsquery('english', $1) AS tsq, $2::halfvec AS emb
),
kw AS (
  SELECT m.id, row_number() OVER (ORDER BY ts_rank_cd(m.text_tsv, q.tsq) DESC) AS rnk
  FROM memories m, q
  WHERE m.status = 'indexed' AND m.text_tsv @@ q.tsq
  LIMIT 50
),
vec AS (
  SELECT m.id, row_number() OVER (ORDER BY m.embedding <=> q.emb) AS rnk
  FROM memories m, q
  WHERE m.status = 'indexed' AND m.embedding IS NOT NULL
  ORDER BY m.embedding <=> q.emb
  LIMIT 50
),
fused AS (
  SELECT id, coalesce(1.0/(${RRF_K}+kw.rnk),0) + coalesce(1.0/(${RRF_K}+vec.rnk),0) AS score
  FROM (SELECT id, rnk FROM kw) kw
  FULL OUTER JOIN (SELECT id, rnk FROM vec) vec USING (id)
)
SELECT id::text FROM fused ORDER BY score DESC LIMIT ${TOPK}`;
  const t0 = performance.now();
  const res = await client.query(sql, [q, embLit]);
  return { ids: res.rows.map((r) => r.id), ms: performance.now() - t0 };
}

async function recallKw(q) {
  const sql = `
SELECT id::text FROM memories
WHERE status='indexed' AND text_tsv @@ plainto_tsquery('english', $1)
ORDER BY ts_rank_cd(text_tsv, plainto_tsquery('english', $1)) DESC
LIMIT ${TOPK}`;
  const t0 = performance.now();
  const res = await client.query(sql, [q]);
  return { ids: res.rows.map((r) => r.id), ms: performance.now() - t0 };
}

async function recallVec(embLit) {
  const sql = `
SELECT id::text FROM memories
WHERE status='indexed' AND embedding IS NOT NULL
ORDER BY embedding <=> $1::halfvec
LIMIT ${TOPK}`;
  const t0 = performance.now();
  const res = await client.query(sql, [embLit]);
  return { ids: res.rows.map((r) => r.id), ms: performance.now() - t0 };
}

function hit(ids, gold) {
  return ids.includes(gold) ? 1 : 0;
}

const hybridHits = [];
const kwHits = [];
const vecHits = [];
const hybridMs = [];
const kwMs = [];
const vecMs = [];
const details = [];

for (const qq of queries) {
  const embLit = await embedOne(qq.query);
  const h = await recallHybrid(qq.query, embLit);
  const k = await recallKw(qq.query);
  const v = await recallVec(embLit);
  hybridHits.push(hit(h.ids, qq.gold_id));
  kwHits.push(hit(k.ids, qq.gold_id));
  vecHits.push(hit(v.ids, qq.gold_id));
  hybridMs.push(h.ms);
  kwMs.push(k.ms);
  vecMs.push(v.ms);
  details.push({
    id: qq.id,
    query: qq.query,
    gold: qq.gold_id,
    hybrid: !!hit(h.ids, qq.gold_id),
    kw: !!hit(k.ids, qq.gold_id),
    vec: !!hit(v.ids, qq.gold_id),
    hybrid_ms: +h.ms.toFixed(2),
  });
  console.log(qq.id, 'H', hybridHits.at(-1), 'K', kwHits.at(-1), 'V', vecHits.at(-1), `${h.ms.toFixed(1)}ms`);
}

function mean(a) {
  return a.reduce((x, y) => x + y, 0) / a.length;
}
function pct(a, p) {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
}

const summary = {
  corpus_rows_imported: inserted,
  total_db_rows: (await client.query('select count(*)::int n from memories')).rows[0].n,
  n_queries: queries.length,
  recall_at_10: {
    hybrid: +mean(hybridHits).toFixed(4),
    keyword: +mean(kwHits).toFixed(4),
    vector: +mean(vecHits).toFixed(4),
  },
  latency_ms: {
    hybrid_p50: +pct(hybridMs, 50).toFixed(2),
    hybrid_p95: +pct(hybridMs, 95).toFixed(2),
    keyword_p50: +pct(kwMs, 50).toFixed(2),
    keyword_p95: +pct(kwMs, 95).toFixed(2),
    vector_p50: +pct(vecMs, 50).toFixed(2),
    vector_p95: +pct(vecMs, 95).toFixed(2),
  },
  notes:
    'Real corpus seeded into legacy Neon p0-spike alongside synthetic 5k. Queries are distinctive windows from gold row text (not hand paraphrases).',
};

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(resolve(OUT_DIR, 'a0-real-bench.json'), JSON.stringify({ summary, details }, null, 2));
console.log(JSON.stringify(summary, null, 2));
await client.end();
