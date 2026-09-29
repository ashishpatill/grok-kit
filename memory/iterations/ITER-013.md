# Iteration 013 — Hot-pin export + visible recall (P3.H1 / P3.V1)

**When:** 2026-09-30 IST · base `2550ced` (main).  
**Neon:** `bimlabz-bot-memory` **`main` only** (`br-wandering-queen-b8sx7y0a`).

## Goal

Ship next unblocked product slices from Muse/Grok/Cursor research:

1. **Hot-pin export** — Neon pinned/identity → human-editable `MEMORY.md` (+ topic index).
2. **Visible recall** — recall envelopes cite id + provenance + removal path (Referenced-Chats style).

## Done

| Item | Change |
|------|--------|
| P3.H1 | `export/hot-pin.mjs`, `export/index.mjs`, fixture, `npm run export:smoke` |
| Docs | `export/README.md`, `ops/hot-pin-export.md` (inject-index + caps + no dual-write) |
| P3.V1 | `lib/visible-recall.mjs`; MCP + CLI/pg/stub recall SELECT + envelope |
| Smoke | `cli:smoke`, `visible-recall:smoke`, `export:smoke` |

## Evidence

```bash
cd memory
npm run visible-recall:smoke
npm run cli:smoke
npm run export:smoke
# optional live (read-only):
# NODE_OPTIONS=--no-network-family-autoselection npm run export:smoke -- --live
```

## Not claimed

X1 Tailscale serve · X6 Moose real · A0.4 embedding A/B · ExpeL / reflective deepen · poisoning red-team · mirror_export to private bot-memory repo.
