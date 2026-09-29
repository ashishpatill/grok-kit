# Moose MCP onboarding (P1.X6) — stand-in until real MCP

**Status (2026-09-30):** **Unchecked.** No real Moose MCP endpoint is configured
in this workspace. G3 ships `moose-standin.mjs` only.

## What the stand-in covers

`MooseStandIn` exercises the **same bot-facing MemoryPort surface** the real
Moose node will use once onboarded:

| Method | Maps to MCP tool | Notes |
|--------|------------------|-------|
| `dropFile` | `ingest_file` | author stamped `moose-standin` |
| `proposeLearning` | `propose` | write gates apply (never silent identity) |
| `recall` | `recall` | hybrid RRF |
| `store` | `store` | tests only — production Moose should prefer `propose` |

Smokes: `npm run nodes:smoke`, `npm run demo:stuck-debug` (see ITER-004).

## What is still needed for X6 (real)

1. A real Moose MCP server URL / stdio command Ashish owns (not invented here).
2. Cursor MCP snippet under `docs/mcp-snippets/` pointing at that server.
3. Round-trip transcript: Moose proposes a learning → curator promotes → another
   node recalls it (replace stand-in identity with real `bot:moose` author).
4. Check **P1.X6** only after that transcript is recorded.

## Do not

- Claim Tailscale / cross-host Moose routing before X1.
- Treat `moose-standin` author rows on Neon as production Moose onboarding.
