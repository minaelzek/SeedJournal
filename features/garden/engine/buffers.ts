import type { TreeAlgorithmVersion, TreeStage } from "@/lib/contracts";
import type {
  CubicBranch,
  FallbackProjection,
  FoliageNode,
  MemoryHitRegion,
  QualityTier,
  TransferableBranchBuffers,
  TransferableOrganBuffers,
  TreeBounds,
  TreeTopology,
  Vec3Tuple,
} from "../types";
import {
  add,
  clamp,
  cross,
  cubicTangent,
  distance,
  dot,
  lerp,
  multiply,
  normalize,
  sampleCubic,
  TAU,
  xmur3,
} from "./math";

const ORGAN_KIND: Record<FoliageNode["kind"], number> = {
  seed: 0,
  radicle: 1,
  leaf: 2,
  bud: 3,
  blossom: 4,
  "luminous-blossom": 5,
};

const QUALITY_MESH = {
  low: { radial: 5, length: 5 },
  balanced: { radial: 7, length: 7 },
  high: { radial: 9, length: 9 },
} as const;

const QUALITY_ORGAN_CAP = {
  low: 1_800,
  balanced: 4_000,
  high: 8_000,
} as const;

function branchFrame(
  tangent: Vec3Tuple,
  previousNormal: Vec3Tuple | null,
): { normal: Vec3Tuple; binormal: Vec3Tuple } {
  if (previousNormal) {
    const projected = add(
      previousNormal,
      multiply(tangent, -dot(previousNormal, tangent)),
    );
    if (Math.hypot(...projected) > 1e-5) {
      const normal = normalize(projected);
      return { normal, binormal: normalize(cross(tangent, normal)) };
    }
  }
  const reference: Vec3Tuple =
    Math.abs(tangent[1]) < 0.88 ? [0, 1, 0] : [1, 0, 0];
  const normal = normalize(cross(reference, tangent));
  return { normal, binormal: normalize(cross(tangent, normal)) };
}

export function createBranchBuffers(
  branches: readonly CubicBranch[],
  quality: QualityTier,
): TransferableBranchBuffers {
  const resolution = QUALITY_MESH[quality];
  const verticesPerBranch = (resolution.length + 1) * resolution.radial;
  const indicesPerBranch = resolution.length * resolution.radial * 6;
  const vertexCount = verticesPerBranch * branches.length;
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const indices = new Uint32Array(indicesPerBranch * branches.length);
  const ranges = new Uint32Array(branches.length * 4);
  const parentIndices = new Int32Array(branches.length);
  const birthSequence = new Uint32Array(vertexCount);
  const axisProgress = new Float32Array(vertexCount);
  const windWeight = new Float32Array(vertexCount);
  const barkVariation = new Float32Array(vertexCount);
  const indexById = new Map(branches.map((branch, index) => [branch.id, index]));

  let vertexOffset = 0;
  let indexOffset = 0;
  branches.forEach((branch, branchIndex) => {
    ranges.set(
      [vertexOffset, verticesPerBranch, indexOffset, indicesPerBranch],
      branchIndex * 4,
    );
    parentIndices[branchIndex] =
      branch.parentId === null ? -1 : (indexById.get(branch.parentId) ?? -1);
    let previousNormal: Vec3Tuple | null = null;

    for (let row = 0; row <= resolution.length; row += 1) {
      const amount = row / resolution.length;
      const center = sampleCubic(branch, amount);
      const tangent = cubicTangent(branch, amount);
      const frame = branchFrame(tangent, previousNormal);
      previousNormal = frame.normal;
      // The first two rings flare subtly into a branch collar.
      const collar = 1 + Math.max(0, 1 - amount * 5) * (branch.order > 0 ? 0.22 : 0.08);
      const radius =
        lerp(branch.radiusStart, branch.radiusEnd, amount) * collar;

      for (let side = 0; side < resolution.radial; side += 1) {
        const angle = (side / resolution.radial) * TAU;
        const radial = add(
          multiply(frame.normal, Math.cos(angle)),
          multiply(frame.binormal, Math.sin(angle)),
        );
        const vertex = vertexOffset + row * resolution.radial + side;
        const point = add(center, multiply(radial, radius));
        positions.set(point, vertex * 3);
        normals.set(radial, vertex * 3);
        uvs.set([side / resolution.radial, amount], vertex * 2);
        birthSequence[vertex] = branch.birthSequence;
        axisProgress[vertex] = clamp(
          branch.axisProgress + amount * 0.08,
          0,
          1,
        );
        windWeight[vertex] = branch.windWeight * amount;
        barkVariation[vertex] = branch.barkVariation;
      }
    }

    for (let row = 0; row < resolution.length; row += 1) {
      for (let side = 0; side < resolution.radial; side += 1) {
        const nextSide = (side + 1) % resolution.radial;
        const a = vertexOffset + row * resolution.radial + side;
        const b = vertexOffset + row * resolution.radial + nextSide;
        const c = vertexOffset + (row + 1) * resolution.radial + side;
        const d = vertexOffset + (row + 1) * resolution.radial + nextSide;
        indices.set([a, c, b, b, c, d], indexOffset);
        indexOffset += 6;
      }
    }
    vertexOffset += verticesPerBranch;
  });

  return {
    positions,
    normals,
    uvs,
    indices,
    ranges,
    parentIndices,
    birthSequence,
    axisProgress,
    windWeight,
    barkVariation,
  };
}

