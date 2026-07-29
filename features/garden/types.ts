import type {
  TreeAlgorithmVersion,
  TreeGrowthEvent,
  TreeSnapshot,
  TreeStage,
} from "@/lib/contracts";

export type Vec3Tuple = readonly [number, number, number];

export interface CubicBranch {
  id: string;
  parentId: string | null;
  order: number;
  start: Vec3Tuple;
  controlA: Vec3Tuple;
  controlB: Vec3Tuple;
  end: Vec3Tuple;
  radiusStart: number;
  radiusEnd: number;
  birthSequence: number;
  axisProgress: number;
  windWeight: number;
  barkVariation: number;
}

export type BotanicalOrganKind =
  | "seed"
  | "radicle"
  | "leaf"
  | "bud"
  | "blossom"
  | "luminous-blossom";

export interface FoliageNode {
  id: string;
  parentBranchId: string | null;
  position: Vec3Tuple;
  rotation: Vec3Tuple;
  scale: number;
  kind: BotanicalOrganKind;
  entryId: string | null;
  memoryRenderId: number;
  sequence: number;
  birthSequence: number;
  axisProgress: number;
  windWeight: number;
}

export interface TreeRevision {
  algorithmVersion: 2;
  lastSequence: number;
  fingerprint: string;
}

export interface TreeBounds {
  center: Vec3Tuple;
  radius: number;
}

/**
 * A worker-produced, render-ready swept mesh. Metadata arrays are vertex-sized;
 * `ranges` stores [vertexOffset, vertexCount, indexOffset, indexCount] per branch.
 */
export interface TransferableBranchBuffers {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
  ranges: Uint32Array;
  parentIndices: Int32Array;
  birthSequence: Uint32Array;
  axisProgress: Float32Array;
  windWeight: Float32Array;
  barkVariation: Float32Array;
}

/**
 * Compact instance data. Kind values are 0 seed, 1 radicle, 2 leaf, 3 bud,
 * 4 blossom, and 5 luminous blossom. Journal identifiers never enter buffers.
 */
export interface TransferableOrganBuffers {
  positions: Float32Array;
  rotations: Float32Array;
  scales: Float32Array;
  kinds: Uint8Array;
  birthSequence: Uint32Array;
  axisProgress: Float32Array;
  windWeight: Float32Array;
  memoryRenderIds: Uint32Array;
}

export interface MemoryHitRegion {
  renderId: number;
  eventId: string;
  entryId: string;
  position: Vec3Tuple;
  radius: number;
  birthSequence: number;
}

export interface ProjectedBranch {
  id: string;
  order: number;
  birthSequence: number;
  strokeWidth: number;
  points: readonly Vec3Tuple[];
}

export interface ProjectedOrgan {
  id: string;
  kind: BotanicalOrganKind;
  position: Vec3Tuple;
  rotation: number;
  scale: number;
  memoryRenderId: number;
}

export interface FallbackProjection {
  viewBox: readonly [number, number];
  seed: ProjectedOrgan;
  branches: ProjectedBranch[];
  organs: ProjectedOrgan[];
}

export interface TreeTopology {
  algorithmVersion: TreeAlgorithmVersion;
  stage: TreeStage;
  totalGrowthUnits: number;
  revision: TreeRevision;
  bounds: TreeBounds;
  branches: CubicBranch[];
  foliage: FoliageNode[];
  branchBuffers: TransferableBranchBuffers;
  organBuffers: TransferableOrganBuffers;
  memoryHitRegions: MemoryHitRegion[];
  fallbackProjection: FallbackProjection;
}

export type TreeRenderPackageV2 = TreeTopology & {
  algorithmVersion: 2;
  revision: TreeRevision;
};

export type QualityTier = "high" | "balanced" | "low";

export type TreeWorkerRequest =
  | {
      type: "init";
      requestId: number;
      snapshot: TreeSnapshot;
      quality: QualityTier;
    }
  | {
      type: "append";
      requestId: number;
      treeId: string;
      fromSequence: number;
      events: TreeGrowthEvent[];
      memoryLineage?: Record<string, string>;
    }
  | {
      type: "set-quality";
      requestId: number;
      quality: QualityTier;
    };

export type TreeWorkerResponse =
  | {
      type: "rebuilt";
      requestId: number;
      topology: TreeTopology;
    }
  | {
      type: "patched";
      requestId: number;
      previousSequence: number;
      nextSequence: number;
      topology: TreeTopology;
    }
  | {
      type: "resync-required";
      requestId: number;
      expectedSequence: number;
      receivedSequence: number;
    };

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
