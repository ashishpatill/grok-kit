/**
 * Rebuild corpus with unique per-row facts so recall is meaningful,
 * re-embed, replace DB rows (keep smoke), bench with client-side latency.
 */
import pg from 'pg';
import { pipeline } from '@xenova/transformers';
import { writeFileSync, mkdirSync } from 'fs';
import { randomUUID } from 'crypto';

const N = 5000;
const EMBEDDING_MODEL = 'minilm-l6-v2@1';
const BATCH = 32;
const PROJECTS = ['bimlabz-web','grok-kit','moose','superlearn','bot-memory','render-dash','neon-ops','clerk-auth','tailscale-mesh','figma-bridge'];
const FEATURES = ['auth','billing','deploy','memory','mcp','sync','search','handoff','review','backup'];
const BOTS = ['grok','moose','curator','embed-worker','consolidator'];
const DECISIONS = ['storage','daemon','mcp','autonomy','triage','embeddings','namespaces','backup'];
const ERRORS = ['hnsw-ops','halfvec-cast','wake-lost','pool-timeout','dedup-false-pos','embed-null','rrf-tie','tsv-empty'];
const ORG = ['prefs','roster','nonnegotiables','roles','budget'];
const TECH = ['pgvector','halfvec','HNSW','tsvector','RRF','MiniLM','Neon','Tailscale','MCP','daemon','provenance','supersede','consolidation','webhook','pg-boss','OpenRouter','Clerk','ICM','GIN','ef_search'];
const ACTIONS = ['adopted','rejected','verified','mitigated','scheduled','documented','measured','rolled back','promoted','archived'];

function pick(a){return a[Math.floor(Math.random()*a.length)];}
function halfvecLiteral(arr){let s='[';for(let i=0;i<arr.length;i++){if(i)s+=',';s+=Number(arr[i]).toFixed(6);}return s+']';}

function makeRow(i) {
  const families = [
    () => {
      const p = PROJECTS[i % PROJECTS.length];
      const tech = TECH[i % TECH.length];
      const act = ACTIONS[i % ACTIONS.length];
      const ticket = `BLZ-${1000 + i}`;
      return {
        namespace: `project-${p}`, type: pick(['semantic','episodic','goals']), scope: 'global', bot_id: null,
        text: `Project ${p} ${act} ${tech} under ticket ${ticket}: concrete fact #${i} — retention window ${7+(i%14)} days, owner channel #${p}-mem.`,
        uniq: ticket,
      };
    },
    () => {
      const f = FEATURES[i % FEATURES.length];
      const tech = TECH[(i*3) % TECH.length];
      const criterion = `crit-${i}-${f}`;
      return {
        namespace: `feature-${f}`, type: pick(['semantic','procedural','episodic']), scope: 'global', bot_id: null,
        text: `Feature ${f} acceptance ${criterion}: ${tech} path must keep recall@10 above ${(0.65+(i%20)/100).toFixed(2)} with p95 under ${400+(i%100)}ms; steward note S-${i}.`,
        uniq: criterion,
      };
    },
    () => {
      const b = BOTS[i % BOTS.length];
      const job = `job-${b}-${i}`;
      return {
        namespace: `bot-${b}`, type: pick(['working','episodic','procedural']), scope: 'node_local', bot_id: b,
        text: `Bot ${b} scratch ${job}: drained ${10+(i%90)} pg-boss tasks after wake; next consolidate window at hour ${(i%24)} UTC; note ${TECH[i%TECH.length]} health OK.`,
        uniq: job,
      };
    },
    () => {
      const d = DECISIONS[i % DECISIONS.length];
      const dec = `DEC-${d.toUpperCase()}-${i}`;
      return {
        namespace: `decisions-${d}`, type: 'episodic', scope: 'global', bot_id: null,
        text: `Decision ${dec} on 2026-09-${String(10+(i%18)).padStart(2,'0')}: chose ${TECH[i%TECH.length]} over alternative ${TECH[(i+5)%TECH.length]} because free-tier math for ${384+(i%2)*384}-dim halfvec.`,
        uniq: dec,
      };
    },
    () => {
      const e = ERRORS[i % ERRORS.length];
      const err = `ERR-${e}-${i}`;
      return {
        namespace: `errors-resolved-${e}`, type: 'episodic', scope: 'global', bot_id: null,
        text: `Error resolved ${err}: root cause mismatched ops class on ${TECH[i%TECH.length]}; fix committed as patch P${i}; verified via EXPLAIN on query Q${i}.`,
        uniq: err,
      };
    },
    () => {
      const pref = `PREF-${i}`;
      return {
        namespace: 'preferences', type: 'semantic', scope: 'global', bot_id: null,
        text: `Preference ${pref}: Ashish wants digests batched ${1+(i%7)}×/week in Asia/Calcutta; interrupt only for money/breaking; embedding stays local MiniLM tag ${pref}.`,
        uniq: pref,
      };
    },
    () => {
      const o = ORG[i % ORG.length];
      const oid = `ORG-${o}-${i}`;
      return {
        namespace: `org.${o}`, type: pick(['semantic','goals']), scope: 'global', bot_id: null,
        text: `Org.${o} rule ${oid}: originals immutable; supersede chain required; budget cap Neon ${(0.4+(i%10)/100).toFixed(2)} GB; roster symmetric access clause ${i}.`,
        uniq: oid,
      };
    },
  ];
  const base = families[i % families.length]();
  const id = randomUUID();
  const author = base.bot_id ? `bot:${base.bot_id}` : (base.namespace === 'preferences' || base.namespace.startsWith('org.') ? 'human:ashish' : 'bot:grok');
  return {
    id, ...base, author, origin: 'internal',
    importance: 1 + (i % 10), strength: 0.5 + (i % 50) / 100,
    pinned: base.namespace === 'preferences' && i % 11 === 0,
    source_session: `a0-spike-v2-${Math.floor(i/100)}`,
    idx: i,
  };
}