export function createOrganBuffers(
  foliage: readonly FoliageNode[],
  quality: QualityTier,
): TransferableOrganBuffers {
  const cap = QUALITY_ORGAN_CAP[quality];
  const memories = foliage.filter((organ) => organ.memoryRenderId > 0);
  const anonymous = foliage.filter((organ) => organ.memoryRenderId === 0);
  const visible =
    foliage.length <= cap
      ? [...foliage]
      : [
          ...anonymous.slice(0, Math.max(0, cap - memories.length)),
          ...memories,
        ];
  const positions = new Float32Array(visible.length * 3);
  const rotations = new Float32Array(visible.length * 3);
  const scales = new Float32Array(visible.length);
  const kinds = new Uint8Array(visible.length);
  const birthSequence = new Uint32Array(visible.length);
  const axisProgress = new Float32Array(visible.length);
  const windWeight = new Float32Array(visible.length);
  const memoryRenderIds = new Uint32Array(visible.length);

  visible.forEach((organ, index) => {
    positions.set(organ.position, index * 3);
    rotations.set(organ.rotation, index * 3);
    scales[index] = organ.scale;
    kinds[index] = ORGAN_KIND[organ.kind];
    birthSequence[index] = organ.birthSequence;
    axisProgress[index] = organ.axisProgress;
    windWeight[index] = organ.windWeight;
    memoryRenderIds[index] = organ.memoryRenderId;
  });

  return {
    positions,
    rotations,
    scales,
    kinds,
    birthSequence,
    axisProgress,
    windWeight,
    memoryRenderIds,
  };
}

function computeBounds(
  branches: readonly CubicBranch[],
  foliage: readonly FoliageNode[],
): TreeBounds {
  const points: Vec3Tuple[] = [
    ...branches.flatMap((branch) => [
      branch.start,
      branch.controlA,
      branch.controlB,
      branch.end,
    ]),
    ...foliage.map((organ) => organ.position),
  ];
  if (points.length === 0) return { center: [0, -2.72, 0], radius: 0.42 };
  const minimum: [number, number, number] = [...points[0]];
  const maximum: [number, number, number] = [...points[0]];
  points.forEach((point) => {
    for (let axis = 0; axis < 3; axis += 1) {
      minimum[axis] = Math.min(minimum[axis], point[axis]);
      maximum[axis] = Math.max(maximum[axis], point[axis]);
    }
  });
  const center: Vec3Tuple = [
    (minimum[0] + maximum[0]) / 2,
    (minimum[1] + maximum[1]) / 2,
    (minimum[2] + maximum[2]) / 2,
  ];
  return {
    center,
    radius: Math.max(
      0.42,
      ...points.map((point) => distance(point, center)),
    ),
  };
}

