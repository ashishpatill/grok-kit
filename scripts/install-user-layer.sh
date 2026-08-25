#!/usr/bin/env bash
# Install user-level agents, hooks, permissions, and slim MCP from this kit.
# Refuses to mutate ~/.cursor unless the user consents (--i-consent or "I CONSENT").
set -euo pipefail
KIT="$(cd "$(dirname "$0")/.." && pwd)"

CONSENT=false
SKIP_MCP=false
APPLY_CWD=true
DRY_RUN=false
HELP=false
LEARN=false
IMPROVE=false

usage() {
  cat <<'EOF'
install-user-layer — copy grok-kit onto this machine (explicit consent required)

Usage:
  grok-kit install --i-consent [--skip-mcp-slim] [--no-apply-cwd] [--learn] [--improve] [--dry-run]
  ./scripts/install-user-layer.sh --i-consent

Without --i-consent, prints the consent notice and exits 78 (no files written).
On a TTY you may type I CONSENT instead of passing the flag.

  --i-consent       explicit consent for user layer + per-repo apply + MCP slim
  --learn           also record local skill/workflow usage and write proposals
  --improve         adapt grok-kit.json from usage (implies --learn); never User Rules
  --skip-mcp-slim   keep current ~/.cursor/mcp.json (still backs up nothing)
  --no-apply-cwd    do not grok-kit apply the current directory
  --dry-run         print the notice and planned actions; write nothing
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help)
      HELP=true
      shift
      ;;
    --i-consent|--consent)
      CONSENT=true
      shift
      ;;
    --skip-mcp-slim)
      SKIP_MCP=true
      shift
      ;;
    --no-apply-cwd)
      APPLY_CWD=false
      shift
      ;;
    --learn)
      LEARN=true
      shift
      ;;
    --improve)
      IMPROVE=true
      LEARN=true
      shift
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    *)
      echo "unknown argument: $1" >&2
      usage >&2
      exit 64
      ;;
  esac
done

if [[ "$HELP" == true ]]; then
  usage
  exit 0
fi

node "$KIT/scripts/consent.mjs" notice

if [[ "$DRY_RUN" == true ]]; then
  echo "dry-run: would install user layer; project-apply=$([[ "$APPLY_CWD" == true ]] && echo on || echo cwd-skipped); mcp-slim=$([[ "$SKIP_MCP" == true ]] && echo skip || echo on); learn=$([[ "$LEARN" == true ]] && echo on || echo off); improve=$([[ "$IMPROVE" == true ]] && echo on || echo off)"
  echo "dry-run: no files written (pass --i-consent without --dry-run to apply)"
  exit 0
fi

if [[ "$CONSENT" != true ]]; then
  if [[ -t 0 ]]; then
    printf 'Type I CONSENT to continue: '
    read -r reply
    reply="$(printf '%s' "$reply" | tr '[:upper:]' '[:lower:]' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
    if [[ "$reply" != "i consent" ]]; then
      echo "Refusing: no consent. Re-run with --i-consent." >&2
      exit 78
    fi
  else
    echo "Refusing: no consent. Re-run with --i-consent after reading the notice." >&2
    exit 78
  fi
fi

SCOPES="user-layer,project-apply"
if [[ "$SKIP_MCP" != true ]]; then
  SCOPES="${SCOPES},mcp-slim"
fi
if [[ "$LEARN" == true ]]; then
  SCOPES="${SCOPES},usage-learn"
fi
if [[ "$IMPROVE" == true ]]; then
  SCOPES="${SCOPES},harness-improve"
fi
node "$KIT/scripts/consent.mjs" write --scopes "$SCOPES" --source "install --i-consent"

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
ensure("sessionStart", "./hooks/session-start-apply.sh", 18)
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

if [[ "$SKIP_MCP" != true ]]; then
  MCP="$HOME/.cursor/mcp.json"
  if [[ -f "$MCP" ]]; then
    cp -f "$MCP" "$HOME/.cursor/mcp.json.bak.grok-kit.$(date +%Y%m%d%H%M%S)"
  fi
  cp -f "$KIT/docs/mcp-snippets/user-mcp.icm-only.json" "$MCP"

  ARCHIVE="$HOME/.cursor/mcp-servers.archived.json"
  if [[ ! -f "$ARCHIVE" ]]; then
    cat > "$ARCHIVE" <<'EOF'
{
  "comment": "Former user-global MCP servers — enable per-project via .cursor/mcp.json",
  "mcpServers": {}
}
EOF
  fi
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

if [[ "$APPLY_CWD" == true ]]; then
  APPLY_ROOT="${GROK_KIT_APPLY_ROOT:-$PWD}"
  node "$KIT/scripts/grok-kit.mjs" apply --root "$APPLY_ROOT" --if-missing --require-git --require-consent >/dev/null || true
fi

echo "User layer installed (consent recorded in ~/.cursor/grok-kit-consent.json)."
if [[ "$SKIP_MCP" == true ]]; then
  echo "- MCP slim skipped (--skip-mcp-slim)"
else
  echo "- MCP slimmed to ICM (backup saved beside mcp.json)"
fi
echo "- Agents in ~/.cursor/agents"
echo "- User rule ~/.cursor/rules/grok-kit.mdc (per-repo apply on sessionStart, because you consented)"
echo "- Hooks: stop + sessionStart (merged into existing hooks.json)"
echo "- Skills symlinked in ~/.cursor/skills"
echo "- CLI: $HOME/.local/bin/grok-kit  (add ~/.local/bin to PATH if needed)"
if [[ "$LEARN" == true ]]; then
  echo "- Usage learn on (local log ~/.cursor/grok-kit-usage.jsonl)"
fi
if [[ "$IMPROVE" == true ]]; then
  echo "- Harness improve on (sessionStart may adapt grok-kit.json; never User Rules)"
fi
echo "Reload the editor window. Install ICM next: docs/icm-setup.md"
echo "Revoke: grok-kit consent revoke"
