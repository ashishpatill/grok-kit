# Mac launchd install — bot-memory daemon (P1.X2)

**Host:** Ashish's Mac (`Ashish`, arm64).  
**Checkout:** `/path/to/grok-kit`  
**Store:** Neon `bimlabz-bot-memory` branch **`main` only** (`br-wandering-queen-b8sx7y0a`).  
**Not X1:** Tailscale was not on PATH here — do **not** claim `tailscale serve`. Wake is localhost until Tailscale is installed.

## 1. Secrets (gitignored)

```bash
cp memory/.env.example memory/.env.local
# edit:
#   DATABASE_URL=<Neon main pooler URL>
#   WAKE_TOKEN=<long random>
#   PORT=8787
```

Never commit `.env.local`. On Mac Node → Neon, prefer:

```bash
export NODE_OPTIONS=--no-network-family-autoselection
```

(IPv6 Happy-Eyeballs can ETIMEDOUT; see PR #18 / X4 RESULTS.)

## 2. One-shot smoke (no launchd yet)

```bash
cd /path/to/grok-kit/memory
NODE_OPTIONS=--no-network-family-autoselection node daemon/index.mjs &
# other terminal:
curl -sf -X POST http://127.0.0.1:8787/wake \
  -H "Authorization: Bearer $WAKE_TOKEN" \
  -H 'content-type: application/json' \
  -d '{"source":"manual-smoke"}'
# expect JSON with ok/reconcile/drained fields; process stays up (KeepAlive path)
```

Or: `node memory/daemon/launchd/smoke-wake.mjs` (scripted).

## 3. Install LaunchAgents

Plists in this dir already point at the checkout paths above. Adjust `node` path if nvm moves.

```bash
mkdir -p ~/Library/LaunchAgents
mkdir -p /path/to/grok-kit/memory/ops/backups
cp memory/daemon/launchd/ai.botmemory.daemon.plist \
   ~/Library/LaunchAgents/
cp memory/daemon/launchd/ai.botmemory.daemon.wake.plist \
   ~/Library/LaunchAgents/
launchctl unload ~/Library/LaunchAgents/ai.botmemory.daemon.plist 2>/dev/null || true
launchctl unload ~/Library/LaunchAgents/ai.botmemory.daemon.wake.plist 2>/dev/null || true
launchctl load ~/Library/LaunchAgents/ai.botmemory.daemon.plist
launchctl load ~/Library/LaunchAgents/ai.botmemory.daemon.wake.plist
launchctl list | grep botmemory
```

## 4. Uninstall

```bash
launchctl unload ~/Library/LaunchAgents/ai.botmemory.daemon.wake.plist
launchctl unload ~/Library/LaunchAgents/ai.botmemory.daemon.plist
rm -f ~/Library/LaunchAgents/ai.botmemory.daemon*.plist
```

## Linux note

`memory/daemon/systemd/` units remain for a future Linux host. This Mac uses **launchd only**.

## Cross-bot nudge (P3.B4 `wake.request`)

Any bot (or graph node) can nudge this daemon awake without speaking MCP:

```js
import { accept } from '../../bus/index.mjs';
await accept(null, { type: 'wake.request', source: 'bot-nudge', from: 'grok-coder-01' }, {
  wake: { url: 'http://127.0.0.1:8787/wake', token: process.env.WAKE_TOKEN },
});
```

Same contract as launchd `wake.sh`: `Authorization: Bearer $WAKE_TOKEN` → `POST /wake`.
Still localhost until X1 Tailscale serve lands — do not claim public/tailnet wake here.


## 5. Nightly consolidation (P3.C1)

Mem0-style ADD / UPDATE / DELETE / NOOP apply + light episodic decay. Runs **directly**
against Neon **main** (`br-wandering-queen-b8sx7y0a`) via `workers/run-consolidate.mjs` —
does **not** need the wake daemon, and does **not** claim Tailscale.

### One-shot (no launchd)

```bash
cd /path/to/grok-kit/memory
NODE_OPTIONS=--no-network-family-autoselection node workers/run-consolidate.mjs --limit=50
# dry-run (classify only, no writes):
NODE_OPTIONS=--no-network-family-autoselection node workers/run-consolidate.mjs --dry-run
```

Optional in `.env.local`: `CONSOLIDATE_NAMESPACE=project-…`, `CONSOLIDATE_LIMIT=50`.

### Install calendar timer (02:00 local)

```bash
cp memory/daemon/launchd/ai.botmemory.consolidate.plist ~/Library/LaunchAgents/
launchctl unload ~/Library/LaunchAgents/ai.botmemory.consolidate.plist 2>/dev/null || true
launchctl load ~/Library/LaunchAgents/ai.botmemory.consolidate.plist
launchctl list | grep botmemory
```

Logs: `memory/ops/backups/consolidate.log` (+ `.err`). Unload with the same
`launchctl unload` pattern as the wake agent.

### What it does (honest)

| Op | Effect |
|----|--------|
| DELETE | `approval=retired`, close `valid_to` (TTL / expired window) |
| UPDATE | near-dup (sim≥0.92) → merge into survivor; loser `merged_into` + `valid_to` |
| ADD / NOOP | no write |
| decay | episodic strength ×0.95 if not recalled in 30d (best-effort) |

Pinned rows are never auto-merged or retired. No ExpeL / reflective / Voyager loop yet.
