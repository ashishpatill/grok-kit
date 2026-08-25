## Stack profile: Next.js + Clerk + Neon

- App router under `app/`
- Auth: Clerk — never weaken auth boundaries in server actions
- DB: Neon — migrations via project skill/CLI; no ad-hoc prod edits
- Run: `pnpm dev` / `pnpm test` / `pnpm lint` (adjust to package manager). Put the prove-it command in `.cursor/verify/verify.sh` `drive()`.
- MCP: enable project `.cursor/mcp.json` Neon (+ Clerk plugin when needed); keep global MCP slim
