# ICM setup (shared memory store)

ICM is the shared local SQLite memory store. Keep a small hot pin (MEMORY/USER-style files) in your agent home; ICM holds the long tail.

## Install

Prefer the release binary (cargo package name may not resolve):

```bash
# Apple Silicon example (see GitHub releases for latest tag)
curl -fsSL -o /tmp/icm.tgz \
  https://github.com/rtk-ai/icm/releases/download/icm-v0.10.61/icm-aarch64-apple-darwin.tar.gz
tar -xzf /tmp/icm.tgz -C /tmp
mkdir -p "$HOME/.local/bin"
cp /tmp/icm "$HOME/.local/bin/icm"
chmod +x "$HOME/.local/bin/icm"
export PATH="$HOME/.local/bin:$PATH"
icm --version
```

## Configure the IDE agent host

```bash
icm init --mode mcp
icm init --mode skill   # optional thin ~/.cursor/rules/icm.mdc
```

Ensure user `~/.cursor/mcp.json` includes (compact mode):

```json
"icm": {
  "command": "icm",
  "args": ["serve", "--compact"]
}
```

Product MCPs (database, browser, payments, deploy) belong in **project** `.cursor/mcp.json`, not user globals.

## Hot pin vs long-tail

Built-in hot MEMORY.md / USER.md stay the short pin. Prefer write-approval on any hot-memory tool. The IDE agent host and other agents should call the same ICM store for long-tail:

```bash
icm store --no-embeddings -t project-<slug> -c "..."
icm recall --no-embeddings "query"
```

Optional: wire at most **one** external memory provider to the same DB. Do **not** dual-write the hot MEMORY.md from multiple agent homes.

## Seed

```bash
export HOT_MEMORY_FILE="$HOME/path/to/MEMORY.md"
export HOT_USER_FILE="$HOME/path/to/USER.md"
./scripts/seed-icm-from-memory.sh
```

Or invoke the `memory-sync` skill in the IDE.

## Topics

- `preferences`
- `workspace-routing`
- `project-<slug>`
- `models`
- `decisions-<slug>`
- `errors-resolved-<slug>`
- `handoff-<slug>`
