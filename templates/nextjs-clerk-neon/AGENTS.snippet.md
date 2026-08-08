## Stack profile: Next.js + Clerk + Neon

- App router under `app/`
- Auth: Clerk — never weaken auth boundaries in server actions
- DB: Neon — migrations via project skill/CLI; no ad-hoc prod edits
- Run: `pnpm dev` / `pnpm test` / `pnpm lint` (adjust to package manager)
- MCP: enable project `.cursor/mcp.json` Neon (+ Clerk plugin when needed); keep global MCP slim
