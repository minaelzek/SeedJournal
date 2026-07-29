import type { TreeSnapshot } from "@/lib/contracts";
import type {
  CubicBranch,
  QualityTier,
  TreeTopology,
} from "./types";
import {
  lerp,
  sampleCubic,
  seededRandom,
} from "./engine/math";
import { buildTreeTopologyV1 } from "./engine/v1";
import {
  buildTreeTopologyV2,
  TreeEngineV2,
  treeStageForUnits,
} from "./engine/v2";

/**
 * Synchronous, worker-equivalent fallback. Algorithm 1 is frozen for fixtures;
 * every newly provisioned tree should use the append-stable V2 engine.
 */
export function buildTreeTopology(
  snapshot: TreeSnapshot,
  quality: QualityTier = "balanced",
): TreeTopology {
  switch (snapshot.algorithmVersion) {
    case 1:
      return buildTreeTopologyV1(snapshot, quality);
    case 2:
      return buildTreeTopologyV2(snapshot, quality);
    default:
      throw new Error(
        `Unsupported tree algorithm version: ${String(snapshot.algorithmVersion)}`,
      );
  }
}

export function topologyFingerprint(topology: TreeTopology): string {
  return topology.revision.fingerprint;
}

export function branchRadiusAt(
  branch: CubicBranch,
  amount: number,
): number {
  return lerp(branch.radiusStart, branch.radiusEnd, amount);
}

export {
  sampleCubic,
  seededRandom,
  TreeEngineV2,
  treeStageForUnits,
};
