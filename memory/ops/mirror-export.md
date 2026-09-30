# Ops: mirror_export (craft-log dry-run)

Canonical tool: [`../export/mirror.mjs`](../export/mirror.mjs) + CLI
[`../export/mirror-cli.mjs`](../export/mirror-cli.mjs).

Dumps Neon live memories into private **bot-memory** craft shape
(`happened` / `wrong` / `worked` / `next`) as YAML + JSONL.

## Safety

- **Dry-run default** — writes local files only.
- **`--push` refused** — no auto-commit / no push of secrets to GitHub.
- Secret-looking rows (`DATABASE_URL`, `WAKE_TOKEN`, `postgres://`, API keys,
  private keys) are **skipped**, never exported.
- Corrections still go through `propose()` / `supersede()` into Neon (one write
  path). Craft log is the audit **view**, not a second store.

```bash
cd memory
npm run mirror:smoke
npm run export:mirror -- --fixture export/fixtures/craft-sample.json --out-dir /tmp/mirror
# optional read-only Neon main:
# NODE_OPTIONS=--no-network-family-autoselection npm run mirror:smoke -- --live
```

Neon branch authority: **main** `br-wandering-queen-b8sx7y0a` only for live ops.
Do not commit `export/out/` with live content.
