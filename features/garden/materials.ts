export const TREE_MATERIAL_FALLBACKS = {
  void: "#070914",
  indigo: "#10162B",
  wash: "#1A2140",
  moon: "#DDE5F7",
  moonMuted: "#AAB6D0",
  trunk: "#17131D",
  trunkHighlight: "#3D3042",
  blossom: "#F2B6CD",
  blossomLight: "#FFE0EB",
  blossomShadow: "#C77F9E",
  leaf: "#799F91",
} as const;

export interface GardenMaterialPalette {
  void: string;
  indigo: string;
  wash: string;
  moon: string;
  moonMuted: string;
  trunk: string;
  trunkHighlight: string;
  blossom: string;
  blossomLight: string;
  blossomShadow: string;
  leaf: string;
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
  };
}

