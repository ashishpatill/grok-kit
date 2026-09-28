/**
 * Enqueue one spike job onto the memory-embed pg-boss queue (same Neon DB).
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { PgBoss } from 'pg-boss';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

const DATABASE_URL = process.env.DATABASE_URL;
const QUEUE = process.env.MEMORY_QUEUE || 'memory-embed';

if (!DATABASE_URL) {
  console.error('DATABASE_URL missing');
  process.exit(1);
}

const boss = new PgBoss({ connectionString: DATABASE_URL, migrate: true, supervise: false, schedule: false });
boss.on('error', (e) => console.error(e.message));
await boss.start();
try {
  await boss.createQueue(QUEUE);
} catch {
  /* exists */
}
const id = await boss.send(QUEUE, {
  kind: 'spike-embed',
  memory_id: null,
  note: 'B0 spike job',
  enqueued_at: new Date().toISOString(),
});
console.log(JSON.stringify({ ok: true, queue: QUEUE, job_id: id }));
await boss.stop({ graceful: false, timeout: 5000 });
