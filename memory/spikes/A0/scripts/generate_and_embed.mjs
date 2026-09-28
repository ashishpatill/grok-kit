/**
 * A0 spike: generate ~5000 synthetic memories + MiniLM-L6-v2 embeddings.
 * Outputs: corpus.jsonl, queries.json, sql_batches/ (INSERT batches)
 */
import { pipeline } from '@xenova/transformers';
import { writeFileSync, mkdirSync, createWriteStream } from 'fs';
import { randomUUID } from 'crypto';

const N = 5000;
const MODEL = 'Xenova/all-MiniLM-L6-v2';
const EMBEDDING_MODEL = 'minilm-l6-v2@1';
const BATCH_SIZE = 32;
const SQL_BATCH = 40; // rows per INSERT statement

const PROJECTS = ['bimlabz-web', 'grok-kit', 'moose', 'superlearn', 'bot-memory', 'render-dash', 'neon-ops', 'clerk-auth', 'tailscale-mesh', 'figma-bridge'];
const FEATURES = ['auth', 'billing', 'deploy', 'memory', 'mcp', 'sync', 'search', 'handoff', 'review', 'backup'];
const BOTS = ['grok', 'moose', 'curator', 'embed-worker', 'consolidator'];
const DECISIONS = ['storage', 'daemon', 'mcp', 'autonomy', 'triage', 'embeddings', 'namespaces', 'backup'];
const ERRORS = ['hnsw-ops', 'halfvec-cast', 'wake-lost', 'pool-timeout', 'dedup-false-pos', 'embed-null', 'rrf-tie', 'tsv-empty'];
const ORG = ['prefs', 'roster', 'nonnegotiables', 'roles', 'budget'];

const TYPES = ['working', 'episodic', 'semantic', 'procedural', 'goals'];
const SCOPES = { global: 'global', node_local: 'node_local', edge: 'edge' };

function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
function pickN(a, n) { const s = [...a].sort(() => Math.random() - 0.5); return s.slice(0, n); }

