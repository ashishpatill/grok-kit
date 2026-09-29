/**
 * Thin bot-memory propose() client for GrokKit skills (P2.K1–K3, P2.S1).
 *
 * Always goes through MCP propose() write gates — never store().
 * When DATABASE_URL is unset, returns { skipped: true } so unit tests stay offline.
 * Inject `proposeFn` to stub in tests.
 */
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dir, '..', '..');
const MCP_ENTRY = join(REPO_ROOT, 'memory', 'mcp', 'index.mjs');

/**
 * @typedef {{ namespace: string, text: string, metadata?: Record<string, unknown> }} ProposeArgs
 * @typedef {{ status?: string, decision?: string, reason?: string, id?: string, proposal_id?: string, skipped?: boolean, error?: string }} ProposeResult
 */

/**
 * Drive one propose() call over memory-mcp stdio.
 * @param {ProposeArgs} args
 * @param {{ databaseUrl?: string, mcpEntry?: string, timeoutMs?: number }} [opts]
 * @returns {Promise<ProposeResult>}
 */
export async function proposeViaMcp(args, opts = {}) {
  const databaseUrl = opts.databaseUrl || process.env.DATABASE_URL || process.env.BOT_MEMORY_URL;
  if (!databaseUrl) {
    return { skipped: true, reason: 'no-database-url' };
  }
  const mcpEntry = opts.mcpEntry || MCP_ENTRY;
  const timeoutMs = opts.timeoutMs ?? 60_000;

  const srv = spawn('node', [mcpEntry], {
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let buf = '';
  let reqId = 0;
  /** @type {Map<number, {resolve: Function, reject: Function}>} */
  const pending = new Map();

  const fail = (err) => {
    for (const { reject } of pending.values()) reject(err);
    pending.clear();
  };

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
  srv.stderr.on('data', () => {
    /* mcp logs to stderr; ignore */
  });
  srv.on('error', fail);
  srv.on('exit', (code) => {
    if (pending.size) fail(new Error(`memory-mcp exited ${code} with pending RPCs`));
  });

  function rpc(method, params) {
    const id = ++reqId;
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`rpc timeout ${method}`));
      }, timeoutMs);
      pending.set(id, {
        resolve: (msg) => {
          clearTimeout(t);
          resolve(msg);
        },
        reject: (e) => {
          clearTimeout(t);
          reject(e);
        },
      });
      srv.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  }

  try {
    await rpc('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'grok-kit-skill-propose', version: '1' },
    });
    srv.stdin.write(
      JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }) + '\n'
    );
    const res = await rpc('tools/call', {
      name: 'propose',
      arguments: {
        namespace: args.namespace,
        text: args.text,
        metadata: args.metadata || {},
      },
    });
    if (res.error) {
      return { status: 'error', error: JSON.stringify(res.error) };
    }
    const text = res.result?.content?.[0]?.text ?? '';
    try {
      return JSON.parse(text);
    } catch {
      return { status: 'error', error: 'non-json propose response', raw: text };
    }
  } finally {
    try {
      srv.stdin.end();
    } catch {
      /* ignore */
    }
    srv.kill('SIGTERM');
  }
}

/**
 * Propose an episodic record (auto-approved per IDL §12).
 * @param {{ namespace: string, text: string, metadata?: Record<string, unknown>, proposeFn?: Function, databaseUrl?: string }} opts
 */
export async function emitEpisodic(opts) {
  const metadata = {
    type: 'episodic',
    scope: opts.metadata?.scope || 'global',
    author: opts.metadata?.author || 'grok-kit',
    origin: opts.metadata?.origin || 'skill-emit',
    importance: opts.metadata?.importance ?? 5,
    strength: opts.metadata?.strength ?? 5.0,
    ...opts.metadata,
    type: 'episodic',
  };
  const args = { namespace: opts.namespace, text: opts.text, metadata };
  if (typeof opts.proposeFn === 'function') {
    return opts.proposeFn(args);
  }
  return proposeViaMcp(args, { databaseUrl: opts.databaseUrl });
}

/**
 * Propose a semantic learning through the gates (may queue for human review).
 */
export async function emitSemanticPropose(opts) {
  const metadata = {
    type: 'semantic',
    scope: 'global',
    author: opts.metadata?.author || 'grok-kit',
    origin: opts.metadata?.origin || 'skill-propose',
    grounding_ids: opts.metadata?.grounding_ids || [],
    importance: opts.metadata?.importance ?? 5,
    strength: opts.metadata?.strength ?? 5.0,
    ...opts.metadata,
    type: 'semantic',
  };
  const args = { namespace: opts.namespace, text: opts.text, metadata };
  if (typeof opts.proposeFn === 'function') {
    return opts.proposeFn(args);
  }
  return proposeViaMcp(args, { databaseUrl: opts.databaseUrl });
}

/** True when skills should attempt a live emit (opt-out via MEMORY_EMIT=0). */
export function memoryEmitEnabled() {
  if (process.env.MEMORY_EMIT === '0' || process.env.MEMORY_EMIT === 'false') return false;
  return Boolean(process.env.DATABASE_URL || process.env.BOT_MEMORY_URL);
}
