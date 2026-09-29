# Graph orchestrator (P1.G1)

Minimal TypeScript scaffold per `FINAL-PLAN-V2.md` §11:

- **blackboard** — shared board slots on Neon (`run_id` + `key`)
- **outbox** — event bus (`pending` → `claimed` → `done`/`dead`)
- **Orchestrator** — node registry, `emit` / `dispatchOnce`, pause/resume

```bash
npm run graph:smoke
# optional live (needs DATABASE_URL to p1-v1):
DATABASE_URL=… npm run graph:smoke -- --live
```

Schema: `memory/schema/migrations/004-blackboard-outbox.sql` (applied on Neon **p1-v1**).

G2+: curator client as `svc:curator` calling memory MCP.
