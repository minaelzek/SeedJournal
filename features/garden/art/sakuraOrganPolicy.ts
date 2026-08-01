import type { TreeStage } from "@/lib/contracts";
import type { BotanicalOrganKind } from "../types";

/**
 * Sakura species identity for ambient (non-memory) organs.
 * Japanese cherry is read by soft pink blossoms + buds; leaves are secondary.
 * Pure + deterministic given the same stage and unit random in [0, 1).
 */
export type AmbientSakuraKind = Extract<
  BotanicalOrganKind,
  "leaf" | "bud" | "blossom"
>;

/** Target ambient mixes — locked by unit tests (approximate bands). */
export const SAKURA_AMBIENT_MIX: Readonly<
  Record<
    Exclude<TreeStage, "seed">,
    Readonly<{ blossom: number; bud: number; leaf: number }>
  >
> = {
  sprout: { blossom: 0, bud: 0.35, leaf: 0.65 },
  sapling: { blossom: 0.28, bud: 0.42, leaf: 0.3 },
  "young-tree": { blossom: 0.55, bud: 0.25, leaf: 0.2 },
  established: { blossom: 0.62, bud: 0.22, leaf: 0.16 },
  mature: { blossom: 0.68, bud: 0.2, leaf: 0.12 },
};

/**
 * Pick ambient organ kind for a stage from a single unit random [0, 1).
 * Memory organs are chosen separately by growth event kind.
 */
export function ambientOrganKind(
  stage: TreeStage,
  unitRandom: number,
): AmbientSakuraKind {
  const t = Number.isFinite(unitRandom)
    ? Math.min(1, Math.max(0, unitRandom))
    : 0;
  if (stage === "seed") return "leaf";

  const mix = SAKURA_AMBIENT_MIX[stage];
  if (t < mix.blossom) return "blossom";
  if (t < mix.blossom + mix.bud) return "bud";
  return "leaf";
}

/**
 * Presentation scale multipliers for OrganInstances (applied after node.scale).
 * Blossoms must read as the species mark; leaves stay secondary.
 */
export function sakuraOrganScale(
  kind: BotanicalOrganKind,
  stage: TreeStage = "young-tree",
): number {
  const matureBoost =
    stage === "established" || stage === "mature"
      ? 1.08
      : stage === "young-tree"
        ? 1.04
        : 1;

  switch (kind) {
    case "radicle":
      return 0.52;
    case "seed":
      return 0.9;
    case "leaf":
      // Secondary — smaller than the old 0.36 leaf-dominant look.
      return 0.22 * matureBoost;
    case "bud":
      return 0.34 * matureBoost;
    case "blossom":
    case "luminous-blossom":
      // Primary sakura mark — was 0.19 and unreadable.
      return 0.42 * matureBoost;
    default:
      return 0.3;
  }
}

/** Falling petal budget by quality tier (species atmosphere without overdraw). */
export function sakuraPetalBudget(
  quality: "high" | "balanced" | "low",
  weatherCap: number,
): number {
  const qualityCap =
    quality === "high" ? 48 : quality === "balanced" ? 28 : 12;
  return Math.min(qualityCap, Math.max(2, weatherCap));
}

/**
 * Share of blossom-like organs (blossom + luminous + bud) among ambient kinds.
 * Used for identity assertions in tests and audits.
 */
export function sakuraFloralShare(
  kinds: readonly BotanicalOrganKind[],
): number {
  if (kinds.length === 0) return 0;
  const floral = kinds.filter(
    (kind) =>
      kind === "blossom" ||
      kind === "luminous-blossom" ||
      kind === "bud",
  ).length;
  return floral / kinds.length;
}
