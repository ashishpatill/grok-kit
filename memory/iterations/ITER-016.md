# ITER-016 — P1.X1 Tailscale serve wake

**When:** 2026-09-30 IST · base after `#28` (ExpeL/mirror).  
**Host:** Mac daemon (`100.64.0.1`, MagicDNS `mac-mini.<tailnet>.ts.net`; status nickname `ashish`).

## Done
- Documented CLI path `/Applications/Tailscale.app/Contents/MacOS/Tailscale` + exec wrappers (symlink breaks bundle id).
- `tailscale serve --bg --https=443` → `http://127.0.0.1:8789` (PORT from `.env.local`).
- Smoke: `POST https://mac-mini.<tailnet>.ts.net/wake` + Bearer `WAKE_TOKEN` → 200 / ok / drained (Neon **main**).
- Artifact: `daemon/launchd/out/x1-tailscale-serve-wake.json`. Helper: `daemon/scripts/tailscale-serve-wake.sh`.
- INSTALL.md §6. TASKS X1 checked.

## Not claimed
X6 / A0.4 / G.2. No funnel/public expose.
