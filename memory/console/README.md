# Bot memory console

Local human surface for single-daemon bot memory:

- **Review queue** — promote / reject human-gated proposes
- **Visible recall** — ids, provenance, removal path notes
- **Propose** — same write gates as `memory-mcp`
- **Hot-pin preview** — export-only MEMORY / TOPICS from pinned rows

## Run (synthetic demo)

```bash
cd memory
npm run console
# → http://127.0.0.1:7432
```

Uses `console/fixtures/demo-seed.json` (OSS-safe synthetic facts). No Neon.
No production memory text.

## Honesty

This is not a metrics dashboard. Every action maps to real IDL paths
(`propose` / `review_list` / `promote` / `reject` / `recall` / hot-pin export).
