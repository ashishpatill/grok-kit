# memory/

GrokKit's shared bot memory + graph-of-agents build. Replaces the GitHub-repo
markdown/YAML bot memory with a private database-backed system all of Ashish's
bots share.

- **Plan:** `memory/plan/FINAL-PLAN-V2.md` (v2.1, 2026-09-28) — phases, IDL, governance.
- **Work queue:** `memory/TASKS.md` — the loop's only work queue, one subtask per commit.
- **Loop prompt:** `memory/LOOP-PROMPT.md` — paste into OpenCode Desktop (Muse Spark 1.3) to run the build loop.
- **Schema:** `memory/schema/` — Neon-ready SQL derived from the IDL.
- **Spikes:** `memory/spikes/` — P0 experiment code + results.

Stack: Neon Postgres + pgvector (primary) · event-triggered daemon + pg-boss workers ·
MCP (`memory-mcp`) for bot access · Tailscale mesh · local replica (ICM candidate).

Status: P0 spikes complete (STAY). IDL v2.1 **FROZEN** — signed by Ashish 2026-09-28.
P1 prototypes underway per `memory/TASKS.md`.
