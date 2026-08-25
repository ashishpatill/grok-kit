#!/usr/bin/env bash
# Offline user journey: bootstrap a repo, prove ACI, score a rubric, classify PRs, install user layer.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/grok-kit-e2e.XXXXXX")"
cleanup() { rm -rf "$TMP"; }
trap cleanup EXIT

fail() { echo "e2e FAIL: $*" >&2; exit 1; }
pass() { echo "e2e ok: $*"; }

WATCH="$ROOT/skills/watch-ci/scripts/watch-ci.mjs"
VERIFY="$ROOT/skills/verify-aci/scripts/verify-aci.mjs"
RUBRIC="$ROOT/skills/rubric-verify/scripts/rubric-verify.mjs"
STATE="$ROOT/skills/orchestrate-rlm/scripts/state-tools.mjs"

echo "== CLI --help =="
node "$WATCH" --help | grep -q status-once || fail "watch-ci help"
node "$VERIFY" --help | grep -q doctor || fail "verify-aci help"
node "$RUBRIC" --help | grep -q judgment || fail "rubric-verify help"
node "$STATE" --help | grep -q render-spawn || fail "state-tools help"
pass "help text"

echo "== watch-ci fixtures (merge-state, not green lists) =="
set +e
node "$WATCH" --fixture "$ROOT/skills/watch-ci/fixtures/ready.json" >"$TMP/ready.json"
ready_ec=$?
node "$WATCH" --fixture "$ROOT/skills/watch-ci/fixtures/conflicts.json" >"$TMP/conflicts.json"
c=$?
node "$WATCH" --fixture "$ROOT/skills/watch-ci/fixtures/green-but-rejected.json" >"$TMP/rejected.json"
r=$?
node "$WATCH" --fixture "$ROOT/skills/watch-ci/fixtures/approval-wait.json" >"$TMP/approval.json"
a=$?
node "$WATCH" --fixture "$ROOT/skills/watch-ci/fixtures/pending.json" >"$TMP/pending.json"
p=$?
set -e
[[ $ready_ec -eq 0 ]] || fail "ready exit $ready_ec"
[[ $c -eq 2 ]] || fail "conflicts exit $c"
[[ $r -eq 4 ]] || fail "github-rejected exit $r"
[[ $a -eq 0 ]] || fail "approval exit $a (must not look like CI fail)"
[[ $p -eq 8 ]] || fail "pending exit $p"
python3 - <<PY
import json
from pathlib import Path
tmp = Path("$TMP")
ready = json.loads((tmp / "ready.json").read_text())
rejected = json.loads((tmp / "rejected.json").read_text())
approval = json.loads((tmp / "approval.json").read_text())
assert ready["kind"] == "ready" and ready["exitCode"] == 0, ready
assert rejected["class"] == "github-rejected", rejected
assert approval["class"] == "approval" and approval["actor"] == "human", approval
print("fixture classes ok")
PY
pass "watch-ci fixtures"

echo "== kit dogfood doctor/launch (not drive — would recurse kit-check) =="
node "$VERIFY" --root "$ROOT" --phase doctor >/dev/null
node "$VERIFY" --root "$ROOT" --phase launch >/dev/null
pass "kit doctor + launch"

echo "== missing ACI on a naked repo =="
NAKED="$TMP/naked"
mkdir -p "$NAKED"
set +e
node "$VERIFY" --root "$NAKED" >"$TMP/aci-missing.json"
m=$?
set -e
[[ $m -eq 2 ]] || fail "missing ACI exit $m"
grep -q missing-aci "$TMP/aci-missing.json" || fail "missing-aci json"
pass "missing ACI"

echo "== bootstrap a project like /project-bootstrap =="
PROJ="$TMP/app"
mkdir -p "$PROJ/.cursor/verify"
git -C "$PROJ" init -q
git -C "$PROJ" config user.email "e2e@example.com"
git -C "$PROJ" config user.name "E2E"
echo "# App" > "$PROJ/README.md"
echo "# App" > "$PROJ/AGENTS.md"
cp "$ROOT/templates/_shared/verify/verify.sh" "$PROJ/.cursor/verify/verify.sh"
cp "$ROOT/templates/_shared/verify/feature-map.example.json" "$PROJ/.cursor/verify/feature-map.json"
chmod +x "$PROJ/.cursor/verify/verify.sh"
git -C "$PROJ" add README.md AGENTS.md .cursor
git -C "$PROJ" commit -qm "init"

