# Thin inter-bot bus (P3.B1–B4)

A2A **vocabulary** only — not a full A2A wire protocol or multi-vendor stack.

| Type | Role |
|------|------|
| `presence.heartbeat` | Bot/daemon beat + peer online check (`daemon_presence`) |
| `message.send` | Contracted handoff: `from` / `to` / `ask` / `evidence` / `memory_refs` — **fail closed** if evidence empty |
| `task.request` | Create task (`submitted`) |
| `task.update` | Lifecycle: `submitted → working → input-required \| completed \| failed \| canceled` |
| `task.cancel` | Cancel non-terminal task |
| `wake.request` | Authenticated `POST /wake` + `WAKE_TOKEN` (X2 launchd / localhost) |

MCP stays for memory/tools. This bus is **horizontal bot↔bot** only.

## Usage

```js
import { accept } from './bus/index.mjs';

await accept(pool, {
  type: 'presence.heartbeat',
  node: 'grok-coder-01',
  version: 'p3-bus',
});

await accept(pool, {
  type: 'message.send',
  from: 'grok-coder-01',
  to: 'verifier-01',
  ask: 'review patch',
  memory_refs: ['mem_abc'],
  evidence: [{ kind: 'cite', id: 'mem_abc' }],
});

await accept(null, { type: 'wake.request', source: 'bot-nudge' }, {
  wake: { url: 'http://127.0.0.1:8787/wake', token: process.env.WAKE_TOKEN },
});
```

## Schema

Migration `schema/migrations/005-inter-bot-bus.sql` → Neon **main** only
(`br-wandering-queen-b8sx7y0a`): `daemon_presence`, `bus_messages`, `bus_tasks`.
Presence shape aligns with PR #21 (reuse; do not duplicate sync_state here).

## Smoke

```bash
npm run bus:smoke          # in-memory stub, no Neon
npm run bus:smoke -- --live  # needs DATABASE_URL → Neon main
```
