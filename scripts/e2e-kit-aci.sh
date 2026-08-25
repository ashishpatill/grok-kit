#!/usr/bin/env bash
# Offline user journey: bootstrap a repo, prove ACI, score a rubric, classify PRs, install user layer.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/grok-kit-e2e.XXXXXX")"
cleanup() { rm -rf "$TMP"; }
trap cleanup EXIT

fail() { echo "e2e FAIL: $*" >&2; exit 1; }
pass() { echo "e2e ok: $*"; }

KITCLI="$ROOT/scripts/grok-kit.mjs"

echo "== CLI --help =="
node "$KITCLI" --help | grep -q bootstrap || fail "grok-kit help"
node "$KITCLI" --help | grep -q apply || fail "grok-kit help apply"
node "$KITCLI" --help | grep -q route-task || fail "grok-kit help route-task"
node "$KITCLI" verify-aci --help | grep -q doctor || fail "verify-aci help"
node "$KITCLI" watch-ci --help | grep -q status-once || fail "watch-ci help"
node "$KITCLI" rubric-verify --help | grep -q judgment || fail "rubric-verify help"
node "$KITCLI" state-tools --help | grep -q render-spawn || fail "state-tools help"
node "$KITCLI" bootstrap --help | grep -q profile || fail "bootstrap help"
node "$KITCLI" apply --help | grep -q if-missing || fail "apply help"
node "$KITCLI" apply --help | grep -q require-consent || fail "apply help consent"
node "$KITCLI" consent --help | grep -q notice || fail "consent help"
node "$KITCLI" install --help | grep -q i-consent || fail "install help"
node "$KITCLI" route-task --help | grep -q feature || fail "route-task help"
node "$KITCLI" session-handoff --help | grep -q init || fail "session-handoff help"
node "$KITCLI" skill-curator --help | grep -q inventory || fail "skill-curator help"
node "$KITCLI" learn --help | grep -q i-consent || fail "learn help"
node "$KITCLI" overview --help | grep -q flagship || fail "overview help"
node "$KITCLI" flagship --help | grep -q visualise || fail "flagship help"
node "$KITCLI" install --help | grep -q learn || fail "install help learn"
pass "help text"

echo "== watch-ci fixtures (merge-state, not green lists) =="
set +e
node "$KITCLI" watch-ci --fixture "$ROOT/skills/watch-ci/fixtures/ready.json" >"$TMP/ready.json"
ready_ec=$?
node "$KITCLI" watch-ci --fixture "$ROOT/skills/watch-ci/fixtures/conflicts.json" >"$TMP/conflicts.json"
c=$?
node "$KITCLI" watch-ci --fixture "$ROOT/skills/watch-ci/fixtures/green-but-rejected.json" >"$TMP/rejected.json"
r=$?
node "$KITCLI" watch-ci --fixture "$ROOT/skills/watch-ci/fixtures/approval-wait.json" >"$TMP/approval.json"
a=$?
node "$KITCLI" watch-ci --fixture "$ROOT/skills/watch-ci/fixtures/pending.json" >"$TMP/pending.json"
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
node "$KITCLI" verify-aci --root "$ROOT" --phase doctor >/dev/null
node "$KITCLI" verify-aci --root "$ROOT" --phase launch >/dev/null
node "$KITCLI" verify-aci --root "$ROOT" --surface unit --phase launch >/dev/null
pass "kit doctor + launch"

echo "== missing ACI on a naked repo =="
NAKED="$TMP/naked"
mkdir -p "$NAKED"
set +e
node "$KITCLI" verify-aci --root "$NAKED" >"$TMP/aci-missing.json"
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
node "$KITCLI" verify-aci --root "$PROJ" --phase all >"$TMP/aci-template.json"
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
node "$KITCLI" verify-aci --root "$PROJ" --phase all >"$TMP/aci-green.json"
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
node "$KITCLI" rubric-verify --rubric "$TMP/rubric.json" --diff "$TMP/change.patch" --root "$PROJ" >"$TMP/rubric-out.json"
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
node "$KITCLI" state-tools check "$TMP/STATE.md" >"$TMP/state.json"
python3 - <<PY
import json
v=json.load(open("$TMP/state.json"))
assert v["ok"] is True, v
PY
node "$KITCLI" state-tools render-spawn "$TMP/STATE.md" >"$TMP/spawn.json"
python3 - <<PY
import json
v=json.load(open("$TMP/spawn.json"))
assert v["ok"] is True and len(v["contracts"])==1
assert "verify command" in v["contracts"][0]
print("spawn contract compiled")
PY
pass "state-tools"

