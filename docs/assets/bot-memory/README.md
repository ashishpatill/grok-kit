# Bot memory console media

Synthetic stub screenshots and a short slideshow walkthrough of
`memory/console` (no Neon, no production memory text).

| File | Tab |
| --- | --- |
| `00-hero-console.png` | Review queue (above-the-fold) |
| `01-review-queue.png` | Review queue |
| `02-visible-recall.png` | Recall with provenance |
| `03-propose-gated.png` | Propose form |
| `04-hot-pin-preview.png` | Hot-pin export preview |
| `console-walkthrough.mp4` | ~12s slideshow |
| `console-walkthrough.webm` | Same, VP9 |

Regenerate (local):

```bash
cd memory && npm run console   # http://127.0.0.1:7432
# then headless Chrome / puppeteer-core against the stub UI
```
