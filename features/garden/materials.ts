/** Light-product sakura pigments — grey bark, soft pink blossoms, secondary leaf. */
export const TREE_MATERIAL_FALLBACKS = {
  void: "#f5f3ed",
  indigo: "#e8e9e1",
  wash: "#dfe6dc",
  moon: "#26332d",
  moonMuted: "#66716a",
  trunk: "#6a5a4e",
  trunkHighlight: "#8f7a68",
  bark: "#7a6a5c",
  blossom: "#e8a4b4",
  blossomLight: "#f7d4de",
  blossomShadow: "#c4788a",
  leaf: "#8fa892",
  leafSelected: "#a8c0ad",
  bud: "#d492a3",
  blossomSelected: "#fff0f4",
  stamen: "#d4b56a",
  barkLenticel: "#9a8878",
  seed: "#6a4b3f",
  seedHighlight: "#8c6a59",
  seedCrease: "#3a2a24",
  radicle: "#c9bca8",
  ground: "#c9bca9",
  soilRim: "#9e8973",
  materialNeutral: "#fffdfa",
} as const;

export interface GardenMaterialPalette {
  void: string;
  indigo: string;
  wash: string;
  moon: string;
  moonMuted: string;
  trunk: string;
  trunkHighlight: string;
  bark: string;
  blossom: string;
  blossomLight: string;
  blossomShadow: string;
  leaf: string;
  leafSelected: string;
  bud: string;
  blossomSelected: string;
  stamen: string;
  barkLenticel: string;
  seed: string;
  seedHighlight: string;
  seedCrease: string;
  radicle: string;
  ground: string;
  soilRim: string;
  materialNeutral: string;
}

export function readGardenMaterialPalette(): GardenMaterialPalette {
  if (typeof document === "undefined") return TREE_MATERIAL_FALLBACKS;
  const styles = getComputedStyle(document.documentElement);
  const value = (variable: string, fallback: string) =>
    styles.getPropertyValue(variable).trim() || fallback;

  return {
    void: value("--sj-color-void", TREE_MATERIAL_FALLBACKS.void),
    indigo: value("--sj-color-indigo", TREE_MATERIAL_FALLBACKS.indigo),
    wash: value("--sj-color-wash", TREE_MATERIAL_FALLBACKS.wash),
    moon: value("--sj-color-moon", TREE_MATERIAL_FALLBACKS.moon),
    moonMuted: value("--sj-color-moon-muted", TREE_MATERIAL_FALLBACKS.moonMuted),
    trunk: value("--sj-color-trunk", TREE_MATERIAL_FALLBACKS.trunk),
    trunkHighlight: value(
      "--sj-color-trunk-highlight",
      TREE_MATERIAL_FALLBACKS.trunkHighlight,
    ),
    bark: value("--sj-color-bark", TREE_MATERIAL_FALLBACKS.bark),
    blossom: value("--sj-color-blossom", TREE_MATERIAL_FALLBACKS.blossom),
    blossomLight: value(
      "--sj-color-blossom-light",
      TREE_MATERIAL_FALLBACKS.blossomLight,
    ),
    blossomShadow: value(
      "--sj-color-blossom-shadow",
      TREE_MATERIAL_FALLBACKS.blossomShadow,
    ),
    leaf: value("--sj-color-leaf", TREE_MATERIAL_FALLBACKS.leaf),
    leafSelected: value(
      "--sj-color-leaf-selected",
      TREE_MATERIAL_FALLBACKS.leafSelected,
    ),
    bud: value("--sj-color-bud", TREE_MATERIAL_FALLBACKS.bud),
    blossomSelected: value(
      "--sj-color-blossom-selected",
      TREE_MATERIAL_FALLBACKS.blossomSelected,
    ),
    stamen: value("--sj-color-stamen", TREE_MATERIAL_FALLBACKS.stamen),
    barkLenticel: value(
      "--sj-color-bark-lenticel",
      TREE_MATERIAL_FALLBACKS.barkLenticel,
    ),
    seed: value("--sj-color-seed", TREE_MATERIAL_FALLBACKS.seed),
    seedHighlight: value(
      "--sj-color-seed-highlight",
      TREE_MATERIAL_FALLBACKS.seedHighlight,
    ),
    seedCrease: value(
      "--sj-color-seed-crease",
      TREE_MATERIAL_FALLBACKS.seedCrease,
    ),
    radicle: value("--sj-color-radicle", TREE_MATERIAL_FALLBACKS.radicle),
    ground: value("--sj-color-garden-ground", TREE_MATERIAL_FALLBACKS.ground),
    soilRim: value("--sj-color-soil-rim", TREE_MATERIAL_FALLBACKS.soilRim),
    materialNeutral: value(
      "--sj-color-material-neutral",
      TREE_MATERIAL_FALLBACKS.materialNeutral,
    ),
  };
}
