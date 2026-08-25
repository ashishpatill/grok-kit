# Merge-state notes

GitHub `mergeStateStatus` is the source of truth.

- `CLEAN` / `HAS_HOOKS` + passing required checks + no threads/conflicts → ready
- `BLOCKED` + failing/error rollup → `github-rejected` even if `gh pr checks` looks green
- `BLOCKED` + clean rollup → `approval` (human)
- `BEHIND` → stale-base (rebase, do not retry)
- `DIRTY` / `CONFLICTING` → conflicts (report; do not force-push)

Never classify a review-gate check as pending CI. Never merge from this skill.
