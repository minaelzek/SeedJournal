# Living Sakura still-pack — founder cutover gates

**Status:** capture tooling shipped; **founder visual approval still required**  
**Product renderer under review:** `gardenRenderer="living"`  
**Capture surface:** `/living-sakura` lab (clean query mode)  
**Output:** `.living-sakura/renders/*.png` (generated, gitignored)

This pack exists so no agent confidence score can substitute for human approval.
It implements the cutover gates in [`living-sakura-v2.md`](./living-sakura-v2.md).

---

## Lab capture URL contract

| Query | Meaning |
|-------|---------|
| `journals` / `count` | Completed journal count (0–10000+) |
| `view` | `front` · `threeQuarter` · `side` · `rear` |
| `yaw` | Degrees override (optional) |
| `units` | Newest growth units `1` · `2` · `4` · `6` |
| `clean=1` | Hide chrome; full-bleed stage for screenshots |
| `static=1` | Reduced motion / no idle wind (stable stills) |
| `structure=1` | Wood-only silhouette (no ambient organs / petals) |
| `reveal=1` | Growth ceremony mode |
| `seed` | Deterministic root seed string |

Example:

```
/living-sakura?journals=192&view=threeQuarter&clean=1&static=1
/living-sakura?journals=192&view=side&clean=1&static=1&structure=1
```

`data-capture-ready="true"` on `<main>` signals WebGL settle for Playwright.

---

## Gate checklist

Mark each gate only after reviewing the corresponding stills (or live demo).

| # | Gate | Evidence files / method | Founder |
|---|------|-------------------------|---------|
| 1 | Leafless mature silhouette — front, ¾, side, rear | `structure-front.png`, `structure-three-quarter.png`, `structure-side.png`, `structure-rear.png` | ☐ |
| 2 | Peak-bloom mature — same views | `peak-bloom-*.png` | ☐ |
| 3 | Life chapters: seed, sprout, sapling, young, established, mature, enduring | `stage-seed.png` … `stage-enduring-10k.png` | ☐ |
| 4 | 60s idle-life without obvious loop | Live lab (not auto-captured); manual screen record | ☐ |
| 5 | Pointer, touch, keyboard, memory attention | Lab interaction + `memory-keyboard-attention.png`; E2E smoke | ☐ |
| 6 | Simple + rich growth reveal, same starting tree | `reveal-quiet-units-1.png`, `reveal-deep-units-6.png` | ☐ |
| 7 | Reveal inside real journal completion flow | Product app post-reflection (`GrowthReveal` living mount) — manual | ☐ |
| 8 | Stable memories / development at 1, 193, 1k, 10k | `memories-1.png`, `memories-193.png`, `memories-1000.png`, `memories-10000.png` | ☐ |
| 9 | Desktop / mobile / reduced-motion + a11y | `integrated-*.png` + axe in still-pack E2E | ☐ |

**Decision:** Living Sakura remains shippable as product default only when gates
1–3, 5–9 are founder-checked and gate 4 is acceptable live. Gate 7 is required
before calling the emotional climax “the same living tree.”

---

## Generate the pack

```bash
# Preferred while iterating (dev server on :3000):
#   npm run dev
$env:SEED_JOURNAL_E2E_BASE_URL="http://127.0.0.1:3000"   # PowerShell
npm run still-pack:living-sakura
```

```bash
# Full path (builds + starts local Worker, then captures):
npm run still-pack:living-sakura
```

Stills land in [`.living-sakura/renders/`](../../.living-sakura/renders/README.md).

---

## Explicit non-substitutes

- Unit/topology test pass rates  
- Agent “confidence” scores  
- Prior img2threejs renders under `.img2threejs/renders/` (withdrawn prototype)  
- Illustration hero contract alone  

Only founder review of **this** living body closes P1-3.

---

## Implementation notes

- `structureOnly` on `createLivingSakuraModel` / `LivingSakuraScene` is lab-only;
  product garden never enables it.
- Life-stage stills use the **same** living topology language (progressive densify),
  not a hard maturity morph.
- Privacy: no journal body text is ever painted on the tree or into stills.
