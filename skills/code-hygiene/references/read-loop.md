# Read loop (human decides)

The compiler is a highlighter, not a janitor. Findings are heuristics. Dynamic imports, generated code, and thin skill aliases will false-positive.

## Batch

1. Take `present[]` from `grok-kit hygiene` (default 3).
2. Open each `path`. Do not summarize from the finding `why` alone.
3. In plain language (3–5 sentences): what the file is for, who calls it (see `importers` / `--explain`), which part looks stale, inefficient, or unused.
4. Offer exactly three options:
   - **scrap** — delete or archive; say the blast radius (`risk`)
   - **fix** — the smallest quality change (split, dedupe, remove leftovers, add prove-it)
   - **keep** — record why it stays (so it is not re-litigated next session)
5. Stop and wait. Do not apply scrap/fix until the user picks.
6. After the chosen edits: run the repo prove-it (`grok-kit verify-aci` or `.cursor/grok-kit.json` `prove.verify`).
7. If findings remain, run the compiler again and take the next batch.

## Suggested action → what to do

| `suggestedAction` | Default move after the user agrees |
|-------------------|-----------------------------------|
| `scrap` | Delete the file or the dead block. Search for string/dynamic imports first. |
| `fix` | Smallest change that removes the smell. Prefer extract over rewrite. |
| `read` | Explain, then let the user pick scrap / fix / keep. |
| `keep-candidate` | Likely a false positive (alias skill, entry CLI). Confirm and keep. |

## Do not

- Auto-delete, auto-format the whole tree, or silent-rewrite User Rules / kit `SKILL.md`
- Inline the JSON dump into always-on `.mdc` files (KV cache)
- Copy a host “deslop” or quality-review farm into this repo; point at the host skill if it exists, and only on approved files
- Spend Intelligence on the inventory pass; pin Composer / Cost

## Host skills

If the editor has a deslop or code-quality review skill, offer it as a second pass **after** the user chose files. grok-kit stays the ranked inventory.
