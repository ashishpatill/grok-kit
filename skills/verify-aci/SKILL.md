---
name: verify-aci
description: >-
  Use when claiming work is done, before merge, or when a project needs a local
  prove-it path (doctor, launch, one drive). Prefer this over ad-hoc test swarms.
---

# Verify ACI

Run the **project** script. Do not invent a 10-lane visual swarm.

## Procedure

1. Discover `.cursor/verify/verify.sh` (or `VERIFY_SCRIPT` / `scripts/verify.sh`).
2. If missing, copy `templates/_shared/verify/verify.sh` via `/project-bootstrap` — do not skip.
3. Run the runner next to this skill:

```bash
node "$SKILL_DIR/scripts/verify-aci.mjs" --root <repo> --phase all
```

4. Trust the JSON: `ok`, `steps[]`, `logPath`. A missing `drive()` that still exits 0 is a lie — replace it with the command that proves the change.
5. Optional `--surface <name>` reads `.cursor/verify/feature-map.json`. One named surface, not ten parallel lanes.

## Phases (script owns the order)

| Phase | Meaning |
|-------|---------|
| doctor | toolchain / env can run |
| launch | artifact starts (help, import, health) |
| drive | **one** golden path for the claimed change |

## After

- Score the diff with `/rubric-verify` when the change is multi-file or a plan listed acceptance checks.
- If a PR exists, `/watch-ci` `--status-once`.

## Pitfalls

- Treating unit tests as proof the bug is gone
- Asking the user to click through a control surface this environment can drive
- Polling or opening extra browsers because the script felt "too small"
