# B0 RESULTS — Daemon wake spike

**When:** 2026-09-28 ~20:20 IST (Asia/Calcutta)  
**Neon:** `bimlabz-bot-memory` / branch `p0-spike` (legacy schema at run time)  
**Gate:** webhook → first Neon row **< 2 s**

## Verdict: **PASS** ✅

Cold Neon resume → first row **862 ms** (warm **78 ms**); real **pg-boss** on same DB; drain-one-job then sleep.

> **Production vs spike:** production wake = `tailscale serve --bg` HTTPS on the tailnet. **This spike is localhost only** — Tailscale serve = P1. No funnel/public.

### What it does

`memory/daemon/index.mjs` listens on `127.0.0.1:$PORT` (default **8787**). **No DB connections while sleeping.**

On `POST /wake` with `Authorization: Bearer $WAKE_TOKEN`:

1. Connect pg-boss (migrate if needed) → ensure `memory-embed` queue  
2. `fetch` one job (or `SELECT 1 FROM memories` fallback)  
3. `complete` job → `stop` → close → sleep  

Also: `GET /health`, `GET /log`. Optional `SELF_WAKE_MS` timer POSTs `/wake` once (timer self-wake proof).

**v1 adaptation:** daemon now queries `id = $1` (TEXT), not `$1::uuid`.

### Timings (webhook → first Neon row)

| Run | Neon state | cold_start_ms | client_wall_ms | Job drained | Pass (<2000) |
|-----|------------|--------------:|---------------:|-------------|----------------|
| warm | active | **77.72** | 139 | yes (`fetch`) | ✅ |
| **cold** | **suspended → resume** | **862.33** | 939 | yes (`fetch`) | ✅ |
| self-wake timer | warm (post-cold) | 70.17 | — | yes | ✅ |

Cold phases: boss_start 672 ms · queue_ready 92 ms · first_neon_touch **862 ms** · drain_total 899 ms.

Artifacts: `out/b0-timing-{warm,cold,selfwake}.json`

### How to run

```bash
cd memory
# .env.local: DATABASE_URL + WAKE_TOKEN (mode 600; gitignored)

# Terminal A
SELF_WAKE_MS=0 npm run daemon

# Terminal B
npm run daemon:enqueue
npm run b0:bench -- warm

# True cold: suspend Neon compute, then:
npm run b0:bench -- cold
```

Health: `curl -s http://127.0.0.1:8787/health`

### Notes

- Real **pg-boss@12** on the same Neon DB (`pgboss` schema migrated on first start). Queue: `memory-embed`.
- Pooler URL; fetch/complete path (no LISTEN while asleep).
- Secrets only in `.env.local` — never committed.
- B0.1–B0.4 checked as **localhost stand-in**; Tailscale serve remains P1.