function pct(arr, p) {
  const s = [...arr].sort((a,b)=>a-b);
  return s[Math.min(s.length-1, Math.ceil((p/100)*s.length)-1)];
}

async function main() {
  console.log('Building unique corpus...');
  const rows = Array.from({length: N}, (_, i) => makeRow(i));

  console.log('Loading MiniLM...');
  const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { quantized: true });
  const tEmb = Date.now();
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const out = await extractor(chunk.map(r => r.text), { pooling: 'mean', normalize: true });
    const data = out.data;
    for (let j = 0; j < chunk.length; j++) {
      chunk[j].halfvec = halfvecLiteral(Array.from(data.slice(j*384, (j+1)*384)));
    }
    if (i % 640 === 0) console.log(`  emb ${Math.min(i+BATCH,N)}/${N}`);
  }
  console.log(`Embed ${(Date.now()-tEmb)/1000}s`);

  // 50 queries: mix of (a) uniq-token, (b) paraphrase without uniq, (c) semantic intent
  const targets = [];
  const used = new Set();
  const idxs = [3,11,29,47,61,83,101,127,151,199,233,271,307,353,401,449,503,557,601,653,701,757,809,853,907,953,1003,1107,1201,1303,1409,1501,1607,1703,1801,1907,2003,2201,2407,2603,2801,3007,3203,3401,3607,3803,4001,4207,4403,4601,4807,4901];
  for (const idx of idxs) {
    if (idx < N && !used.has(idx)) { targets.push(idx); used.add(idx); }
  }
  while (targets.length < 50) {
    const idx = Math.floor(Math.random()*N);
    if (!used.has(idx)) { targets.push(idx); used.add(idx); }
  }
  targets.length = 50;

  const queries = targets.map((idx, qi) => {
    const r = rows[idx];
    const variants = [
      // unique id token (keyword-friendly)
      `Find ${r.uniq}`,
      // paraphrase keeping distinctive tokens
      r.text.replace(/^[^:]+:\s*/, '').split('.').slice(0,1)[0],
      // semantic question
      `What was decided or noted about ${r.uniq} in ${r.namespace}?`,
      // stripped paraphrase without the uniq token
      r.text.replace(r.uniq, 'this item').replace(/Feature \w+|Project \w+|Bot \w+|Decision |Error resolved |Preference |Org\.\w+ rule /g, '').slice(0, 120).trim(),
      // namespace + key tech word from text
      `${r.namespace} ${r.text.match(/pgvector|halfvec|HNSW|tsvector|RRF|MiniLM|Neon|Tailscale|MCP|daemon|pg-boss|OpenRouter|Clerk|ICM/)?.[0] || 'memory'} ${r.uniq}`,
    ];
    return {
      qid: qi+1,
      query: variants[qi % variants.length],
      expected_id: r.id,
      expected_namespace: r.namespace,
      expected_uniq: r.uniq,
      expected_text: r.text.slice(0, 180),
      variant: qi % variants.length,
    };
  });

  mkdirSync('./out', { recursive: true });
  writeFileSync('./out/queries_v2.json', JSON.stringify(queries, null, 2));

  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log('Connected');

  // Keep smoke row; delete prior synthetic (a0-spike sessions)
  await client.query(`DELETE FROM memories WHERE source_session LIKE 'a0-spike%'`);
  const left = await client.query(`SELECT count(*)::int n FROM memories`);
  console.log('After cleanup count:', left.rows[0].n);

  // Bulk insert
  const SQL_BATCH = 50;
  const tIns = Date.now();
  for (let i = 0; i < rows.length; i += SQL_BATCH) {
    const chunk = rows.slice(i, i + SQL_BATCH);
    const vals = [];
    const params = [];
    let p = 1;
    for (const r of chunk) {
      vals.push(`($${p++}::uuid,$${p++},$${p++},$${p++},$${p++},$${p++},$${p++}::halfvec,$${p++},$${p++},$${p++},'indexed',$${p++},$${p++},$${p++},$${p++})`);
      params.push(r.id, r.type, r.scope, r.namespace, r.bot_id, r.text, r.halfvec, EMBEDDING_MODEL, r.importance, r.strength, r.pinned, r.source_session, r.author, r.origin);
    }
    await client.query(
      `INSERT INTO memories (id,type,scope,namespace,bot_id,text,embedding,embedding_model,importance,strength,status,pinned,source_session,author,origin) VALUES ${vals.join(',')}`,
      params
    );
    if ((i/SQL_BATCH) % 20 === 0) console.log(`  insert ${Math.min(i+SQL_BATCH,N)}/${N}`);
  }
  console.log(`Insert ${(Date.now()-tIns)/1000}s`);

  await client.query(`SET hnsw.ef_search = 100`);

  async function embed(text) {
    const out = await extractor(text, { pooling: 'mean', normalize: true });
    return halfvecLiteral(Array.from(out.data));
  }

  async function runKeyword(q, k=10) {
    const t0 = performance.now();
    const res = await client.query(`
      SELECT id::text FROM memories
      WHERE status='indexed' AND text_tsv @@ plainto_tsquery('english', $1)
      ORDER BY ts_rank_cd(text_tsv, plainto_tsquery('english', $1)) DESC
      LIMIT $2`, [q, k]);
    return { ids: res.rows.map(r=>r.id), latency_ms: performance.now()-t0 };
  }
  async function runVector(qEmb, k=10) {
    const t0 = performance.now();
    const res = await client.query(`
      SELECT id::text FROM memories
      WHERE status='indexed' AND embedding IS NOT NULL
      ORDER BY embedding <=> $1::halfvec
      LIMIT $2`, [qEmb, k]);
    return { ids: res.rows.map(r=>r.id), latency_ms: performance.now()-t0 };
  }
  async function runHybrid(q, qEmb, k=10, rrf_k=60) {
    const t0 = performance.now();
    const res = await client.query(`
      WITH kw AS (
        SELECT id, row_number() OVER (ORDER BY ts_rank_cd(text_tsv, plainto_tsquery('english', $1)) DESC) AS rnk
        FROM memories
        WHERE status='indexed' AND text_tsv @@ plainto_tsquery('english', $1)
        ORDER BY ts_rank_cd(text_tsv, plainto_tsquery('english', $1)) DESC
        LIMIT 50
      ),
      vec AS (
        SELECT id, row_number() OVER (ORDER BY embedding <=> $2::halfvec) AS rnk
        FROM memories
        WHERE status='indexed' AND embedding IS NOT NULL
        ORDER BY embedding <=> $2::halfvec
        LIMIT 50
      ),
      fused AS (
        SELECT COALESCE(kw.id, vec.id) AS id,
               COALESCE(1.0/($3+kw.rnk),0) + COALESCE(1.0/($3+vec.rnk),0) AS rrf
        FROM kw FULL OUTER JOIN vec ON kw.id = vec.id
      )
      SELECT id::text FROM fused ORDER BY rrf DESC LIMIT $4
    `, [q, qEmb, rrf_k, k]);
    return { ids: res.rows.map(r=>r.id), latency_ms: performance.now()-t0 };
  }

  // Warmup
  {
    const we = await embed(queries[0].query);
    await runKeyword(queries[0].query); await runVector(we); await runHybrid(queries[0].query, we);
    // second warmup after cold start
    await runKeyword(queries[0].query); await runVector(we); await runHybrid(queries[0].query, we);
  }

  const perQuery = [];
  const buckets = { keyword: [], vector: [], hybrid: [] };
  for (let i = 0; i < queries.length; i++) {
    const q = queries[i];
    const qEmb = await embed(q.query);
    const kw = await runKeyword(q.query);
    const vec = await runVector(qEmb);
    const hyb = await runHybrid(q.query, qEmb);
    const hit = (ids) => ids.includes(q.expected_id);
    perQuery.push({
      qid: q.qid, query: q.query.slice(0,100), variant: q.variant,
      expected_id: q.expected_id, expected_uniq: q.expected_uniq, expected_namespace: q.expected_namespace,
      keyword: { hit: hit(kw.ids), latency_ms: +kw.latency_ms.toFixed(3), rank: kw.ids.indexOf(q.expected_id) },
      vector: { hit: hit(vec.ids), latency_ms: +vec.latency_ms.toFixed(3), rank: vec.ids.indexOf(q.expected_id) },
      hybrid: { hit: hit(hyb.ids), latency_ms: +hyb.latency_ms.toFixed(3), rank: hyb.ids.indexOf(q.expected_id) },
    });
    buckets.keyword.push(kw); buckets.vector.push(vec); buckets.hybrid.push(hyb);
    if ((i+1)%10===0) console.log(`Bench ${i+1}/50`);
  }

  function summarize(name, runs, hits) {
    const lats = runs.map(r => r.latency_ms);
    return {
      mode: name, n: runs.length,
      recall_at_10: hits.filter(Boolean).length / hits.length,
      hits: hits.filter(Boolean).length,
      p50_ms: +pct(lats, 50).toFixed(2),
      p95_ms: +pct(lats, 95).toFixed(2),
      mean_ms: +(lats.reduce((a,b)=>a+b,0)/lats.length).toFixed(2),
      min_ms: +Math.min(...lats).toFixed(2),
      max_ms: +Math.max(...lats).toFixed(2),
    };
  }

  const summary = {
    keyword: summarize('keyword', buckets.keyword, perQuery.map(r=>r.keyword.hit)),
    vector: summarize('vector', buckets.vector, perQuery.map(r=>r.vector.hit)),
    hybrid: summarize('hybrid', buckets.hybrid, perQuery.map(r=>r.hybrid.hit)),
  };

  // Also measure DB-only latency via EXPLAIN ANALYZE on hybrid for a sample
  const sampleEmb = await embed(queries[5].query);
  const explain = await client.query(`
    EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
    WITH kw AS (
      SELECT id, row_number() OVER (ORDER BY ts_rank_cd(text_tsv, plainto_tsquery('english', $1)) DESC) AS rnk
      FROM memories WHERE status='indexed' AND text_tsv @@ plainto_tsquery('english', $1)
      ORDER BY ts_rank_cd(text_tsv, plainto_tsquery('english', $1)) DESC LIMIT 50
    ),
    vec AS (
      SELECT id, row_number() OVER (ORDER BY embedding <=> $2::halfvec) AS rnk
      FROM memories WHERE status='indexed' AND embedding IS NOT NULL
      ORDER BY embedding <=> $2::halfvec LIMIT 50
    ),
    fused AS (
      SELECT COALESCE(kw.id, vec.id) AS id,
             COALESCE(1.0/(60+kw.rnk),0)+COALESCE(1.0/(60+vec.rnk),0) AS rrf
      FROM kw FULL OUTER JOIN vec ON kw.id=vec.id
    )
    SELECT id FROM fused ORDER BY rrf DESC LIMIT 10
  `, [queries[5].query, sampleEmb]);
  const plan = explain.rows[0]['QUERY PLAN'][0];
  const db_exec_ms = plan['Execution Time'];
  const db_plan_ms = plan['Planning Time'];

  const counts = await client.query(`
    SELECT count(*)::int AS total,
           count(*) FILTER (WHERE embedding IS NOT NULL)::int AS with_emb,
           count(DISTINCT namespace)::int AS namespaces
    FROM memories WHERE status='indexed'`);
  const nsDist = await client.query(`
    SELECT CASE
      WHEN namespace LIKE 'project-%' THEN 'project-*'
      WHEN namespace LIKE 'feature-%' THEN 'feature-*'
      WHEN namespace LIKE 'bot-%' THEN 'bot-*'
      WHEN namespace LIKE 'decisions-%' THEN 'decisions-*'
      WHEN namespace LIKE 'errors-resolved-%' THEN 'errors-resolved-*'
      WHEN namespace LIKE 'org.%' THEN 'org.*'
      ELSE namespace END AS ns_family, count(*)::int n
    FROM memories GROUP BY 1 ORDER BY 2 DESC`);

  // Gate decision uses hybrid as primary (plan: RRF-SQL hybrid vs keyword-only baseline)
  const hyb = summary.hybrid;
  let gate = 'KILL';
  let gate_reason = '';
  if (hyb.recall_at_10 >= 0.7 && hyb.p95_ms < 500) {
    gate = 'STAY';
    gate_reason = `hybrid recall@10=${hyb.recall_at_10} ≥ 0.7 AND p95=${hyb.p95_ms}ms < 500ms`;
  } else if (hyb.recall_at_10 < 0.6) {
    gate = 'KILL';
    gate_reason = `hybrid recall@10=${hyb.recall_at_10} < 0.6 kill trigger`;
  } else {
    gate = 'MARGINAL';
    gate_reason = `hybrid recall@10=${hyb.recall_at_10} in [0.6,0.7) or p95=${hyb.p95_ms}ms — neither stay nor hard kill; investigate corpus/queries`;
  }

  const out = {
    generated_at: new Date().toISOString(),
    timezone_note: 'Asia/Calcutta (IST)',
    corpus: counts.rows[0],
    namespace_families: nsDist.rows,
    embedding_model: EMBEDDING_MODEL,
    embedder: 'Xenova/all-MiniLM-L6-v2 quantized ONNX via @xenova/transformers',
    pgvector: '0.8.0',
    hnsw: { m: 16, ef_construction: 128, ef_search: 100, ops: 'halfvec_cosine_ops' },
    rrf_k: 60,
    latency_method: 'client-side performance.now() around Neon pooled query (includes RTT); plus sample EXPLAIN ANALYZE DB exec',
    sample_explain_hybrid_ms: { planning: db_plan_ms, execution: db_exec_ms },
    gates: { stay: 'recall@10 >= 0.7 AND p95 < 500ms', kill: 'recall@10 < 0.6' },
    gate, gate_reason,
    summary,
    per_query: perQuery,
  };
  writeFileSync('./out/bench_results.json', JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ summary, gate, gate_reason, corpus: counts.rows[0], sample_explain_hybrid_ms: out.sample_explain_hybrid_ms }, null, 2));
  await client.end();
}

main().catch(e => { console.error(e); process.exit(1); });
