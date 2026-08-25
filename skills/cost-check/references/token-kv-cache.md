# Token usage and KV cache

Always-on rules sit at the **front** of the prompt. Cursor and Grok Build can reuse that prefix (KV cache) on later turns **only if the bytes did not change**. A timestamp, a session dump, or a rewritten always-on file misses the cache and you pay again for the whole prefix (system prompt, rules, skills, MCP schemas).

## What grok-kit does

1. **Thin router, not a skill dump.** `grok-kit apply` writes `.cursor/grok-kit.json` plus a short always-on project rule for **enabled** features only. The other playbook skills load when you invoke them.
2. **Byte-stable always-on files.** Generated project rules have no dates and no per-session text. `learn tick` / `--improve` will not rewrite the rule unless enabled features actually changed. Learned workflows live in `grok-kit.json`, which is not always-on.
3. **Skills on demand.** `/cost-check`, `/verify-aci`, `/orchestrate-rlm`, and the rest are slash skills (`disable-model-invocation` where gated). They are not copied into User Rules.
4. **MCP slim.** Consented install keeps user-global MCP at ICM-only. Product servers (browser, DB, deploy, Tell) stay project-scoped so their schemas are not in every chat.
5. **Cheap default routing.** Auto Balance for implement. Cost/Composer for ask, explore, and verify. Intelligence only for stubborn debug or novel architecture. Subagents pin cheap models and return summaries (depth 1).
6. **Short memory.** ICM holds long-tail facts. Hot MEMORY/USER stay small. Do not paste identity into always-on rules.

## What busts the cache (do not do this)

- Putting `new Date()`, session ids, or usage histograms into `alwaysApply` rules
- Rewriting `.cursor/rules/*.mdc` on every `sessionStart`
- Pasting full SKILL.md bodies into User Rules or AGENTS.md
- Dumping `/overview` or `/code-hygiene` JSON into always-on `.mdc` files
- Enabling unused product MCP globally

## Audit (from `/cost-check`)

1. Context ring: Rules / Skills / MCP sizes
2. Always-on files: no ISO timestamps, no "learned" dumps
3. MCP: disable product servers this repo does not need
4. Optimize For matches the router matrix
5. Custom subagents pin Composer (or Cost) for explore/verify
