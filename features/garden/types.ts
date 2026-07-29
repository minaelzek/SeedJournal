import type { TreeGrowthEvent, TreeSnapshot } from "@/lib/contracts";

export type Vec3Tuple = readonly [number, number, number];

export interface CubicBranch {
  id: string;
  start: Vec3Tuple;
  controlA: Vec3Tuple;
  controlB: Vec3Tuple;
  end: Vec3Tuple;
  radiusStart: number;
  radiusEnd: number;
}

export interface FoliageNode {
  id: string;
  position: Vec3Tuple;
  rotation: Vec3Tuple;
  scale: number;
  kind: "leaf" | "bud" | "blossom" | "luminous-blossom";
  entryId: string | null;
  sequence: number;
}

export interface TreeTopology {
  algorithmVersion: 1;
  branches: CubicBranch[];
  foliage: FoliageNode[];
}

export interface TreeWorkerRequest {
  type: "build";
  requestId: number;
  snapshot: TreeSnapshot;
}

export interface TreeWorkerResponse {
  type: "built";
  requestId: number;
  topology: TreeTopology;
}

export type QualityTier = "high" | "balanced" | "low";

export interface TreeMemory {
  entryId: string;
  eventId: string;
  occurredAt: number;
  form: "leaf" | "bud" | "blossom" | "luminous-blossom";
}

export function isMemoryEvent(
  event: TreeGrowthEvent,
): event is TreeGrowthEvent & { entryId: string } {
  return event.entryId !== null && event.kind.startsWith("memory_");
}

