/**
 * P2.K4 smoke: refine-harness cites memory IDs in generated patches.
 *
 * Offline unit path always runs. When DATABASE_URL is set, also recalls
 * ≥1 live memory id from Neon main and builds a cited patch (read-only;
 * no propose/store writes).
 *
 * Usage:
 *   node skills/refine-harness/scripts/cite-smoke.mjs
 *   DATABASE_URL=… NODE_OPTIONS=--no-network-family-autoselection \
 *     node skills/refine-harness/scripts/cite-smoke.mjs
 */
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildPatch,
  buildPatches,
  formatPatchProposals,
  citeFromRecall,
  fakeMemoryId,
  isMemoryId,
} from './cite-patches.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dir, '..', '..', '..');

let failures = 0;
function assert(cond, label, extra = '') {
  if (cond) console.log(`  PASS ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label} ${extra}`);
  }
}

console.log('P2.K4 offline smoke…');
{
  let threw = false;
  try {
    buildPatch({
      target: 't',
      evidence: 'e',
      proposed: 'p',
      risk: 'r',
      memory_ids: [],
    });
  } catch {
    threw = true;
  }
  assert(threw, 'rejects patch with empty memory_ids');
}

{
  const id = fakeMemoryId();
  const p = buildPatch({
    target: 'skills/refine-harness/SKILL.md',
    evidence: 'Smoke: ungrounded patch rejected.',
    proposed: 'Require memory_ids on every patch.',
    risk: 'Low — validation only.',
    memory_ids: [id],
  });
  assert(p.memory_ids[0] === id, 'accepts cited patch');
  const md = formatPatchProposals([p]);
  assert(md.includes(id), 'proposal markdown includes memory id');
}

{
  let threw = false;
  try {
    buildPatches(
      Array.from({ length: 4 }, (_, i) => ({
        target: `t-${i}`,
        evidence: 'e',
        proposed: 'p',
        risk: 'r',
        memory_ids: [fakeMemoryId()],
      }))
    );
  } catch {
    threw = true;
  }
  assert(threw, 'rejects >3 patches');
}

assert(isMemoryId('real_ab618b1beb64b21c1ee1a389c2'), 'accepts import-prefixed ids');
assert(isMemoryId(fakeMemoryId()), 'accepts UUID ids');

const DATABASE_URL = process.env.DATABASE_URL || process.env.BOT_MEMORY_URL;
if (!DATABASE_URL) {
  console.log('DATABASE_URL unset — skipping live recall cite (offline OK).');
  if (failures) {
    console.error(`FAIL ${failures}`);
    process.exit(1);
  }
  console.log('ALL GREEN (offline)');
  process.exit(0);
}

console.log('P2.K4 live recall cite (Neon main, read-only)…');

function spawnMcp() {
  const srv = spawn('node', [join(REPO, 'memory', 'mcp', 'index.mjs')], {
    env: { ...process.env, DATABASE_URL },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let buf = '';
  let reqId = 0;
  const pending = new Map();
  srv.stdout.on('data', (d) => {
    buf += d.toString();
    let idx;
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line) continue;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        continue;
      }
      if (msg.id != null && pending.has(msg.id)) {
        const { resolve } = pending.get(msg.id);
        pending.delete(msg.id);
        resolve(msg);
      }
    }
  });
  function rpc(method, params) {
    const id = ++reqId;
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`rpc timeout ${method}`)), 60_000);
      pending.set(id, {
        resolve: (msg) => {
          clearTimeout(t);
          resolve(msg);
        },
      });
      srv.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  }
  async function callTool(name, args) {
    const res = await rpc('tools/call', { name, arguments: args });
    if (res.error) throw new Error(`tools/call ${name}: ${JSON.stringify(res.error)}`);
    const text = res.result?.content?.[0]?.text ?? '';
    return JSON.parse(text);
  }
  return { srv, rpc, callTool };
}

const { srv, rpc, callTool } = spawnMcp();
try {
  await rpc('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'p2k4-smoke', version: '1' },
  });
  srv.stdin.write(
    JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }) + '\n'
  );

  // Canonical kit namespace uses a hyphen (project-grok-kit); fall back to preferences.
  const namespaces = ['project-grok-kit', 'preferences', 'project-bot-memory'];
  let ids = [];
  let usedNs = null;
  for (const ns of namespaces) {
    const parsed = await callTool('recall', {
      namespace: ns,
      query: 'harness propose write gates episodic memory',
      k: 5,
    });
    const results = parsed?.results || [];
    ids = results.map((r) => r.id || r.memory_id).filter(Boolean).map(String);
    if (ids.length >= 1) {
      usedNs = ns;
      break;
    }
  }
  assert(ids.length >= 1, `recall returned ≥1 id (ns=${usedNs})`, JSON.stringify(ids).slice(0, 120));
  assert(ids.every(isMemoryId), 'recalled ids pass isMemoryId');

  const patches = await citeFromRecall(
    [
      {
        target: 'skills/refine-harness/SKILL.md',
        evidence: `Live recall on ${usedNs} returned grounding memories for harness refine.`,
        proposed: 'Cite memory_ids from recall on every refine-harness patch.',
        risk: 'Docs-only if IDs stale; human still gates apply.',
      },
    ],
    async () => ids
  );
  assert(patches[0].memory_ids.length >= 1, 'cited patch has memory_ids');
  assert(ids.includes(patches[0].memory_ids[0]), 'cited id came from recall');
  console.log(`  cited ns=${usedNs} id=${patches[0].memory_ids[0]}`);
} finally {
  try {
    srv.stdin.end();
  } catch {
    /* ignore */
  }
  srv.kill('SIGTERM');
}

if (failures) {
  console.error(`FAIL ${failures}`);
  process.exit(1);
}
console.log('ALL GREEN');
process.exit(0);
