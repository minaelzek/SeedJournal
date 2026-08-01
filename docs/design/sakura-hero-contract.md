# Sakura Hero Contract

**Status:** frozen for illustration-first overhaul  
**Product:** Seed Journal  
**Bar:** Duolingo delight × Apple craft  
**Species:** Japanese flowering cherry (*Prunus serrulata*), stylized for UI

---

## One sentence

A living **sakura** sits at the center of Seed Journal; tender entries fill it gently, and deep insight opens **pink life** in a celebration you feel without reading.

---

## Species bible (non-negotiable)

| Element | Spec |
|---------|------|
| Blossoms | Soft pink / rose-white, **five petals**, warm stamen center |
| Luminous blossoms | Same sakura form + soft rose glow — never neon |
| Buds | Tight rose-pink tips |
| Leaves | Soft green, **secondary** once blooming stages begin |
| Trunk | Warm umber–greige bark, thick enough at phone size |
| Canopy | Cloud-like sakura mass — not sparse L-system sticks |
| Ground | Soft soil / mist disc |
| Motion | Gentle sway, petal drift; celebration = bloom unfurl + canopy expand |

### Forbidden

- Generic leafy oak / maple / pine  
- Leaf-dominant mature silhouettes  
- Dead-stick early progress  
- XP bars, scoreboards, confetti that hides the tree  
- Emoji cherry as the hero mark  

### Palette (maps to CSS tokens)

- Blossom: `--sj-color-blossom` / `--sj-color-blossom-light` / `--sj-color-blossom-shadow`  
- Bud: `--sj-color-bud`  
- Leaf: `--sj-color-leaf`  
- Trunk/bark: `--sj-color-trunk` / `--sj-color-bark`  
- Soil: `--sj-color-soil` / `--sj-color-garden-ground`  

---

## Stages (silhouette intent)

| Stage | Units (source of truth) | Look |
|-------|-------------------------|------|
| seed | 0 | Cherry stone + soil mound, soft pulse |
| sprout | 1–11 | Short shoot, first leaves, optional first buds — **already loved** |
| sapling | 12–47 | Cute trunk, first pink canopy tuft |
| young-tree | 48–95 | Clear V crown, readable sakura pink |
| established | 96–191 | Full rounded canopy, blossom-first |
| mature | 192+ | Dense hanami cloud, thick trunk, petal fall |

**Sakura density law:** from `sapling` upward, visual weight of blossoms ≥ leaves.

---

## Growth feel

| Insight depth | Memory form | Units | Visual intent |
|---------------|-------------|-------|---------------|
| Light | leaf | 1 | **micro** — fill, leaves, soft pulse |
| Moderate | bud | 2 | **micro** — buds + fill |
| Deep | blossom | 4 | **hanami** — pink surge |
| Full ritual | luminous-blossom | 6 | **hanami** + luminosity |
| Any stage threshold cross | — | — | **stage-cross** morph |

No XP numbers. Events remain the data spine.

---

## Motion language

| Intent | Duration | Feel |
|--------|----------|------|
| micro | 0.6–1.2s | Apple-calm density change |
| hanami | 1.4–2.2s | Duolingo joy — crown opens pink |
| stage-cross | 1.6–2.4s | Silhouette becomes next stage |
| reduced-motion | ~0s morph | Crossfade / instant end state |

Easing: enter `cubic-bezier(0.22, 1, 0.36, 1)`.

---

## Anti-patterns (QA fail)

1. Barren stick after 1–3 leaf sessions  
2. Mature tree that reads “green bush” not sakura  
3. Celebration that is only an icon toast  
4. WebGL required for home  
5. Score / streak number chrome on the hero  

---

## Acceptance gates

- Blind ID: “sakura / cherry blossom” after sprout  
- Early love: three leaf entries never “dead stick”  
- Deep insight: hanami or stage-cross always  
- Home works without WebGL  

---

## Implementation status (2026-07-31 overhaul)

| Surface | Status |
|---------|--------|
| Presentation model (knobs, counts, morph intents) | Shipped — aggressive early density |
| IllustratedSakura v2 (filled trunk, pink canopy, seed character) | Shipped — product default |
| GrowthReveal morph theater | Shipped — before→after + leap petals |
| AppFrame illustration default | Shipped (`gardenRenderer="illustration"`) |
| Care copy sakura language | Shipped |
| WebGL demotion | Behind `gardenRenderer="webgl"` only |

**Still polishable:** hand-tuned Rive/Lottie, device screenshot matrix, further Three.js code-split.