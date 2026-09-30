# Moose MCP onboarding (P1.X6 / P2.C1) — **RETIRED (stand-in is the contract proof)**

**Status (2026-09-30 IST):** **Closed-with-stand-in-documented.** No real Moose
product or MCP endpoint exists to onboard. Do **not** invent one.

## What “Moose” meant

In plan docs (`FINAL-PLAN-V2`, `PLAN-bot-memory-graph-v2`), **Moose** named a
**planned peer bot** that would share one memory over MCP — not an external
product Ashish already owns.

## Search evidence (2026-09-30) — exit B

| Location | Result |
|----------|--------|
| This tree (`moose-standin.mjs`, G3/G4 smokes) | **Stand-in only** |
| Cursor `~/.cursor/mcp.json` | Servers: `icm`, `tell`, `dodopayments`, `Neon` — **no Moose** |
| Workspace `/path/to/workspace/*` | **No** Moose app/repo |
| Local `bot-memory` agents | Slugs: ceo, harness-engineer, … — **no `moose`** |
| GitHub `ashishpatill` repos/code search for moose | **Empty** |
| Secrets / env / `docs/mcp-snippets/` | **No** Moose URL or stdio command |

## Contract proof that already shipped (keep)

`MooseStandIn` (`moose-standin.mjs`) exercises the **same bot-facing MemoryPort
surface** any future peer would use:

| Method | Maps to MCP tool | Notes |
|--------|------------------|-------|
| `dropFile` | `ingest_file` | author stamped `moose-standin` |
| `proposeLearning` | `propose` | write gates apply (never silent identity) |
| `recall` | `recall` | hybrid RRF |
| `store` | `store` | tests only — real peers should prefer `propose` |

Smokes: `npm run nodes:smoke`, `npm run demo:stuck-debug` (ITER-004). That is
the cross-bot contract proof. It is **not** production peer onboarding.

## Closure (TASKS)

- **P1.X6** — RETIRED / closed-with-stand-in-documented. Removed from P1 exit
  blockers and Ashish-facing gate lists.
- **P2.C1** — RETIRED / deferred until a **real** third-party (or peer) MCP
  exists. Re-open only with a real server URL/stdio Ashish owns + round-trip
  transcript; never invent a fake Moose product.

## Do not

- Invent a Moose MCP server, snippet, or product to “close” these boxes.
- Treat `moose-standin` Neon rows as production peer onboarding.
- Block P2/P3 work on X6/C1.
