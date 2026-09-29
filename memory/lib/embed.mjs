/**
 * Shared MiniLM-L6-v2 embedder (384-dim halfvec) for MCP/CLI/workers.
 * Xenova/transformers; lazy-loaded; $0 API cost.
 */
let embedder = null;

export function halfvecLiteral(arr) {
  const parts = new Array(arr.length);
  for (let i = 0; i < arr.length; i++) parts[i] = Number(arr[i]).toFixed(6);
  return '[' + parts.join(',') + ']';
}

export async function getEmbedder() {
  if (!embedder) {
    const { pipeline } = await import('@xenova/transformers');
    embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }
  return embedder;
}

/** @returns {Promise<string>} halfvec literal e.g. '[0.1,0.2,...]' */
export async function embedText(text) {
  const ex = await getEmbedder();
  const out = await ex(String(text || ''), { pooling: 'mean', normalize: true });
  return halfvecLiteral(Array.from(out.data));
}

/** @returns {Promise<Float32Array>} normalized mean-pooled vector */
export async function embedTextVector(text) {
  const ex = await getEmbedder();
  const out = await ex(String(text || ''), { pooling: 'mean', normalize: true });
  return Float32Array.from(out.data);
}

export const EMBEDDING_MODEL = 'minilm-l6-v2@1';
