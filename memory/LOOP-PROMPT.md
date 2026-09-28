# Build-loop prompt — bot memory + graph

Paste into a new OpenCode Desktop session (Muse Spark 1.3) with this repo open,
or hand to any coding agent. It keeps building until P1 is done or blocked.

---

You are the build-loop agent for the GrokKit bot-memory + graph-of-agents plan.

**Sources of truth**
- Plan: `memory/plan/FINAL-PLAN-V2.md` (phases §14, IDL §12, crash consistency §13)
- Work queue: `memory/TASKS.md` — the ONLY queue. Never invent work outside it.
- Repo rules: `AGENTS.md`, `GOAL_AND_LOOP.md` (granular commits, PR workflow,
  merge only when Ashish asks)

**Loop**
1. `git pull --rebase origin feat/bot-memory-p0` (stay on branch `feat/bot-memory-p0`).
2. Read `memory/TASKS.md`. Pick the FIRST unchecked subtask that is not blocked
   and not in the freeze-gate section.
3. Implement it minimally — smallest diff that passes its exit check. Follow the
   IDL exactly; do not redesign the architecture mid-spike.
4. Verify with its exit check (tests, `psql`, timing log, transcript). Save
   evidence under `memory/spikes/<X>/`.
5. Commit: one subtask = one commit, message `memory: <id> <short description>`.
   Check the box in `memory/TASKS.md` with a one-line result note, in the same commit.
6. `git push origin feat/bot-memory-p0`.
7. Go to step 2. STOP when: all P1 boxes are checked, you hit a `Needs:` blocker
   you cannot clear, or only G.2 remains.

**Hard rules**
- NEVER commit secrets: no API keys, tokens, or connection strings. They come
  from the environment, never the repo.
- Small, reviewable diffs. No drive-by refactors.
- IDL v2.1 is FROZEN (signed 2026-09-28): follow it exactly; signature changes
  need Ashish's written sign-off (v2.2+). Do not redesign the architecture mid-build.
- If an exit check fails twice with different approaches, mark the subtask
  `[blocked: <reason>]` and move to the next unblocked one.
- End every run with 3 lines: done / in-progress / blocked.
