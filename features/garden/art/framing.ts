import type { TreeStage } from "@/lib/contracts";

export const GARDEN_VERTICAL_FOV_DEGREES = 32;

export function gardenCameraDistance(input: {
  stage: TreeStage;
  boundsRadius: number;
  width: number;
  height: number;
}): number {
  const { stage, boundsRadius, width, height } = input;
  const compact = width < 600;
  if (stage === "seed") return compact ? 8.5 : 10.8;

  const landscapeCompensation =
    width / Math.max(height, 1) > 1.4 ? 1.18 : 1.25;
  // Slightly closer for denser sakura crown so flowers fill optical center.
  // Established/mature desktop formula stays 1 (tests lock horizontal fit).
  const stageDistanceScale =
    stage === "sprout"
      ? 1.3
      : stage === "sapling"
        ? 1.68
        : stage === "young-tree"
          ? 1.14
          : 1;
  const minimum = stage === "sprout" ? (compact ? 7.4 : 9.2) : 5.2;
  const verticalFitDistance =
    (boundsRadius /
      Math.tan((GARDEN_VERTICAL_FOV_DEGREES * Math.PI) / 360)) *
    landscapeCompensation *
    stageDistanceScale;
  const aspect = width / Math.max(height, 1);
  const horizontalFitDistance =
    stage === "established" || stage === "mature"
      ? boundsRadius /
        (Math.tan((GARDEN_VERTICAL_FOV_DEGREES * Math.PI) / 360) * aspect) *
        1.11
      : 0;
  return Math.min(
    48,
    Math.max(minimum, verticalFitDistance, horizontalFitDistance),
  );
}

export function gardenLookAtY(input: {
  stage: TreeStage;
  totalGrowthUnits: number;
  centerY: number;
  boundsRadius: number;
  width: number;
}): number {
  const { stage, totalGrowthUnits, centerY, boundsRadius, width } = input;
  const compact = width < 600;
  if (stage === "seed") return centerY + (compact ? 0.52 : 0.62);
  if (stage === "sprout") {
    const progress = Math.min(
      1,
      Math.max(0, (totalGrowthUnits - 1) / 10),
    );
    const initial = compact ? -2.2 : -2.1;
    const eventual = centerY - boundsRadius * 0.28;
    return initial + (eventual - initial) * progress;
  }
  if (stage === "sapling") return centerY - boundsRadius * 0.28;
  return centerY;
}

export function gardenOrganPresentationScale(
  stage: TreeStage,
  width: number,
): number {
  return width < 600 && (stage === "established" || stage === "mature")
    ? 1.55
    : 1;
}
