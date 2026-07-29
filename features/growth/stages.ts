import type { TreeStage } from "@/lib/contracts";

const STAGE_THRESHOLDS: ReadonlyArray<{
  minimumUnits: number;
  stage: TreeStage;
}> = [
  { minimumUnits: 192, stage: "mature" },
  { minimumUnits: 96, stage: "established" },
  { minimumUnits: 48, stage: "young-tree" },
  { minimumUnits: 12, stage: "sapling" },
  { minimumUnits: 1, stage: "sprout" },
  { minimumUnits: 0, stage: "seed" },
];

export function stageForGrowthUnits(totalUnits: number): TreeStage {
  const safeUnits = Number.isFinite(totalUnits)
    ? Math.max(0, Math.floor(totalUnits))
    : 0;
  return (
    STAGE_THRESHOLDS.find(({ minimumUnits }) => safeUnits >= minimumUnits)
      ?.stage ?? "seed"
  );
}

export interface TreeDescriptionOptions {
  memoryCount?: number;
  branchCount?: number;
}

function naturalCount(value: number | undefined): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value ?? 0)) : 0;
}

function countPhrase(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

/**
 * A short, neutral description for the synchronized DOM tree navigator.
 * It describes visible botanical structure without exposing reflection quality.
 */
export function describeTreeStage(
  stage: TreeStage,
  options: TreeDescriptionOptions = {},
): string {
  const memories = naturalCount(options.memoryCount);
  const branches = naturalCount(options.branchCount);
  const memoryPhrase = countPhrase(memories, "memory", "memories");

  switch (stage) {
    case "seed":
      return "Cherry stone resting beneath the soil.";
    case "sprout":
      return memories > 0
        ? `Cherry sprout with its first leaves and ${memoryPhrase}.`
        : "Cherry sprout with its first leaves.";
    case "sapling":
      return memories > 0
        ? `Young cherry sapling holding ${memoryPhrase}.`
        : "Young cherry sapling with an asymmetric stem.";
    case "young-tree":
      return branches > 0
        ? `Young sakura with ${countPhrase(branches, "branch", "branches")} and ${memoryPhrase}.`
        : `Young sakura holding ${memoryPhrase}.`;
    case "established":
      return branches > 0
        ? `Established sakura with ${countPhrase(branches, "branch", "branches")} and ${memoryPhrase}.`
        : `Established sakura holding ${memoryPhrase}.`;
    case "mature":
      return branches > 0
        ? `Mature sakura with an open crown, ${countPhrase(branches, "branch", "branches")}, and ${memoryPhrase}.`
        : `Mature sakura with an open crown and ${memoryPhrase}.`;
  }
}

export function stageGrowthMessage(stage: TreeStage): {
  title: string;
  detail: string;
} {
  switch (stage) {
    case "seed":
      return {
        title: "A beginning rests in the garden.",
        detail: "Your reflection is safely held.",
      };
    case "sprout":
      return {
        title: "The first shoot has emerged.",
        detail: "Your reflection has become part of its beginning.",
      };
    case "sapling":
      return {
        title: "The young tree has found a new line.",
        detail: "Your reflection now lives within its growing form.",
      };
    case "young-tree":
      return {
        title: "The crown has opened a little further.",
        detail: "Your reflection has taken its place in the living tree.",
      };
    case "established":
      return {
        title: "New life has settled into the canopy.",
        detail: "Your reflection has taken its place in the living tree.",
      };
    case "mature":
      return {
        title: "The outer branches are still becoming.",
        detail: "Your reflection has taken its place in the living tree.",
      };
  }
}