const TEMPLATES = {
  project: (p, i) => [
    `Project ${p}: decided to use NeonDB pgvector halfvec(384) for shared bot memory storage.`,
    `Project ${p}: deployment gate requires human approval before schema migrations on main.`,
    `Project ${p}: Sprint ${i % 12 + 1} goal is hybrid RRF search with tsvector + HNSW cosine.`,
    `Project ${p}: verified that LISTEN/NOTIFY is unsuitable for sleeping daemon wake path.`,
    `Project ${p}: local replica profile hot syncs pinned + last-30d episodic only.`,
    `Project ${p}: OpenRouter cheap-tier routes all consolidation and importance scoring calls.`,
    `Project ${p}: craft-log markdown export is audit view only, not the runtime fetch path.`,
    `Project ${p}: Tailscale mesh exposes MCP SSE endpoint for Moose remote clients.`,
  ],
  feature: (f, i) => [
    `Feature ${f}: canonical learning — writes must cite grounding memory IDs for provenance.`,
    `Feature ${f}: conflict detection uses optimistic version column; resolution weighs evidence.`,
    `Feature ${f}: advisory steward is optional; no privileged writers per Q6 no-gatekeeping.`,
    `Feature ${f}: acceptance criterion includes recall@10 ≥ 0.7 with p95 latency under 500ms.`,
    `Feature ${f}: HNSW index uses halfvec_cosine_ops with m=16 and ef_construction=128.`,
    `Feature ${f}: staged memories become indexed only after MiniLM embedding is filled.`,
    `Feature ${f}: RRF fusion k=60 combines keyword rank and vector rank in SQL.`,
    `Feature ${f}: bi-temporal valid_from/valid_to supports as_of time-travel queries.`,
  ],
  bot: (b, i) => [
    `Bot ${b} scratch: currently tracking ${i} pending embed_memory jobs in pg-boss queue.`,
    `Bot ${b} note: prefer condensation-first distilled learnings over raw chat trajectories.`,
    `Bot ${b} reminder: never store secrets in memory; reject writes missing provenance fields.`,
    `Bot ${b} working: preparing nightly consolidate job for duplicate merge at sim≥0.92.`,
    `Bot ${b} episodic: last wake drained ${20 + (i % 40)} jobs then closed pooled connections.`,
    `Bot ${b} procedural: on crash, reconcile sweep claims orphaned jobs before serving.`,
  ],
  decisions: (d, i) => [
    `Decision ${d}: adopted on 2026-09-28 — binding for all BIMLabz bots going forward.`,
    `Decision ${d}: rationale recorded in PLAN-bot-memory-graph-v2 with Ashish sign-off.`,
    `Decision ${d}: alternative rejected because Neon free tier storage math forbids larger dims.`,
    `Decision ${d}: revisit only if measured recall@10 delta exceeds 0.05 on A/B spike.`,
  ],
  errors: (e, i) => [
    `Error resolved ${e}: root cause was wrong operator class; fix applied halfvec_cosine_ops.`,
    `Error resolved ${e}: symptom was empty HNSW results under filtered WHERE; set iterative_scan.`,
    `Error resolved ${e}: mitigation — webhook wake + reconcile sweep replaces lost NOTIFY signals.`,
    `Error resolved ${e}: verified with EXPLAIN ANALYZE that GIN tsvector path stays sub-50ms.`,
  ],
  preferences: (i) => [
    `Preference: Ashish wants weekly digest of autonomous memory actions, not live interrupts.`,
    `Preference: human approval always for money, sensitive, breaking, destructive, procedural writes.`,
    `Preference: Asia/Calcutta timezone for all reported timestamps and digests.`,
    `Preference: keep embedding computation local MiniLM — zero API cost on the hot path.`,
    `Preference: one shared memory for Grok bot and Moose; daemon is single writer.`,
  ],
  org: (o, i) => [
    `Org.${o}: BIMLabz non-negotiable — memory originals are immutable; supersede never deletes.`,
    `Org.${o}: roster includes Ashish (CEO), Grok bot, Moose; symmetric memory access for all bots.`,
    `Org.${o}: budget constraint — Neon free tier 0.5 GB; halfvec(384) keeps 1e5 rows ~73 MiB.`,
    `Org.${o}: goal — real-time recall at 1e5–1e6 records with p95 under 500ms over 2–3 years.`,
  ],
  goals: (i) => [
    `Goal: complete A0 Neon spike with 5k synthetic memories and 50 query recall benchmark.`,
    `Goal: ship P1 MCP store/recall with event-triggered daemon on Tailscale mesh.`,
    `Goal: prove no-gatekeeping concurrent writes resolve via evidence-weighing workflow.`,
    `Goal: freeze IDL v2.1 after Ashish sign-off before P1 implementation starts.`,
  ],
};

