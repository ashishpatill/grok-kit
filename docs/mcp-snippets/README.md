# Project MCP snippets

Copy into a project's `.cursor/mcp.json` only when that product is needed.

User-global MCP should stay slim: **ICM** (+ nothing else by default).

See individual JSON files in this folder. Tell MCP (`tell-proof.json`) is **project-scoped** — copy only into a repo that needs visual proof, never into user-global `mcp.json`. `grok-kit apply --write-mcp` will merge it when Tell is recommended and not already present.

