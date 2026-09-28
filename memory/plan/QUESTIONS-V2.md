# Open Questions — plain-language version
**For:** Ashish · **Date:** 2026-09-28 · All five answered 2026-09-28. Next step: your freeze-gate sign-off on the IDL (§12 of the plan), then P0 spikes.

Already decided by you: cloud storage on NeonDB ✓ · MCP for Moose ✓ · event-triggered daemon on Tailscale ✓ · one shared memory for all bots ✓ · OpenRouter cheap-tier for internal AI calls ✓ · dynamic triage (no fixed weekly budget) ✓ · task-class-based adaptive autonomy ✓ · condensation-first memory at scale ✓ · source-of-truth resolution model (no "disputed" state) ✓ · backups default to daemon host ✓ · no trust tiers, no per-bot access/authority levels ✓.

---

## Q4 — How much weekly review time will you give the memory?

**What it means:** Bots will constantly want to add learnings to the shared memory. Most routine ones (duplicates, well-evidenced facts) get approved automatically by fixed rules. The rest land in a simple review list for you — each item shows what the bot learned, its evidence, and approve / reject / edit buttons.

**✅ Answered 2026-09-28 — dynamic triage:** No fixed weekly budget. Tasks that need Ashish's approval or judgment route to him (batched, async); tasks the agent can handle are handled autonomously and logged, with a weekly digest for visibility. Time required varies by task — the system never demands a fixed slot. Anything executable (skills, workflows) and pinned preferences **always** wait for Ashish — no auto-approval, ever.

---

## Q5 — How much authority does the background curator get?

**What it means:** A background helper (the "curator") processes the queue of proposed memories. The question is how much it may do on its own.

**✅ Answered 2026-09-28 — task-class-based autonomy:** Autonomy is per task class, not a fixed level. Money, sensitive changes, anything that could break apps, and destructive actions → **human approval always**. Safe technical work that can only improve (dedup, indexing, organizing, archiving, well-evidenced learning promotions) → **agent autonomous**. Autonomy per class **adapts over time**: as a task class demonstrates reliability, its autonomy expands; on failures it contracts — Ashish reviews the matrix. The curator never deletes anything and never approves skills, workflows, or pinned preferences.

---

## Q6 — Trust levels for bots: are these numbers right?

**✅ Answered 2026-09-28 — no trust tiers, no gatekeeping:** There are no per-bot access or authority levels and no "verified contribution" counts. All bots have symmetric access to the shared memory — a learning lives in the store (not in any agent) and is available to every agent or to none. Any bot may make a decision provided it has sufficient grounding: the action must cite the shared learnings it was based on (recorded in provenance). Legitimacy comes from the source of truth, not from identity or tier. Fabrication is handled by invalidating the *learning* (evidence check + resolution workflow), not by demoting the *bot*. The task-based autonomy matrix (Q5) still applies — it governs *task classes* (money/sensitive/breaking → human), identically for every bot.

---

## Q9 — Where should the backup copies live?

**What it means:** Neon (the cloud database) keeps only **6 hours** of undo history on the free plan — that's for "oops, undo that," not a real backup. So the plan takes its own backup: a full copy of the memory database, once a week, kept for 4 weeks.

**✅ Answered 2026-09-28 — default accepted, plus a scale requirement:** Weekly backup lives on the **daemon host** (cloud Neon + local copy, zero extra spend). More importantly, Ashish reframed the requirement: memory must be **condensation-first** — chats are distilled into learnings, never stored raw — so that after 2–3 years and hundreds of thousands of records, retrieval stays real-time. This is now a named scale requirement in the plan (FINAL-PLAN-V2.md §2.9): 10⁵–10⁶ records, p95 recall < 500ms, raw trajectories kept only as compressed pointers.

---

## Q10 — When a memory is disputed, who sees it?

**✅ Answered 2026-09-28 — no "disputed" state:** Memory is the source of truth, so it is never displayed as disputed. The original record is always preserved (immutable + provenance). When new information contradicts a stored learning, the agent **weighs the evidence** (recency, source reliability, corroboration) and **updates or improves the learning** through the supersede chain — one evolving learning per concept, full history kept. Low-confidence or sensitive contradictions route to human review per the autonomy matrix. (This replaces the old contested-flag concept; see FINAL-PLAN-V2.md §10.)

---

## Quick-reply template

All questions answered — next step is your freeze-gate sign-off on the IDL (§12 of FINAL-PLAN-V2.md).
