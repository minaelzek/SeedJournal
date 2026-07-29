import type { TreeSnapshot, TreeStage } from "@/lib/contracts";
import type { TreeTopology, Vec3Tuple } from "../types";

type EnrichedTopology = TreeTopology & {
  stage?: TreeStage;
  bounds?: { center: Vec3Tuple; radius: number };
};

export function stageForGarden(
  snapshot: TreeSnapshot,
  topology: TreeTopology,
): TreeStage {
  const enriched = topology as EnrichedTopology;
  if (enriched.stage) return enriched.stage;
  const units = snapshot.events.reduce(
    (total, event) => total + event.growthUnits,
    0,
  );
  if (units === 0) return "seed";
  if (units <= 11) return "sprout";
  if (units <= 47) return "sapling";
  if (units <= 95) return "young-tree";
  if (units <= 191) return "established";
  return "mature";
}

export function boundsForGarden(
  topology: TreeTopology,
  stage: TreeStage,
): { center: Vec3Tuple; radius: number } {
  const enriched = topology as EnrichedTopology;
  if (enriched.bounds?.radius && Number.isFinite(enriched.bounds.radius)) {
    return enriched.bounds;
  }

  const radii: Record<TreeStage, number> = {
    seed: 0.48,
    sprout: 0.85,
    sapling: 2.15,
    "young-tree": 3.45,
    established: 4.25,
    mature: 4.9,
  };
  const centers: Record<TreeStage, Vec3Tuple> = {
    seed: [0, -2.72, 0],
    sprout: [0, -2.35, 0],
    sapling: [0, -1.35, 0],
    "young-tree": [0, -0.35, 0],
    established: [0, 0.05, 0],
    mature: [0, 0.15, 0],
  };
  return { center: centers[stage], radius: radii[stage] };
}

export function usesTreeRootContact(stage: TreeStage): boolean {
  return stage !== "seed" && stage !== "sprout";
}
