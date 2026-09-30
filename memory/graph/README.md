# Graph orchestrator (P1.G1–G4)

Minimal TypeScript scaffold per `FINAL-PLAN-V2.md` §11:

- **blackboard** — shared board slots on Neon (`run_id` + `key`)
- **outbox** — event bus (`pending` → `claimed` → `done`/`dead`)
- **Orchestrator** — node registry, `emit` / `dispatchOnce` / `drain`, pause/resume, optional node handlers
- **CuratorClient** — memory MCP / MemoryPort as `svc:curator` (promote / reject / review_decide)
- **Nodes** — `grok-coder-01`, `verifier-01`, `curator-01` + scripted **Moose stand-in**
- **Demo** — stuck-debug round-trip artifact under `graph/demo/`

```bash
npm run graph:smoke          # G1 stub
npm run curator:smoke        # G2 stub
npm run nodes:smoke          # G3 stub
npm run demo:stuck-debug     # G4 recorded demo
# optional live (needs DATABASE_URL to p1-v1):
DATABASE_URL=… npm run graph:smoke -- --live
```

Schema: `memory/schema/migrations/004-blackboard-outbox.sql` (applied on Neon **p1-v1**).
MCP curator tools: `review_list`, `promote`, `reject_proposal`, `review_decide` (default `decided_by=svc:curator`).

See also: [MOOSE-ONBOARDING.md](./MOOSE-ONBOARDING.md) (P1.X6 / P2.C1 — **retired**; stand-in is the contract proof; no real Moose MCP invented).
