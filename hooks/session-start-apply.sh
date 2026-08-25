#!/usr/bin/env bash
# sessionStart: apply grok-kit when .cursor/grok-kit.json is missing.
# Fail-open. Keep additional_context short.

emit() {
  local text="$1"
  if command -v python3 >/dev/null 2>&1; then
    python3 -c 'import json,sys; print(json.dumps({"additional_context": sys.argv[1]}))' "$text"
  else
    printf '{"additional_context":""}\n'
  fi
}

ctx="grok-kit: if this is a git repo without .cursor/grok-kit.json, run grok-kit apply --root ."

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_ROOT="${CURSOR_PLUGIN_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"
root="${CURSOR_PROJECT_DIR:-$PWD}"

apply_cmd=()
if command -v grok-kit >/dev/null 2>&1; then
  apply_cmd=(grok-kit)
elif [[ -x "${HOME}/.local/bin/grok-kit" ]]; then
  apply_cmd=("${HOME}/.local/bin/grok-kit")
elif [[ -f "$PLUGIN_ROOT/scripts/grok-kit.mjs" ]]; then
  apply_cmd=(node "$PLUGIN_ROOT/scripts/grok-kit.mjs")
fi

out=""
if ((${#apply_cmd[@]})); then
  args=(apply --root "$root" --if-missing --require-git)
  if command -v timeout >/dev/null 2>&1; then
    out="$(timeout 10 "${apply_cmd[@]}" "${args[@]}" 2>/dev/null || true)"
  else
    out="$("${apply_cmd[@]}" "${args[@]}" 2>/dev/null || true)"
  fi
fi

if [[ -n "$out" ]] && command -v python3 >/dev/null 2>&1; then
  parsed="$(printf '%s\n' "$out" | python3 -c '
import json, sys
raw = sys.stdin.read()
try:
    data = json.loads(raw)
except Exception:
    sys.exit(0)
profile = data.get("profile") or "?"
enabled = data.get("enabled") or []
skipped = data.get("skipped")
reason = data.get("reason") or ""
if reason == "not-a-git-repo":
    print("grok-kit: not a git workspace; skip apply.")
    raise SystemExit
bits = ",".join(str(x) for x in enabled[:12])
prefix = "already adapted" if skipped else "applied"
extra = " UI prove: tell_proof_verify." if "tell-proof" in enabled else ""
print(
    f"grok-kit {prefix} profile={profile} enabled={bits}."
    " Follow .cursor/grok-kit.json and .cursor/rules/grok-kit-project.mdc."
    f"{extra}"
)
' 2>/dev/null || true)"
  if [[ -n "$parsed" ]]; then
    ctx="$parsed"
  fi
fi

emit "$ctx"
exit 0