function createFallbackProjection(
  branches: readonly CubicBranch[],
  foliage: readonly FoliageNode[],
  bounds: TreeBounds,
): FallbackProjection {
  const width = 400;
  const height = 340;
  const scale = Math.min(52, 138 / Math.max(bounds.radius, 0.42));
  const project = (point: Vec3Tuple): Vec3Tuple => [
    width / 2 + (point[0] - bounds.center[0]) * scale,
    height / 2 - (point[1] - bounds.center[1]) * scale,
    0,
  ];
  const seed =
    foliage.find((organ) => organ.kind === "seed") ??
    {
      id: "seed",
      parentBranchId: null,
      kind: "seed",
      position: [0, -2.72, 0] as Vec3Tuple,
      rotation: [0, 0, 0] as Vec3Tuple,
      scale: 1,
      entryId: null,
      memoryRenderId: 0,
      sequence: 0,
      birthSequence: 0,
      axisProgress: 0,
      windWeight: 0,
    };
  return {
    viewBox: [width, height],
    seed: {
      id: seed.id,
      kind: "seed",
      position: project(seed.position),
      rotation: seed.rotation[2],
      scale: seed.scale,
      memoryRenderId: 0,
    },
    branches: branches.map((branch) => ({
      id: branch.id,
      order: branch.order,
      birthSequence: branch.birthSequence,
      strokeWidth: branch.radiusStart * scale * 1.5,
      points: Array.from({ length: 9 }, (_, index) =>
        project(sampleCubic(branch, index / 8)),
      ),
    })),
    organs: foliage
      .filter((organ) => organ.kind !== "seed")
      .map((organ) => ({
        id: organ.id,
        kind: organ.kind,
        position: project(organ.position),
        rotation: organ.rotation[2],
        scale: organ.scale,
        memoryRenderId: organ.memoryRenderId,
      })),
  };
}

export function logicalFingerprint(
  algorithmVersion: TreeAlgorithmVersion,
  stage: TreeStage,
  branches: readonly CubicBranch[],
  foliage: readonly FoliageNode[],
  lastSequence: number,
): string {
  const normalized = JSON.stringify(
    { algorithmVersion, stage, lastSequence, branches, foliage },
    (_key, value) =>
      typeof value === "number" ? Number(value.toFixed(6)) : value,
  );
  return xmur3(normalized)().toString(16).padStart(8, "0");
}

export function finalizeTopology(input: {
  algorithmVersion: TreeAlgorithmVersion;
  stage: TreeStage;
  totalGrowthUnits: number;
  lastSequence: number;
  branches: CubicBranch[];
  foliage: FoliageNode[];
  quality: QualityTier;
}): TreeTopology {
  const bounds = computeBounds(input.branches, input.foliage);
  const fingerprint = logicalFingerprint(
    input.algorithmVersion,
    input.stage,
    input.branches,
    input.foliage,
    input.lastSequence,
  );
  const memoryHitRegions: MemoryHitRegion[] = input.foliage.flatMap((organ) =>
    organ.entryId
      ? [
          {
            renderId: organ.memoryRenderId,
            eventId: organ.id,
            entryId: organ.entryId,
            position: organ.position,
            radius: Math.max(0.14, organ.scale * 0.22),
            birthSequence: organ.birthSequence,
          },
        ]
      : [],
  );
  return {
    algorithmVersion: input.algorithmVersion,
    stage: input.stage,
    totalGrowthUnits: input.totalGrowthUnits,
    revision: {
      algorithmVersion: 2,
      lastSequence: input.lastSequence,
      fingerprint,
    },
    bounds,
    branches: input.branches,
    foliage: input.foliage,
    branchBuffers: createBranchBuffers(input.branches, input.quality),
    organBuffers: createOrganBuffers(input.foliage, input.quality),
    memoryHitRegions,
    fallbackProjection: createFallbackProjection(
      input.branches,
      input.foliage,
      bounds,
    ),
  };
}

export function topologyTransferables(
  topology: TreeTopology,
): Transferable[] {
  return [
    topology.branchBuffers.positions.buffer,
    topology.branchBuffers.normals.buffer,
    topology.branchBuffers.uvs.buffer,
    topology.branchBuffers.indices.buffer,
    topology.branchBuffers.ranges.buffer,
    topology.branchBuffers.parentIndices.buffer,
    topology.branchBuffers.birthSequence.buffer,
    topology.branchBuffers.axisProgress.buffer,
    topology.branchBuffers.windWeight.buffer,
    topology.branchBuffers.barkVariation.buffer,
    topology.organBuffers.positions.buffer,
    topology.organBuffers.rotations.buffer,
    topology.organBuffers.scales.buffer,
    topology.organBuffers.kinds.buffer,
    topology.organBuffers.birthSequence.buffer,
    topology.organBuffers.axisProgress.buffer,
    topology.organBuffers.windWeight.buffer,
    topology.organBuffers.memoryRenderIds.buffer,
  ];
}
