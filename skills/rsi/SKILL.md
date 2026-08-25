---
name: rsi
description: >-
  Review before ship: flagship status, code hygiene, rubric, verify-aci,
  watch-ci. Use when a PR is ready to land or the user asked /rsi.
---

# RSI

Review. Then ship only if the user asked to merge.

```bash
grok-kit rsi --root .
grok-kit rsi --short
```

1. Run the compiler (JSON: flagship line, hygiene present[], steps).
2. Read hygiene findings with `/code-hygiene` rules (batch of 3, human decides).
3. Follow `steps[]`. Leave this skill. Do not dump into always-on rules.
4. Merge only when the user explicitly asked to land.

Pin cheap/Composer for the review pass.
