# C0 — memory-mcp round-trip

**When:** 2026-09-28 ~20:20 IST (Asia/Calcutta)  
**Verdict:** **PASS** ✅ — stdio MCP Client → store → recall hit in **419 ms**.

> Code in `memory/mcp/` is **adapted to schema v1.sql** (provenance jsonb, `index_status` + `approval`, trigger-owned `sync_log`, TEXT ids, `list_namespaces`). The artifact below was measured on the legacy Neon spike schema; re-run `npm run mcp:roundtrip` against a v1 DB to refresh `out/c0-roundtrip.json`.

## Tools (v1-adapted)

| Tool | Args | Behavior |
|------|------|----------|
| `store` | `namespace`, `text`, `metadata?` | INSERT with `index_status='staged'`, `approval='live'`, `provenance` jsonb, `strength` default 5.0; **no** manual `sync_log` insert (AFTER INSERT trigger); enqueue `memory-embed` job |
| `recall` | `namespace`, `query`, `k?` | Keyword (`tsvector` + GIN); filters `approval='live'` and `index_status IN ('indexed','staged')`; returns `index_status` (not `status`); payload status `cold_start\|thin\|ok` |
| `list_namespaces` | — | `SELECT namespace, count(*) WHERE approval='live' GROUP BY namespace` |

## Round-trip proof (legacy run artifact)

```bash
cd memory
npm install
npm run mcp:roundtrip
# → spikes/C0/out/c0-roundtrip.json
```

| Metric | Value |
|--------|------:|
| ok / hit | **true** |
| store id | `abbce182-32fa-4450-bbec-6ae80d381f9e` |
| namespace | `preferences` |
| recall status | `ok` (1 hit) |
| embed_job_id | enqueued |
| elapsed | **419 ms** |
| tools (at run) | `store`, `recall` |

Artifact: `out/c0-roundtrip.json` (historical; tools list predates `list_namespaces`).

## How to run (stdio)

```bash
cd memory
# .env.local mode 600 with DATABASE_URL
npm run mcp          # Foreground stdio — Cursor / MCP client spawns this
npm run mcp:roundtrip
```

Cursor MCP config sketch (paths absolute; creds from `.env.local`, not JSON):

```json
{
  "mcpServers": {
    "memory-mcp": {
      "command": "node",
      "args": ["/ABS/PATH/grok-kit/memory/mcp/index.mjs"],
      "env": {}
    }
  }
}
```

## Notes

- Embeddings stay NULL on store (daemon embed worker fills them). Keyword recall still finds staged rows.
- Hybrid / MiniLM recall is out of C0 (A0 proved hybrid RRF on indexed corpus).
- stderr only for logs; stdout is MCP JSON-RPC.
- No SuperLearn Neon touch; no secrets in this doc.
