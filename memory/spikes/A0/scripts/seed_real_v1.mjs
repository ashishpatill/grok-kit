/**
 * Seed spikes/A0/real-corpus.jsonl into a database that already has schema v1.sql.
 * Requires DATABASE_URL. Embeds with Xenova MiniLM-L6-v2 (384-dim halfvec).
 *
 * Usage (from memory/ with deps installed):
 *   node spikes/A0/scripts/seed_real_v1.mjs
 */
import pg from 'pg';
import { pipeline } from '@xenova/transformers';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const CORPUS = resolve(__dir, '../real-corpus.jsonl');
const EMBEDDING_MODEL = 'minilm-l6-v2@1';
const MODEL = 'Xenova/all-MiniLM-L6-v2';
const BATCH = 16;
const IMPORT_BATCH = 'real-corpus-a0.2';

function halfvecLiteral(arr) {
  let s = '[';
  for (let i = 0; i < arr.length; i++) {
    if (i) s += ',';
    s += Number(arr[i]).toFixed(6);
  }
  return s + ']';
}

const rows = readFileSync(CORPUS, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
console.log('corpus', rows.length);

const embedder = await pipeline('feature-extraction', MODEL);
const embeddings = [];
for (let i = 0; i < rows.length; i += BATCH) {
  const slice = rows.slice(i, i + BATCH);
  for (const r of slice) {
    const tensor = await embedder(r.text, { pooling: 'mean', normalize: true });
    embeddings.push(Array.from(tensor.data));
  }
  console.log(`embed ${Math.min(i + BATCH, rows.length)}/${rows.length}`);
}

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();

await client.query(
  `DELETE FROM memories WHERE provenance->>'import_batch' = $1`,
  [IMPORT_BATCH],
);

let n = 0;
for (let i = 0; i < rows.length; i++) {
  const r = rows[i];
  const provenance = {
    ...(r.provenance || {}),
    origin: 'external',
    created_at: new Date().toISOString(),
    embedding_model: EMBEDDING_MODEL,
    import_batch: IMPORT_BATCH,
    author: r.provenance?.bot ? `bot:${r.provenance.bot}` : 'import:real-corpus',
  };
  await client.query(
    `INSERT INTO memories (
      id, namespace, type, scope, text, embedding, index_status,
      importance, strength, approval, grounding_ids, provenance
    ) VALUES (
      $1, $2, $3, 'global', $4, $5::halfvec, 'indexed',
      $6, 5.0, 'live', '{}', $7::jsonb
    )`,
    [r.id, r.namespace, r.type, r.text, halfvecLiteral(embeddings[i]), r.importance ?? 5, JSON.stringify(provenance)],
  );
  n++;
}
console.log('inserted', n, 'into v1 memories');
await client.end();