function makeCorpus() {
  const rows = [];
  // Ensure namespace coverage
  const plan = [];
  for (const p of PROJECTS) for (let k = 0; k < 80; k++) plan.push({ kind: 'project', key: p });
  for (const f of FEATURES) for (let k = 0; k < 80; k++) plan.push({ kind: 'feature', key: f });
  for (const b of BOTS) for (let k = 0; k < 100; k++) plan.push({ kind: 'bot', key: b });
  for (const d of DECISIONS) for (let k = 0; k < 60; k++) plan.push({ kind: 'decisions', key: d });
  for (const e of ERRORS) for (let k = 0; k < 50; k++) plan.push({ kind: 'errors', key: e });
  for (let k = 0; k < 200; k++) plan.push({ kind: 'preferences', key: null });
  for (const o of ORG) for (let k = 0; k < 60; k++) plan.push({ kind: 'org', key: o });
  for (let k = 0; k < 200; k++) plan.push({ kind: 'goals', key: null });
  // pad / trim to N
  while (plan.length < N) plan.push(pick(plan));
  plan.length = N;

  for (let i = 0; i < N; i++) {
    const item = plan[i];
    let namespace, type, scope, bot_id, texts;
    switch (item.kind) {
      case 'project':
        namespace = `project-${item.key}`;
        type = pick(['semantic', 'episodic', 'goals']);
        scope = 'global'; bot_id = null;
        texts = TEMPLATES.project(item.key, i);
        break;
      case 'feature':
        namespace = `feature-${item.key}`;
        type = pick(['semantic', 'procedural', 'episodic']);
        scope = 'global'; bot_id = null;
        texts = TEMPLATES.feature(item.key, i);
        break;
      case 'bot':
        namespace = `bot-${item.key}`;
        type = pick(['working', 'episodic', 'procedural', 'semantic']);
        scope = 'node_local'; bot_id = item.key;
        texts = TEMPLATES.bot(item.key, i);
        break;
      case 'decisions':
        namespace = `decisions-${item.key}`;
        type = 'episodic'; scope = 'global'; bot_id = null;
        texts = TEMPLATES.decisions(item.key, i);
        break;
      case 'errors':
        namespace = `errors-resolved-${item.key}`;
        type = 'episodic'; scope = 'global'; bot_id = null;
        texts = TEMPLATES.errors(item.key, i);
        break;
      case 'preferences':
        namespace = 'preferences';
        type = 'semantic'; scope = 'global'; bot_id = null;
        texts = TEMPLATES.preferences(i);
        break;
      case 'org':
        namespace = `org.${item.key}`;
        type = pick(['semantic', 'goals']);
        scope = 'global'; bot_id = null;
        texts = TEMPLATES.org(item.key, i);
        break;
      case 'goals':
        namespace = `project-${pick(PROJECTS)}`;
        type = 'goals'; scope = 'global'; bot_id = null;
        texts = TEMPLATES.goals(i);
        break;
    }
    // Unique-ish text: base template + distinctive token so queries can target specific rows
    const base = pick(texts);
    const uniq = `MEMKEY-${String(i).padStart(5, '0')}-${item.kind}`;
    const detail = [
      ` Context tag ${uniq}.`,
      ` Related keywords: ${pickN(['pgvector','halfvec','HNSW','tsvector','RRF','MiniLM','Neon','Tailscale','MCP','daemon','provenance','supersede','consolidation','webhook','pg-boss'], 3).join(', ')}.`,
      i % 5 === 0 ? ` Importance signal high for index ${i}.` : '',
    ].join('');
    const text = base + detail;
    const id = randomUUID();
    rows.push({
      id,
      type,
      scope,
      namespace,
      bot_id,
      text,
      importance: 1 + (i % 10),
      strength: 0.5 + (i % 50) / 100,
      pinned: namespace === 'preferences' && i % 7 === 0,
      source_session: `a0-spike-${Math.floor(i / 100)}`,
      author: bot_id ? `bot:${bot_id}` : (namespace === 'preferences' || namespace.startsWith('org.') ? 'human:ashish' : 'bot:grok'),
      origin: 'internal',
      idx: i,
      uniq,
    });
  }
  return rows;
}

function halfvecLiteral(arr) {
  // pgvector halfvec accepts '[f,f,...]' — keep ~4 decimal places
  let s = '[';
  for (let i = 0; i < arr.length; i++) {
    if (i) s += ',';
    s += Number(arr[i]).toFixed(6);
  }
  return s + ']';
}

