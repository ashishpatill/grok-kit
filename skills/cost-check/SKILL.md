---
name: cost-check
description: >-
  Cost and routing checklist using the editor Router matrix and context-ring MCP audit.
  Use when spend is high, before large agent runs, or to choose Auto Cost/Balance/Intelligence.
disable-model-invocation: true
---

# Cost Check

## Router matrix (default OS policy)

| Scenario | Editor | Optimize For | Subagents |
|----------|--------|--------------|-----------|
| Clarify / Q&A | Ask | Cost or Composer 2.5 | none |
| Ambiguous feature | Plan → Agent | Balance | Explore OK |
| Day-to-day implement | Agent | **Balance** (default) | pin cheap on workers |
| Budget grind / nits | Agent/Ask | Cost or Composer | Explore only |
| Architecture / novel | Plan → Agent | Intelligence (critical only) | few, sequential |
| Stubborn bug | Debug | Intelligence | as needed |
| Verify / review | Ask/Agent | pin Composer — never inherit Intelligence | readonly verifier |
| Needle search | Ask/Agent | Cost | built-in Explore |

## Hard rules

1. Ladder: Skill → single Agent → Plan→Agent → parallel Task (≤3–5) → Best-of-N (rare)
2. Depth 1; children summarize only
3. Prefer the Models pool (Grok 4.5 / Composer 2.5) for routine
4. Disable unused MCP (context ring → MCP segment)
5. Avoid Fast variants, Fable/1M, Max Mode unless justified
6. Tokens ≠ success — fix topology + verifier, don't grind longer
7. **External batch inference** — rare eval-only exception; Cursor Models / subscription (Grok for design judgment) stays default; avoid a third daily provider

## Audit steps

1. Open context ring — note Rules / Skills / MCP sizes
2. List enabled MCP servers — disable product servers not needed for this repo
3. Confirm parent Optimize For matches the matrix
4. Confirm custom subagents pin cheap models for explore/verify
5. Report recommended changes in ≤8 bullets
