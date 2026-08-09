# Publishing grok-kit

## Local install (always works)

```bash
ln -sfn /Volumes/Developer/Workspace/cursor-kit ~/.cursor/plugins/local/grok-kit
# or
./scripts/install-user-layer.sh
```

Then **Developer: Reload Window**.

## Cursor Marketplace (public)

Manifest: `.cursor-plugin/plugin.json` (id `grok-kit`, MIT, logo at `assets/logo.png`).

Automatable prep (done in-repo):

- [x] Valid `.cursor-plugin/plugin.json` with name, description, author, license, keywords, logo
- [x] Accurate README (harness kit — not design-workflow marketing)
- [x] `LICENSE` (MIT)
- [x] Public GitHub repo `ashishpatill/grok-kit`

Manual step (requires logged-in Cursor account):

1. Open https://cursor.com/marketplace/publish
2. Submit repository URL: `https://github.com/ashishpatill/grok-kit`
3. Wait for Cursor manual review (no public SLA)

Team-only alternative: Settings → Plugins → Team Marketplaces → Import the same GitHub URL.

## Grok Build Marketplace

xAI catalogs plugins via PRs to https://github.com/xai-org/plugin-marketplace (Grok Build terminal agent).

Compatibility notes:

- Grok Build discovers `skills/`, `agents/`, `hooks/hooks.json`, optional root `plugin.json`
- This repo already uses that layout; root `plugin.json` is included for metadata
- Remote catalog entries must pin a full 40-char commit SHA of this repo

Submit path:

1. Merge this kit’s changes to `main` and note `git rev-parse HEAD`
2. Fork `xai-org/plugin-marketplace`
3. Append a remote entry to `.grok-plugin/marketplace.json`:

```json
{
  "name": "grok-kit",
  "description": "Personal agent harness kit — playbook skills, thin-parent orchestration, cost routing, ICM shared memory, project bootstrap.",
  "category": "development",
  "source": {
    "source": "url",
    "url": "https://github.com/ashishpatill/grok-kit.git",
    "sha": "<40-char-main-sha>"
  },
  "homepage": "https://github.com/ashishpatill/grok-kit",
  "keywords": ["harness", "skills", "orchestration", "icm", "bootstrap", "grok"]
}
```

4. Run their scripts: `python3 scripts/generate-plugin-index.py && python3 scripts/validate-catalog.py`
5. Open a PR to `xai-org/plugin-marketplace`

Install after listing (Grok Build):

```bash
grok plugin marketplace list
grok plugin install grok-kit --trust
```
