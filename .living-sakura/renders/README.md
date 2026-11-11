# Living Sakura still-pack renders

Founder cutover visual evidence for the Living Sakura product renderer.

**Do not promote Living Sakura as the sole production hero until a human founder
reviews these stills against the gates in**
[`docs/design/living-sakura-still-pack.md`](../../docs/design/living-sakura-still-pack.md).

## Generate

```bash
# Dev server already running on 127.0.0.1:3000:
set SEED_JOURNAL_E2E_BASE_URL=http://127.0.0.1:3000
npm run still-pack:living-sakura

# Or let Playwright start the built server (slower):
npm run still-pack:living-sakura
```

PNG files are written here and gitignored (large binaries). Keep this README.

## Expected filenames

| File pattern | Gate |
|---|---|
| `stage-*.png` | Life chapters (seed → enduring) |
| `peak-bloom-*.png` | Mature bloom orbit |
| `structure-*.png` | Leafless wood silhouette orbit |
| `memories-*.png` | Stable development at 1 / 193 / 1k / 10k |
| `reveal-*.png` | Quiet vs deep ceremony stills |
| `integrated-*.png` | Desktop / mobile / reduced-motion |
| `memory-keyboard-attention.png` | Keyboard memory focus |
