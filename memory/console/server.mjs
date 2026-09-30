#!/usr/bin/env node
/**
 * Bot-memory console — local human surface for review queue / recall / hot-pin.
 *
 * Default: synthetic stub seed (no Neon, no private memory).
 *   node console/server.mjs
 *   open http://127.0.0.1:7432
 *
 * Env:
 *   PORT                 listen port (default 7432)
 *   MEMORY_CONSOLE_SEED  optional JSON array path (default fixtures/demo-seed.json)
 *
 * Honest product surface: propose gates, visible recall provenance, hot-pin preview.
 * Not a fake metrics dashboard.
 */
import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createConsoleSession } from './session.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 7432);
const HOST = process.env.HOST || '127.0.0.1';
const publicDir = join(__dir, 'public');

const session = createConsoleSession();

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
};

function sendJson(res, status, body) {
  const raw = JSON.stringify(body, null, 2);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(raw);
}

async function readJson(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    const err = new Error('invalid JSON body');
    err.code = 'BAD_JSON';
    throw err;
  }
}

function serveStatic(req, res) {
  let path = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  if (path.includes('..')) {
    res.writeHead(400).end('bad path');
    return true;
  }
  const file = join(publicDir, path);
  if (!file.startsWith(publicDir) || !existsSync(file)) return false;
  const data = readFileSync(file);
  res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
  res.end(data);
  return true;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${HOST}:${PORT}`);
    const { pathname } = url;

    if (req.method === 'GET' && !pathname.startsWith('/api/')) {
      if (serveStatic(req, res)) return;
      res.writeHead(404).end('not found');
      return;
    }

    if (req.method === 'GET' && pathname === '/api/status') {
      return sendJson(res, 200, await session.status());
    }
    if (req.method === 'GET' && pathname === '/api/namespaces') {
      return sendJson(res, 200, await session.listNamespaces());
    }
    if (req.method === 'GET' && pathname === '/api/review') {
      return sendJson(res, 200, await session.reviewList());
    }
    if (req.method === 'GET' && pathname === '/api/hot-pin') {
      return sendJson(res, 200, await session.hotPinPreview());
    }
    if (req.method === 'GET' && pathname === '/api/recall') {
      const namespace = url.searchParams.get('namespace') || '';
      const query = url.searchParams.get('query') || '';
      const k = Number(url.searchParams.get('k') || 8);
      return sendJson(res, 200, await session.recall(namespace, query, k));
    }

    if (req.method === 'POST' && pathname === '/api/propose') {
      const body = await readJson(req);
      return sendJson(res, 200, await session.propose(body.namespace, body.text, body.metadata || {}));
    }
    if (req.method === 'POST' && pathname === '/api/store') {
      const body = await readJson(req);
      return sendJson(res, 200, await session.store(body.namespace, body.text, body.metadata || {}));
    }
    if (req.method === 'POST' && pathname === '/api/promote') {
      const body = await readJson(req);
      return sendJson(res, 200, await session.promote(body.proposal_id, body.decided_by || 'human:console', body.note));
    }
    if (req.method === 'POST' && pathname === '/api/reject') {
      const body = await readJson(req);
      return sendJson(res, 200, await session.reject(body.proposal_id, body.decided_by || 'human:console', body.note));
    }

    sendJson(res, 404, { status: 'error', error: 'NOT_FOUND', detail: pathname });
  } catch (e) {
    const status = e.code === 'BAD_JSON' ? 400 : 500;
    sendJson(res, status, { status: 'error', error: String(e.message || e) });
  }
});

server.listen(PORT, HOST, () => {
  console.error(`[memory-console] http://${HOST}:${PORT}  (stub demo seed — synthetic only)`);
});
