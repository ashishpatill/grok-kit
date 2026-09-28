/**
 * C0 proof: store a fact via SQL-equivalent path using the same helpers,
 * then recall it — exercises Neon branch without needing a full MCP client.
 * Also runs a minimal MCP Client→stdio Server round-trip when possible.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import dotenv from 'dotenv';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

const marker = `C0-SPIKE-FACT-${Date.now()}`;
const namespace = 'preferences';
const text = `BIMLabz CEO prefers Neon cloud-first memory; spike marker ${marker}.`;

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [path.join(__dirname, 'index.mjs')],
  env: { ...process.env },
  stderr: 'pipe',
});

const client = new Client({ name: 'c0-roundtrip', version: '0.0.1' });
const t0 = Date.now();
await client.connect(transport);

const tools = await client.listTools();
const storeRes = await client.callTool({
  name: 'store',
  arguments: {
    namespace,
    text,
    metadata: {
      type: 'semantic',
      scope: 'global',
      author: 'c0-roundtrip',
      origin: 'c0-spike',
      source_session: 'c0-roundtrip',
      importance: 8,
    },
  },
});
const storeText = storeRes.content?.[0]?.text || '';
const storeJson = JSON.parse(storeText);

const recallRes = await client.callTool({
  name: 'recall',
  arguments: {
    namespace,
    query: marker,
    k: 5,
  },
});
const recallText = recallRes.content?.[0]?.text || '';
const recallJson = JSON.parse(recallText);

const hit = (recallJson.results || []).some(
  (r) => r.id === storeJson.id || (r.text && r.text.includes(marker))
);

const out = {
  ok: hit && storeJson.status === 'ok',
  tools: tools.tools.map((t) => t.name),
  store: storeJson,
  recall: {
    status: recallJson.status,
    count: recallJson.count,
    ids: (recallJson.results || []).map((r) => r.id),
    hit,
  },
  elapsed_ms: Date.now() - t0,
  at: new Date().toISOString(),
  at_ist: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Calcutta' }),
};

const outDir = path.join(__dirname, 'out');
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, 'c0-roundtrip.json');
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(JSON.stringify({ written: outPath, ok: out.ok, hit, store_id: storeJson.id, recall_status: recallJson.status, elapsed_ms: out.elapsed_ms }, null, 2));

await client.close();
process.exit(out.ok ? 0 : 1);