echo "== compiled bootstrap =="
node "$KITCLI" bootstrap --root "$TMP/boot" --profile generic >"$TMP/boot.json"
python3 - <<PY
import json
from pathlib import Path
v=json.load(open("$TMP/boot.json"))
assert v["ok"] is True, v
root = Path("$TMP/boot")
assert (root / ".cursor/verify/verify.sh").is_file()
assert (root / ".cursor/verify/rubric.json").is_file()
assert (root / ".cursor/rules/core.mdc").is_file()
assert (root / ".cursorignore").is_file()
assert "/verify-aci" in (root / "AGENTS.md").read_text()
print("bootstrap wrote project layer")
PY
pass "bootstrap"

echo "== apply detect + tell-proof template (fake Tell tree) =="
TELL="$TMP/tell"
mkdir -p "$TELL/packages/mcp"
printf '%s\n' '# Tell' '' 'Existing mission. tell_proof_verify listed.' > "$TELL/AGENTS.md"
printf '%s\n' '{"name":"@tell/mcp"}' > "$TELL/packages/mcp/package.json"
node "$KITCLI" apply --root "$TELL" --detect-only >"$TMP/tell-detect.json"
python3 - <<PY
import json
v=json.load(open("$TMP/tell-detect.json"))
assert v["ok"] is True and v["profile"]=="tell-proof", v
assert "tell-proof" in v["enabled"] and "orchestrate-rlm" in v["enabled"], v
assert v["mcpRecommended"]==["tell"]
assert v["prove"]["ui"]=="tell_proof_verify"
print("detect-only tell-proof")
PY
[[ ! -e "$TELL/.cursor/grok-kit.json" ]] || fail "detect-only must not write"
node "$KITCLI" apply --root "$TELL" >"$TMP/tell-apply.json"
python3 - <<PY
import json
from pathlib import Path
v=json.load(open("$TMP/tell-apply.json"))
assert v["ok"] is True and v["profile"]=="tell-proof", v
root = Path("$TELL")
agents = (root / "AGENTS.md").read_text()
assert "Existing mission" in agents
assert "tell_proof_verify" in agents
assert "grok-kit apply" in agents
manifest = json.loads((root / ".cursor/grok-kit.json").read_text())
assert manifest["profile"]=="tell-proof"
assert "tell-proof" in manifest["enabled"]
rule = (root / ".cursor/rules/grok-kit-project.mdc").read_text()
assert "alwaysApply: true" in rule and "tell_proof_verify" in rule
assert not (root / ".cursor/mcp.json").exists()
print("apply tell-proof without clobber or MCP write")
PY
node "$KITCLI" apply --root "$TELL" --if-missing >"$TMP/tell-skip.json"
python3 -c "import json; v=json.load(open('$TMP/tell-skip.json')); assert v['skipped'] is True and v['reason']=='already-adapted'"
NAKED="$TMP/notgit"
mkdir -p "$NAKED"
node "$KITCLI" apply --root "$NAKED" --require-git >"$TMP/notgit.json"
python3 -c "import json; v=json.load(open('$TMP/notgit.json')); assert v['reason']=='not-a-git-repo'"
[[ ! -e "$NAKED/.cursor/grok-kit.json" ]] || fail "require-git wrote on non-git"
pass "apply + tell-proof"

echo "== sessionStart hook requires consent =="
HOOK="$TMP/hookgit"
mkdir -p "$HOOK"
git -C "$HOOK" init -q
export GROK_KIT_CONSENT_FILE="$TMP/no-consent.json"
(
  cd "$HOOK"
  CURSOR_PLUGIN_ROOT="$ROOT" bash "$ROOT/hooks/session-start-apply.sh" >"$TMP/hook1.json"
)
python3 - <<PY
import json
from pathlib import Path
ctx=json.load(open("$TMP/hook1.json"))
assert "additional_context" in ctx, ctx
assert "install --i-consent" in ctx["additional_context"], ctx
assert not (Path("$HOOK") / ".cursor/grok-kit.json").exists()
print("sessionStart blocked without consent")
PY
export GROK_KIT_CONSENT_FILE="$TMP/yes-consent.json"
node "$KITCLI" consent write --scopes user-layer,project-apply --source e2e >/dev/null
(
  cd "$HOOK"
  CURSOR_PLUGIN_ROOT="$ROOT" GROK_KIT_CONSENT_FILE="$TMP/yes-consent.json" bash "$ROOT/hooks/session-start-apply.sh" >"$TMP/hook2.json"
)
python3 - <<PY
import json
from pathlib import Path
ctx=json.load(open("$TMP/hook2.json"))
assert "applied" in ctx["additional_context"] or "already adapted" in ctx["additional_context"], ctx
assert (Path("$HOOK") / ".cursor/grok-kit.json").is_file()
print("sessionStart applied after consent")
PY
(
  cd "$HOOK"
  CURSOR_PLUGIN_ROOT="$ROOT" GROK_KIT_CONSENT_FILE="$TMP/yes-consent.json" bash "$ROOT/hooks/session-start-apply.sh" >"$TMP/hook3.json"
)
python3 -c "import json; ctx=json.load(open('$TMP/hook3.json')); assert 'already adapted' in ctx['additional_context']"
python3 -c "import json; ctx=json.load(open('$TMP/hook3.json')); assert 'usage-learn' not in ctx['additional_context']"
unset GROK_KIT_CONSENT_FILE
pass "sessionStart hook"

