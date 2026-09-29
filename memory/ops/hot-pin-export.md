# Ops: hot-pin export

Canonical tool docs: [`../export/README.md`](../export/README.md).

```bash
cd memory
DATABASE_URL=… npm run export:hot-pin -- --out-dir ./export/out --topics
npm run export:smoke          # stub
npm run export:smoke -- --live  # Neon main read-only
```

Neon branch authority: **main** `br-wandering-queen-b8sx7y0a` only for live ops.