function esc(s) {
  return s.replace(/'/g, "''");
}

async function main() {
  console.log('Generating corpus...');
  const rows = makeCorpus();
  console.log(`Corpus size: ${rows.length}`);

  console.log('Loading MiniLM pipeline...');
  const extractor = await pipeline('feature-extraction', MODEL, { quantized: true });

  console.log('Embedding...');
  const t0 = Date.now();
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE);
    const texts = chunk.map(r => r.text);
    const out = await extractor(texts, { pooling: 'mean', normalize: true });
    // out is Tensor [batch, 384] or list
    const data = out.data || out;
    const dims = 384;
    for (let j = 0; j < chunk.length; j++) {
      const start = j * dims;
      const vec = Array.from(data.slice(start, start + dims));
      chunk[j].embedding = vec;
      chunk[j].halfvec = halfvecLiteral(vec);
    }
    if ((i / BATCH_SIZE) % 10 === 0) {
      console.log(`  embedded ${Math.min(i + BATCH_SIZE, rows.length)}/${rows.length}`);
    }
  }
  console.log(`Embed done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  mkdirSync('/workspace/grok-kit-plan-staging/memory-p0/out', { recursive: true });
  mkdirSync('/workspace/grok-kit-plan-staging/memory-p0/sql_batches', { recursive: true });

  // Write corpus metadata (no full vectors in jsonl to keep small — vectors only in SQL)
  const metaPath = '/workspace/grok-kit-plan-staging/memory-p0/out/corpus_meta.jsonl';
  const meta = createWriteStream(metaPath);
  for (const r of rows) {
    meta.write(JSON.stringify({
      id: r.id, type: r.type, scope: r.scope, namespace: r.namespace,
      bot_id: r.bot_id, text: r.text, uniq: r.uniq, idx: r.idx,
      importance: r.importance, strength: r.strength, pinned: r.pinned,
      source_session: r.source_session, author: r.author, origin: r.origin,
    }) + '\n');
  }
  meta.end();

  // Build 50 query→expected-id pairs (hand-ish: use distinctive MEMKEY + paraphrase)
  const queries = [];
  const used = new Set();
  // Mix: exact keyword, semantic paraphrase, namespace-flavored
  const targets = [];
  // pick diverse indices
  for (const idx of [0, 17, 42, 99, 150, 200, 333, 400, 512, 777, 900, 1001, 1200, 1500, 1800, 2000, 2222, 2500, 2800, 3000, 3333, 3600, 3900, 4100, 4400, 4700, 4900, 55, 88, 123, 256, 512, 768, 1024, 2048, 3072, 4096, 4500, 4800, 4950, 25, 75, 175, 275, 375, 575, 675, 875, 975, 1175]) {
    if (idx < rows.length && !used.has(idx)) { targets.push(idx); used.add(idx); }
  }
  while (targets.length < 50) {
    const idx = Math.floor(Math.random() * rows.length);
    if (!used.has(idx)) { targets.push(idx); used.add(idx); }
  }
  targets.length = 50;

  for (let qi = 0; qi < targets.length; qi++) {
    const r = rows[targets[qi]];
    // Build a query that should retrieve this row: mix uniq token + paraphrase of base meaning
    const paraphrase = r.text
      .replace(/MEMKEY-\d{5}-\w+/, '')
      .replace(/Related keywords:.*?\./, '')
      .replace(/Context tag\s*\./, '')
      .replace(/Importance signal high for index \d+\./, '')
      .trim();
    // Shorten to query-like
    const words = paraphrase.split(/\s+/).slice(0, 14).join(' ');
    const qVariants = [
      words,
      `${r.uniq} ${words}`,
      `What did we decide about ${r.namespace.replace(/^(project|feature|bot|decisions|errors-resolved)-?/, '')}? ${words}`,
      `Find memory: ${r.uniq}`,
      paraphrase.slice(0, 100),
    ];
    queries.push({
      qid: qi + 1,
      query: qVariants[qi % qVariants.length],
      expected_id: r.id,
      expected_namespace: r.namespace,
      expected_uniq: r.uniq,
      expected_text: r.text.slice(0, 160),
    });
  }
  writeFileSync('/workspace/grok-kit-plan-staging/memory-p0/out/queries.json', JSON.stringify(queries, null, 2));

  // SQL batches: INSERT staged with embedding, then we'll set indexed in one UPDATE
  let batchNum = 0;
  for (let i = 0; i < rows.length; i += SQL_BATCH) {
    const chunk = rows.slice(i, i + SQL_BATCH);
    const values = chunk.map(r => {
      const bot = r.bot_id ? `'${esc(r.bot_id)}'` : 'NULL';
      const pinned = r.pinned ? 'true' : 'false';
      return `('${r.id}'::uuid,'${r.type}','${r.scope}','${esc(r.namespace)}',${bot},'${esc(r.text)}','${r.halfvec}'::halfvec,'${EMBEDDING_MODEL}',${r.importance},${r.strength},'staged',${pinned},'${esc(r.source_session)}','${esc(r.author)}','${r.origin}')`;
    }).join(',\n');
    const sql = `INSERT INTO memories (id,type,scope,namespace,bot_id,text,embedding,embedding_model,importance,strength,status,pinned,source_session,author,origin) VALUES\n${values};`;
    writeFileSync(`/workspace/grok-kit-plan-staging/memory-p0/sql_batches/batch_${String(batchNum).padStart(4, '0')}.sql`, sql);
    batchNum++;
  }
  writeFileSync('/workspace/grok-kit-plan-staging/memory-p0/out/batch_count.txt', String(batchNum));
  console.log(`Wrote ${batchNum} SQL batches + queries.json`);
}

main().catch(e => { console.error(e); process.exit(1); });
