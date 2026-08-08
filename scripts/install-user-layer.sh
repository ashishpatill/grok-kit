#!/usr/bin/env bash
# Install user-level agents, hooks, permissions, and slim MCP from this kit.
set -euo pipefail
KIT="$(cd "$(dirname "$0")/.." && pwd)"

mkdir -p "$HOME/.cursor/agents" "$HOME/.cursor/hooks" "$HOME/.cursor/skills"

# Agents (user-level copies; plugin also exposes them)
cp -f "$KIT/agents/"*.md "$HOME/.cursor/agents/"

# Hooks
cp -f "$KIT/hooks/stage-memory-candidate.sh" "$HOME/.cursor/hooks/"
chmod +x "$HOME/.cursor/hooks/stage-memory-candidate.sh"
cat > "$HOME/.cursor/hooks.json" <<'EOF'
{
  "version": 1,
  "hooks": {
    "stop": [
      {
        "command": "./hooks/stage-memory-candidate.sh",
        "timeout": 15
      }
    ]
  }
}
EOF

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
  cp -f "$MCP" "$HOME/.cursor/mcp.json.bak.agent-kit.$(date +%Y%m%d%H%M%S)"
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
ln -sfn "$KIT" "$HOME/.cursor/plugins/local/agent-kit"

echo "User layer installed."
echo "- MCP slimmed to ICM (backup saved beside mcp.json)"
echo "- Agents in ~/.cursor/agents"
echo "- Skills symlinked in ~/.cursor/skills"
echo "- hooks.json installed"
echo "Reload the editor window. Install ICM next: docs/icm-setup.md"
