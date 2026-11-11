# Sakura Hero Contract

**Status:** product default = Living Sakura v2; seed mark if WebGL is unavailable  
**Product:** Seed Journal  
**Bar:** 100k MMR — Duolingo delight × Meta product craft × Apple restraint × Japanese zen stage  
**Species:** Japanese flowering cherry (*Prunus serrulata*), stylized for UI

---

## Product renderer (code truth)

| Tier | When |
|------|------|
| **Living Sakura v2** | Product default (`AppFrame` `gardenRenderer="living"`) |
| **Static seed mark** | WebGL unavailable / context lost / living error |

Lab renderers (legacy WebGL, img2threejs) are diagnostic only — never re-promoted as hero.

## One sentence

A living **sakura** sits at the center of Seed Journal; every intentional journal grows the same companion; nurture is witnessed as botanical ceremony — never streaks, XP, or grades.

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
| Ground | Zen micro-stage: soft soil mound + gravel wash (never a toy root ball) |
| Memory petals | On wood via short pedicel; equal beauty; never free-air float |
| Motion | Hierarchical wind + attention breath; ceremony = path → wood → organs → settle |

### Forbidden

- Generic leafy oak / maple / pine  
- Leaf-dominant mature silhouettes  
- Dead-stick early progress / barren single trunk after first care  
- Dodecahedron / ball root props under the trunk  
- Floating memory petals off wood  
- XP bars, scoreboards, confetti that hides the tree  
- Grade-ladder UI language (leaf → bud → blossom ranking)  
- Emoji cherry as the hero mark  
- Sterile product void without garden stage  

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

## Implementation status (2026-08-06)

| Surface | Status |
|---------|--------|
| Living Sakura v2 product garden | **Product default** (`gardenRenderer="living"`) |
| Growth reveal on same Canvas | Shipped — `revealMode` on home body + hostGarden overlay |
| Full ceremony (path → wood → organs) | In progress — schedule applied to real path/organs |
| Seed mark (`GardenFallback`) | Last resort when WebGL is unavailable |
| Founder still-pack visual YES | Open — see `living-sakura-still-pack.md` |
| Care copy sakura language | Shipped; equal-beauty flourish copy (no grade ladder) |

**Still polishable:** sapling+ adult mesh firm-YES, courtyard materials, presence/reunion, dock collisions.

**Life chapters (2026-08-14):** journals 0–11 are a seed / tender sprout, not a scaled mature vase. Adult topology begins at the sapling gate (12).

**Auth (2026-08-14):** Google + Apple session sign-in is the product path. Passphrase vault is no longer shown. Welcome should show the same seed as first-open.