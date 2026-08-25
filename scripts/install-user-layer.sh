#!/usr/bin/env bash
# Install user-level agents, hooks, permissions, and slim MCP from this kit.
set -euo pipefail
KIT="$(cd "$(dirname "$0")/.." && pwd)"

mkdir -p "$HOME/.cursor/agents" "$HOME/.cursor/hooks" "$HOME/.cursor/skills" "$HOME/.cursor/rules"

# Agents (user-level copies; plugin also exposes them)
cp -f "$KIT/agents/"*.md "$HOME/.cursor/agents/"

# User-level always-on router (works even if the plugin is not loaded)
cp -f "$KIT/templates/user-layer/rules/grok-kit.mdc" "$HOME/.cursor/rules/grok-kit.mdc"

# Hooks
cp -f "$KIT/hooks/stage-memory-candidate.sh" "$HOME/.cursor/hooks/"
cp -f "$KIT/hooks/session-start-apply.sh" "$HOME/.cursor/hooks/"
chmod +x "$HOME/.cursor/hooks/stage-memory-candidate.sh" "$HOME/.cursor/hooks/session-start-apply.sh"

# Merge sessionStart + stop into existing ~/.cursor/hooks.json (do not clobber other events)
python3 - "$HOME/.cursor/hooks.json" <<'PY'
import json
import sys
from pathlib import Path

path = Path(sys.argv[1])
data = {"version": 1, "hooks": {}}
if path.exists():
    try:
        parsed = json.loads(path.read_text())
        if isinstance(parsed, dict):
            data = parsed
    except Exception:
        data = {"version": 1, "hooks": {}}
data.setdefault("version", 1)
hooks = data.setdefault("hooks", {})
if not isinstance(hooks, dict):
    hooks = {}
    data["hooks"] = hooks


def ensure(event, command, timeout):
    entries = hooks.get(event, [])
    if not isinstance(entries, list):
        entries = []
    if any(isinstance(item, dict) and item.get("command") == command for item in entries):
        hooks[event] = entries
        return
    entries.append({"command": command, "timeout": timeout})
    hooks[event] = entries


ensure("stop", "./hooks/stage-memory-candidate.sh", 15)
ensure("sessionStart", "./hooks/session-start-apply.sh", 12)
path.write_text(json.dumps(data, indent=2) + "\n")
PY

# Permissions allowlist stub
if [[ ! -f "$HOME/.cursor/permissions.json" ]]; then
  cat > "$HOME/.cursor/permissions.json" <<'EOF'
{
  "mcpAllowlist": ["icm", "icm_*"],
  "terminalAllowlist": []
}
EOF
fi

# Backup and slim MCP
MCP="$HOME/.cursor/mcp.json"
if [[ -f "$MCP" ]]; then
  cp -f "$MCP" "$HOME/.cursor/mcp.json.bak.grok-kit.$(date +%Y%m%d%H%M%S)"
fi
cp -f "$KIT/docs/mcp-snippets/user-mcp.icm-only.json" "$MCP"

# Archive previous product servers for project use
ARCHIVE="$HOME/.cursor/mcp-servers.archived.json"
if [[ ! -f "$ARCHIVE" ]]; then
  cat > "$ARCHIVE" <<'EOF'
{
  "comment": "Former user-global MCP servers — enable per-project via .cursor/mcp.json",
  "mcpServers": {}
}
EOF
fi

# Symlink kit skills into ~/.cursor/skills for discovery even without plugin load
for d in "$KIT/skills"/*; do
  [[ -d "$d" ]] || continue
  name="$(basename "$d")"
  ln -sfn "$d" "$HOME/.cursor/skills/$name"
done

# Plugin symlink
mkdir -p "$HOME/.cursor/plugins/local"
ln -sfn "$KIT" "$HOME/.cursor/plugins/local/grok-kit"
# Remove legacy plugin names if present
rm -f "$HOME/.cursor/plugins/local/agent-kit" "$HOME/.cursor/plugins/local/cursor-kit" 2>/dev/null || true

# PATH entry so skills work in any repo, not only a grok-kit checkout
chmod +x "$KIT/scripts/grok-kit.mjs"
chmod +x "$KIT/hooks/session-start-apply.sh"
mkdir -p "$HOME/.local/bin"
ln -sfn "$KIT/scripts/grok-kit.mjs" "$HOME/.local/bin/grok-kit"

echo "User layer installed."
echo "- MCP slimmed to ICM (backup saved beside mcp.json)"
echo "- Agents in ~/.cursor/agents"
echo "- User rule ~/.cursor/rules/grok-kit.mdc (auto-apply via grok-kit apply)"
echo "- Hooks: stop + sessionStart (merged into existing hooks.json)"
echo "- Skills symlinked in ~/.cursor/skills"
echo "- CLI: $HOME/.local/bin/grok-kit  (add ~/.local/bin to PATH if needed)"
echo "Reload the editor window. Install ICM next: docs/icm-setup.md"