echo "== route-task / session-handoff / skill-curator =="
node "$KITCLI" route-task feature >"$TMP/route.json"
python3 - <<PY
import json
v=json.load(open("$TMP/route.json"))
assert v["sticky"] is False
assert any("verify-aci" in s for s in v["steps"]), v
print("route-task feature compiled")
PY
HAND="$TMP/handoff-root"
node "$KITCLI" session-handoff init --root "$HAND" --project e2e >"$TMP/h-init.json"
set +e
node "$KITCLI" session-handoff check --root "$HAND" >"$TMP/h-bad.json"
h_bad=$?
set -e
[[ $h_bad -eq 1 ]] || fail "empty handoff should fail check, got $h_bad"
python3 - <<PY
from pathlib import Path
p = Path("$HAND/.cursor/handoff.md")
p.write_text(p.read_text().replace("(describe)", "Dogfood PATH CLI."))
PY
node "$KITCLI" session-handoff check --root "$HAND" >"$TMP/h-ok.json"
python3 -c "import json; assert json.load(open('$TMP/h-ok.json'))['ok'] is True"
node "$KITCLI" skill-curator inventory --kit "$ROOT" >"$TMP/curator.json"
python3 - <<PY
import json
v=json.load(open("$TMP/curator.json"))
names={s["name"] for s in v["skills"]}
assert "verify-aci" in names and "watch-ci" in names, names
assert "usage-learn" in names, names
assert "flagship" in names and "overview" in names and "visualise" in names, names
print("skill-curator inventory", v["skillCount"], "skills")
PY
pass "route-task + session-handoff + skill-curator"

echo "== overview / visualise / flagship =="
node "$KITCLI" overview --root "$ROOT" --short >"$TMP/ov-short.json"
python3 - <<PY
import json
v=json.load(open("$TMP/ov-short.json"))
assert v["ok"] is True and "flagship" in v["line"] and "/overview" in v["line"], v
print("overview --short")
PY
node "$KITCLI" visualise --root "$ROOT" >"$TMP/vis.json"
python3 - <<PY
import json
v=json.load(open("$TMP/vis.json"))
assert v["mode"]=="visualise" and "flowchart" in v["mermaid"], v
print("visualise mermaid")
PY
node "$KITCLI" flagship --root "$ROOT" --when now >"$TMP/flag.json"
python3 - <<PY
import json
v=json.load(open("$TMP/flag.json"))
assert v["ok"] is True and v["kit"]["profile"]=="agentic-framework", v
assert "flowchart" in v["mermaid"]
print("flagship now")
PY
pass "overview + visualise + flagship"

echo "== install-user-layer into a fake HOME =="
export HOME="$TMP/home-refuse"
mkdir -p "$HOME"
set +e
bash "$ROOT/scripts/install-user-layer.sh" >"$TMP/refuse.log" 2>"$TMP/refuse.err"
refuse_rc=$?
set -e
[[ $refuse_rc -eq 78 ]] || fail "install without consent exit $refuse_rc"
[[ ! -e "$HOME/.cursor/agents/verifier.md" ]] || fail "install wrote agents without consent"
grep -q i-consent "$TMP/refuse.err" "$TMP/refuse.log" || fail "refuse should mention --i-consent"