set +e
node "$VERIFY" --root "$PROJ" --phase all >"$TMP/aci-template.json"
t=$?
set -e
[[ $t -eq 1 ]] || fail "template drive should fail closed, got $t"
python3 - <<PY
import json
v=json.load(open("$TMP/aci-template.json"))
assert v["ok"] is False
assert v["steps"][0]["phase"]=="doctor" and v["steps"][0]["ok"] is True
assert v["steps"][1]["phase"]=="launch" and v["steps"][1]["ok"] is True
assert v["steps"][2]["phase"]=="drive" and v["steps"][2]["ok"] is False
print("template fails closed on drive")
PY

# User replaces drive() with a real prove-it command
python3 - <<PY
from pathlib import Path
p = Path("$PROJ/.cursor/verify/verify.sh")
text = p.read_text()
text = text.replace("return 1", "echo drive-ok; return 0", 1)
p.write_text(text)
PY
node "$VERIFY" --root "$PROJ" --phase all >"$TMP/aci-green.json"
python3 - <<PY
import json
v=json.load(open("$TMP/aci-green.json"))
assert v["ok"] is True, v
assert [s["phase"] for s in v["steps"]]==["doctor","launch","drive"]
print("custom drive passes")
PY
pass "bootstrap + ACI"

echo "== rubric-verify on a real diff =="
echo "export" >> "$PROJ/AGENTS.md"
git -C "$PROJ" diff > "$TMP/change.patch"
cp "$ROOT/templates/_shared/rubric/checklist.example.json" "$TMP/rubric.json"
python3 - <<PY
import json
from pathlib import Path
p=Path("$TMP/rubric.json")
data=json.loads(p.read_text())
data["items"][0]["pattern"]="AGENTS.md"
p.write_text(json.dumps(data))
PY
node "$RUBRIC" --rubric "$TMP/rubric.json" --diff "$TMP/change.patch" --root "$PROJ" >"$TMP/rubric-out.json"
python3 - <<PY
import json
v=json.load(open("$TMP/rubric-out.json"))
assert v["ok"] is True, v
assert v["score"]["judgment"]>=1
print("rubric mechanical pass + judgment left")
PY
pass "rubric-verify"

echo "== orchestrate STATE compile =="
cp "$ROOT/templates/_shared/rlm-state/STATE.example.md" "$TMP/STATE.md"
# example has placeholders; still has required headings + one unit
node "$STATE" check "$TMP/STATE.md" >"$TMP/state.json"
python3 - <<PY
import json
v=json.load(open("$TMP/state.json"))
assert v["ok"] is True, v
PY
node "$STATE" render-spawn "$TMP/STATE.md" >"$TMP/spawn.json"
python3 - <<PY
import json
v=json.load(open("$TMP/spawn.json"))
assert v["ok"] is True and len(v["contracts"])==1
assert "verify command" in v["contracts"][0]
print("spawn contract compiled")
PY
pass "state-tools"

echo "== install-user-layer into a fake HOME =="
export HOME="$TMP/home"
mkdir -p "$HOME"
# stub a prior mcp so the installer backs it up
mkdir -p "$HOME/.cursor"
echo '{"mcpServers":{"old":{}}}' > "$HOME/.cursor/mcp.json"
bash "$ROOT/scripts/install-user-layer.sh" >"$TMP/install.log"
[[ -L "$HOME/.cursor/skills/verify-aci" ]] || fail "verify-aci skill symlink"
[[ -L "$HOME/.cursor/skills/watch-ci" ]] || fail "watch-ci skill symlink"
[[ -L "$HOME/.cursor/skills/rubric-verify" ]] || fail "rubric-verify skill symlink"
[[ -L "$HOME/.cursor/skills/route-task" ]] || fail "route-task skill symlink"
[[ -L "$HOME/.cursor/plugins/local/grok-kit" ]] || fail "plugin symlink"
[[ -f "$HOME/.cursor/agents/verifier.md" ]] || fail "verifier agent"
grep -q verify-aci "$HOME/.cursor/agents/verifier.md" || fail "verifier should mention verify-aci"
node "$HOME/.cursor/skills/watch-ci/scripts/watch-ci.mjs" --fixture "$ROOT/skills/watch-ci/fixtures/ready.json" >"$TMP/from-home.json"
python3 -c "import json; assert json.load(open('$TMP/from-home.json'))['kind']=='ready'"
pass "user-layer install + skills runnable from ~/.cursor/skills"

echo "e2e-kit-aci ok"
