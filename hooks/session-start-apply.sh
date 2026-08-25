#!/usr/bin/env bash
# sessionStart: apply grok-kit when consented and .cursor/grok-kit.json is missing.
# After apply, optionally tick usage-learn (observe/propose; adapt only with --improve).
# Fail-open. Keep additional_context short. Never write project files without consent.

emit() {
  local text="$1"
  if command -v python3 >/dev/null 2>&1; then
    python3 -c 'import json,sys; print(json.dumps({"additional_context": sys.argv[1]}))' "$text"
  else
    printf '{"additional_context":""}\n'
  fi
}

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_ROOT="${CURSOR_PLUGIN_ROOT:-${GROK_PLUGIN_ROOT:-${CLAUDE_PLUGIN_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}}}"
root="${CURSOR_PROJECT_DIR:-${GROK_PROJECT_DIR:-$PWD}}"

ctx="grok-kit: no project or user-layer writes until you consent. Run: grok-kit install --i-consent (or: node ${PLUGIN_ROOT}/scripts/grok-kit.mjs install --i-consent). This repo only: grok-kit apply --root ."

apply_cmd=()
if command -v grok-kit >/dev/null 2>&1; then
  apply_cmd=(grok-kit)
elif [[ -x "${HOME}/.local/bin/grok-kit" ]]; then
  apply_cmd=("${HOME}/.local/bin/grok-kit")
elif [[ -f "$PLUGIN_ROOT/scripts/grok-kit.mjs" ]]; then
  apply_cmd=(node "$PLUGIN_ROOT/scripts/grok-kit.mjs")
fi

run_kit() {
  local seconds="$1"
  shift
  if command -v timeout >/dev/null 2>&1; then
    timeout "$seconds" "${apply_cmd[@]}" "$@" 2>/dev/null || true
  else
    "${apply_cmd[@]}" "$@" 2>/dev/null || true
  fi
}

out=""
if ((${#apply_cmd[@]})); then
  out="$(run_kit 10 apply --root "$root" --if-missing --require-git --require-consent)"
fi

if [[ -n "$out" ]] && command -v python3 >/dev/null 2>&1; then
  parsed="$(printf '%s\n' "$out" | python3 -c '
import json, sys
raw = sys.stdin.read()
try:
    data = json.loads(raw)
except Exception:
    sys.exit(0)
reason = data.get("reason") or ""
if reason == "not-a-git-repo":
    print("grok-kit: not a git workspace; skip apply.")
    raise SystemExit
if reason == "consent-required":
    print(
        "grok-kit: install consent not recorded. User-layer and per-repo apply are off. "
        "Run grok-kit install --i-consent after reading the notice. "
        "This repo only: grok-kit apply --root ."
    )
    raise SystemExit
profile = data.get("profile") or "?"
enabled = data.get("enabled") or []
skipped = data.get("skipped")
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

learn_ctx=""
if ((${#apply_cmd[@]})) && [[ -f "$root/.cursor/grok-kit.json" ]] \
  && git -C "$root" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  learn_out="$(run_kit 4 learn tick --root "$root")"
  if [[ -n "$learn_out" ]] && command -v python3 >/dev/null 2>&1; then
    learn_ctx="$(printf '%s\n' "$learn_out" | python3 -c '
import json, sys
raw = sys.stdin.read()
try:
    data = json.loads(raw)
except Exception:
    sys.exit(0)
if data.get("reason") == "consent-required":
    sys.exit(0)
top = data.get("topSkills") or []
applied = data.get("applied") or []
proposed = data.get("proposed") or 0
if not top and not applied and not proposed:
    sys.exit(0)
parts = ["usage-learn"]
bits = ",".join(str(x) for x in top[:4])
if bits:
    parts.append(f"top={bits}.")
if applied:
    parts.append("adapted=" + ",".join(str(x) for x in applied[:3]) + ".")
elif data.get("hint"):
    parts.append(str(data.get("hint")))
print(" ".join(parts))
' 2>/dev/null || true)"
  fi
fi

if [[ -n "$learn_ctx" ]]; then
  ctx="${ctx} ${learn_ctx}"
fi

flag_ctx=""
if ((${#apply_cmd[@]})) && [[ -f "$root/.cursor/grok-kit.json" ]] \
  && git -C "$root" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  flag_out="$(run_kit 4 flagship --root "$root" --when start --short)"
  if [[ -n "$flag_out" ]] && command -v python3 >/dev/null 2>&1; then
    flag_ctx="$(printf '%s\n' "$flag_out" | python3 -c '
import json, sys
raw = sys.stdin.read()
try:
    data = json.loads(raw)
except Exception:
    sys.exit(0)
line = data.get("line") or ""
if line:
    print(line)
' 2>/dev/null || true)"
  fi
fi

if [[ -n "$flag_ctx" ]]; then
  ctx="${ctx} ${flag_ctx}"
fi

emit "$ctx"
exit 0