export HOME="$TMP/home"
mkdir -p "$HOME"
# stub a prior mcp so the installer backs it up
mkdir -p "$HOME/.cursor"
echo '{"mcpServers":{"old":{}}}' > "$HOME/.cursor/mcp.json"
bash "$ROOT/scripts/install-user-layer.sh" --i-consent --no-apply-cwd >"$TMP/install.log"
[[ -f "$HOME/.cursor/grok-kit-consent.json" ]] || fail "consent file"
python3 - <<PY
import json
c=json.load(open("$HOME/.cursor/grok-kit-consent.json"))
assert c["scopes"]["userLayer"] is True
assert c["scopes"]["projectApply"] is True
assert c["scopes"]["mcpSlim"] is True
assert c["scopes"].get("usageLearn") is False
assert c["scopes"].get("harnessImprove") is False
print("consent recorded")
PY
[[ -L "$HOME/.cursor/skills/verify-aci" ]] || fail "verify-aci skill symlink"
[[ -L "$HOME/.cursor/skills/watch-ci" ]] || fail "watch-ci skill symlink"
[[ -L "$HOME/.cursor/skills/rubric-verify" ]] || fail "rubric-verify skill symlink"
[[ -L "$HOME/.cursor/skills/route-task" ]] || fail "route-task skill symlink"
[[ -L "$HOME/.cursor/skills/usage-learn" ]] || fail "usage-learn skill symlink"
[[ -L "$HOME/.cursor/skills/flagship" ]] || fail "flagship skill symlink"
[[ -L "$HOME/.cursor/skills/overview" ]] || fail "overview skill symlink"
[[ -L "$HOME/.cursor/skills/visualise" ]] || fail "visualise skill symlink"
[[ -L "$HOME/.cursor/plugins/local/grok-kit" ]] || fail "plugin symlink"
[[ -L "$HOME/.local/bin/grok-kit" ]] || fail "PATH grok-kit symlink"
[[ -f "$HOME/.cursor/agents/verifier.md" ]] || fail "verifier agent"
[[ -f "$HOME/.cursor/rules/grok-kit.mdc" ]] || fail "user grok-kit rule"
grep -q "install --i-consent" "$HOME/.cursor/rules/grok-kit.mdc" || fail "user rule should mention consent"
grep -q sessionStart "$HOME/.cursor/hooks.json" || fail "sessionStart hook"
grep -q verify-aci "$HOME/.cursor/agents/verifier.md" || fail "verifier should mention verify-aci"
grep -q tell_proof_verify "$HOME/.cursor/agents/verifier.md" || fail "verifier should mention tell_proof_verify"
grep -q orchestrate-rlm "$HOME/.cursor/agents/researcher.md" || fail "researcher should mention orchestrate-rlm"
# Re-install must merge, not wipe, extra hook events
python3 - <<PY
import json
from pathlib import Path
p = Path("$HOME/.cursor/hooks.json")
data = json.loads(p.read_text())
data["hooks"]["preToolUse"] = [{"command": "./hooks/keep-me.sh", "timeout": 5}]
p.write_text(json.dumps(data, indent=2) + "\n")
PY
bash "$ROOT/scripts/install-user-layer.sh" --i-consent --no-apply-cwd >/dev/null
python3 - <<PY
import json
h=json.load(open("$HOME/.cursor/hooks.json"))
events=h["hooks"]
assert any(e.get("command")=="./hooks/keep-me.sh" for e in events["preToolUse"]), events
assert any("session-start-apply.sh" in e.get("command","") for e in events["sessionStart"]), events
assert any(e.get("timeout", 0) >= 16 for e in events["sessionStart"]), events
assert any("stage-memory-candidate.sh" in e.get("command","") for e in events["stop"]), events
print("hooks merge preserved extra events")
PY
node "$HOME/.cursor/skills/watch-ci/scripts/watch-ci.mjs" --fixture "$ROOT/skills/watch-ci/fixtures/ready.json" >"$TMP/from-home.json"
[[ -s "$TMP/from-home.json" ]] || fail "watch-ci via skill symlink produced no stdout (isMain/symlink bug)"
python3 -c "import json; assert json.load(open('$TMP/from-home.json'))['kind']=='ready'"
node "$HOME/.cursor/plugins/local/grok-kit/scripts/grok-kit.mjs" watch-ci --fixture "$ROOT/skills/watch-ci/fixtures/ready.json" >"$TMP/from-plugin.json"
python3 -c "import json; assert json.load(open('$TMP/from-plugin.json'))['kind']=='ready'"
PATH="$HOME/.local/bin:$PATH" grok-kit watch-ci --fixture "$ROOT/skills/watch-ci/fixtures/ready.json" >"$TMP/from-path.json"
python3 -c "import json; assert json.load(open('$TMP/from-path.json'))['kind']=='ready'"
# Skills must work from a foreign repo that has no grok-kit.mjs
FOREIGN="$TMP/foreign"
mkdir -p "$FOREIGN"
PATH="$HOME/.local/bin:$PATH" grok-kit verify-aci --root "$FOREIGN" >"$TMP/foreign-aci.json" || true
grep -q missing-aci "$TMP/foreign-aci.json" || fail "PATH grok-kit should run verify-aci in a foreign repo"
pass "user-layer install + skills runnable from ~/.cursor/skills and PATH"

