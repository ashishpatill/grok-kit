# Compiled sequences

Commands are relative to the skill install (`~/.cursor/skills/<name>/scripts/...` after user-layer install).

## bug

1. Capture the failing command / stack trace (do not skip repro).
2. `debugger` agent — localize, 1–2 hypotheses, stop after two failures.
3. `node skills/verify-aci/scripts/verify-aci.mjs --phase drive`
4. `node skills/rubric-verify/scripts/rubric-verify.mjs --rubric <checklist.json>`

## feature

1. `/plan-execute` — parallel requirements as separate checkboxes; include verify command.
2. Implement only after plan approval.
3. Rubric + `verify-aci --phase all`.
4. If a PR exists: `watch-ci --status-once`.

## investigate

1. `researcher` — ≤12 bullets, paths, confidence. Write bulky notes under `.cursor/rlm-state/`.
2. Multi-package: write STATE.md, `state-tools.mjs check`, `state-tools.mjs render-spawn`, spawn depth-1 children with those contracts.

## ship

1. `verify-aci --phase all` must be `ok`.
2. Rubric must-items pass.
3. `watch-ci --status-once` — trust `class`/`actor`. Approval is a human wait, not a CI fail.
4. Do not merge, restack, or force-push unless the user explicitly asked to land.
