# Mac launchd install — bot-memory daemon (P1.X2)

**Host:** Ashish's Mac (`Ashish`, arm64).  
**Checkout:** `/Volumes/Developer/Workspace/grok-kit`  
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
cd /Volumes/Developer/Workspace/grok-kit/memory
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
mkdir -p /Volumes/Developer/Workspace/grok-kit/memory/ops/backups
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