echo "== learn observe / apply consent =="
LEARN_APP="$TMP/learn-app"
mkdir -p "$LEARN_APP/.cursor/rules"
git -C "$LEARN_APP" init -q
python3 - <<PY
from pathlib import Path
root = Path("$LEARN_APP")
(root / ".cursor/grok-kit.json").write_text(
    '{"schemaVersion":1,"profile":"generic","enabled":["verify-aci"],'
    '"available":["refine-harness","usage-learn"],"mcpRecommended":[],'
    '"prove":{"verify":"true"}}\n'
)
PY
export GROK_KIT_USAGE_FILE="$TMP/usage.jsonl"
export GROK_KIT_PROPOSALS_FILE="$TMP/learn-proposals.json"
export GROK_KIT_CONSENT_FILE="$TMP/no-learn-consent.json"
node "$KITCLI" learn record --skill verify-aci --root "$LEARN_APP" >"$TMP/learn-rec-skip.json"
python3 -c "import json; v=json.load(open('$TMP/learn-rec-skip.json')); assert v.get('reason')=='consent-required', v"
[[ ! -e "$TMP/usage.jsonl" ]] || fail "usage log without learn consent"
node "$KITCLI" learn apply --root "$LEARN_APP" >"$TMP/learn-apply-skip.json"
python3 - <<PY
import json
from pathlib import Path
v=json.load(open("$TMP/learn-apply-skip.json"))
assert v.get("reason")=="consent-required", v
m=json.loads(Path("$LEARN_APP/.cursor/grok-kit.json").read_text())
assert m["enabled"]==["verify-aci"], m
print("learn apply skipped without consent")
PY
node "$KITCLI" consent write --scopes usage-learn --source e2e >/dev/null
node "$KITCLI" learn record --skill orchestrate-rlm --root "$LEARN_APP" >/dev/null
node "$KITCLI" learn record --skill orchestrate-rlm --root "$LEARN_APP" >/dev/null
node "$KITCLI" learn summarize >"$TMP/learn-sum.json"
python3 -c "import json; v=json.load(open('$TMP/learn-sum.json')); assert v['ok'] is True and v['eventCount']>=2, v"
node "$KITCLI" learn propose --root "$LEARN_APP" >"$TMP/learn-prop.json"
python3 - <<PY
import json
from pathlib import Path
v=json.load(open("$TMP/learn-prop.json"))
assert v["ok"] is True, v
assert Path("$TMP/learn-proposals.json").is_file()
assert any(p.get("kind")=="enable-feature" for p in v["proposals"]), v
print("propose wrote file")
PY
node "$KITCLI" learn apply --root "$LEARN_APP" >"$TMP/learn-apply-noci.json"
python3 - <<PY
import json
from pathlib import Path
v=json.load(open("$TMP/learn-apply-noci.json"))
assert v.get("reason")=="consent-required", v
m=json.loads(Path("$LEARN_APP/.cursor/grok-kit.json").read_text())
assert "orchestrate-rlm" not in m["enabled"], m
print("learn apply still skipped without --i-consent / --improve")
PY
node "$KITCLI" learn apply --root "$LEARN_APP" --i-consent >"$TMP/learn-apply-ok.json"
python3 - <<PY
import json
from pathlib import Path
v=json.load(open("$TMP/learn-apply-ok.json"))
assert v.get("ok") is True and not v.get("skipped"), v
m=json.loads(Path("$LEARN_APP/.cursor/grok-kit.json").read_text())
assert "orchestrate-rlm" in m["enabled"], m
rule = (Path("$LEARN_APP") / ".cursor/rules/grok-kit-project.mdc").read_text()
assert "orchestrate-rlm" in rule
print("learn apply --i-consent enabled optional feature")
PY
export HOME="$TMP/home-improve"
mkdir -p "$HOME"
unset GROK_KIT_USAGE_FILE GROK_KIT_PROPOSALS_FILE GROK_KIT_CONSENT_FILE
bash "$ROOT/scripts/install-user-layer.sh" --i-consent --learn --improve --no-apply-cwd >/dev/null
python3 - <<PY
import json
c=json.load(open("$HOME/.cursor/grok-kit-consent.json"))
assert c["scopes"]["usageLearn"] is True
assert c["scopes"]["harnessImprove"] is True
assert c["scopes"]["userLayer"] is True
print("install --learn --improve recorded")
PY
pass "usage-learn consent loop"

echo "e2e-kit-aci ok"
