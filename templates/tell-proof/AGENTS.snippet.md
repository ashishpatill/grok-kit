## Stack profile: Tell (UI critic)

- Visual prove: Tell MCP `tell_proof_verify` — a screenshot is not proof
- `tell_apply` returns patches only; never write files from that tool
- grok-kit: `/route-task`, `/verify-aci`, `/rubric-verify`, `/watch-ci --status-once`, `/cost-check`
- Multi-package work: `/orchestrate-rlm` + `grok-kit state-tools`
- MCP: project-scoped Tell only (`pnpm -F @tell/mcp start` or `tell mcp install cursor --project`). Do not enable Tell globally
- Replace `drive()` in `.cursor/verify/verify.sh` with this repo's prove-it (`pnpm test` plus UI proof when the claim is visual)
