# Checklist schema

```json
{
  "schemaVersion": 1,
  "task": "short goal",
  "items": [
    {
      "id": "stable-id",
      "claim": "what must be true",
      "kind": "path-exists | diff-path | diff-excludes | grep-worktree | command | judgment",
      "severity": "must | should",
      "path": "relative/path",
      "pattern": "regex or substring",
      "command": "bash -lc string",
      "expectExit": 0,
      "negate": false
    }
  ]
}
```

Keep ≤12 items. Prefer must-items the script can fail closed.
