/**
 * Time webhook → /wake → first Neon row. Writes daemon/out/b0-timing.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

const PORT = Number(process.env.PORT || 8787);
const WAKE_TOKEN = process.env.WAKE_TOKEN;
const label = process.argv[2] || 'run';

const t0 = performance.now();
const res = await fetch(`http://127.0.0.1:${PORT}/wake`, {
  method: 'POST',
  headers: {
    authorization: `Bearer ${WAKE_TOKEN}`,
    'content-type': 'application/json',
  },
  body: JSON.stringify({ source: `bench-${label}` }),
});
const wallMs = performance.now() - t0;
const body = await res.json();
const out = {
  label,
  http_status: res.status,
  client_wall_ms: Number(wallMs.toFixed(2)),
  ...body,
  measured_at: new Date().toISOString(),
  measured_at_ist: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Calcutta' }),
};
const outDir = path.join(__dirname, 'out');
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, `b0-timing-${label}.json`);
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(JSON.stringify({ written: outPath, cold_start_ms: out.cold_start_ms, pass: out.pass, client_wall_ms: out.client_wall_ms }, null, 2));
if (!out.pass) process.exitCode = 2;
