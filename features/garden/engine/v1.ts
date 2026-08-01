import type {
  GrowthKind,
  TreeGrowthEvent,
  TreeSnapshot,
} from "@/lib/contracts";
import type {
  CubicBranch,
  FoliageNode,
  QualityTier,
  TreeTopology,
  Vec3Tuple,
} from "../types";
import { ambientOrganKind } from "../art/sakuraOrganPolicy";
import { finalizeTopology } from "./buffers";
import {
  add,
  multiply,
  sampleCubic,
  seededRandom,
  TAU,
} from "./math";

const BASE_LIMBS = 5;

function legacyBranch(
  branch: Omit<
    CubicBranch,
    | "parentId"
    | "order"
    | "birthSequence"
    | "axisProgress"
    | "windWeight"
    | "barkVariation"
  >,
  metadata: Partial<CubicBranch> = {},
): CubicBranch {
  return {
    parentId: null,
    order: 0,
    birthSequence: 0,
    axisProgress: 0.5,
    windWeight: 0.08,
    barkVariation: 0.5,
    ...branch,
    ...metadata,
  };
}

function createBaseBranches(rootSeed: string): CubicBranch[] {
  const random = seededRandom(`base:${rootSeed}`);
  const branches: CubicBranch[] = [
    legacyBranch({
      id: "trunk",
      start: [0, -3.15, 0],
      controlA: [-0.22, -1.3, 0.12],
      controlB: [0.46, 0.55, -0.22],
      end: [0.18, 2.45, 0],
      radiusStart: 0.56,
      radiusEnd: 0.2,
    }),
  ];
  for (let index = 0; index < BASE_LIMBS; index += 1) {
    const side = index % 2 === 0 ? -1 : 1;
    const height = -0.15 + index * 0.51 + random() * 0.22;
    const angle = side * (0.58 + random() * 0.42);
    const length = 2.35 + random() * 1.2;
    const start: Vec3Tuple = [
      0.1 + side * random() * 0.18,
      height,
      (random() - 0.5) * 0.24,
    ];
    const direction: Vec3Tuple = [
      Math.sin(angle),
      0.48 + random() * 0.3,
      (random() - 0.5) * 0.48,
    ];
    const end = add(start, multiply(direction, length));
    branches.push(
      legacyBranch(
        {
          id: `limb-${index}`,
          start,
          controlA: add(start, [
            direction[0] * length * 0.34,
            length * (0.24 + random() * 0.1),
            direction[2] * length * 0.2,
          ]),
          controlB: add(start, [
            direction[0] * length * 0.74,
            length * (0.39 + random() * 0.12),
            direction[2] * length * 0.76,
          ]),
          end,
          radiusStart: 0.23 - index * 0.013,
          radiusEnd: 0.055,
        },
        {
          id: `limb-${index}`,
          parentId: "trunk",
          order: 1,
          axisProgress: 0.35 + index * 0.11,
          windWeight: 0.26,
          barkVariation: random(),
        },
      ),
    );
  }
  return branches;
}

function attachment(
  branches: CubicBranch[],
  event: TreeGrowthEvent,
): { branch: CubicBranch; position: Vec3Tuple } {
  const random = seededRandom(`attachment:${event.seed}:${event.sequence}`);
  const branch = branches[1 + Math.floor(random() * (branches.length - 1))];
  return { branch, position: sampleCubic(branch, 0.44 + random() * 0.52) };
}

function createGrowthBranch(
  branches: CubicBranch[],
  event: TreeGrowthEvent,
): CubicBranch {
  const random = seededRandom(`branch:${event.seed}:${event.sequence}`);
  const attached = attachment(branches, event);
  const outward = Math.sign(attached.position[0] || random() - 0.5);
  const length =
    event.kind === "branch" ? 1.65 + random() * 0.65 : 0.82 + random() * 0.48;
  const direction: Vec3Tuple = [
    outward * (0.6 + random() * 0.4),
    0.45 + random() * 0.5,
    (random() - 0.5) * 0.82,
  ];
  const end = add(attached.position, multiply(direction, length));
  return legacyBranch(
    {
      id: `growth-${event.id}`,
      start: attached.position,
      controlA: add(attached.position, [
        direction[0] * length * 0.32,
        length * 0.18,
        direction[2] * length * 0.22,
      ]),
      controlB: add(attached.position, [
        direction[0] * length * 0.68,
        length * 0.5,
        direction[2] * length * 0.72,
      ]),
      end,
      radiusStart: event.kind === "branch" ? 0.105 : 0.067,
      radiusEnd: 0.022,
    },
    {
      id: `growth-${event.id}`,
      parentId: attached.branch.id,
      order: attached.branch.order + 1,
      birthSequence: event.sequence,
      axisProgress: 0.75,
      windWeight: 0.64,
      barkVariation: random(),
    },
  );
}

function memoryKind(kind: GrowthKind): FoliageNode["kind"] | null {
  switch (kind) {
    case "leaf":
    case "memory_leaf":
      return "leaf";
    case "memory_bud":
      return "bud";
    case "memory_blossom":
      return "blossom";
    case "memory_luminous_blossom":
      return "luminous-blossom";
    default:
      return null;
  }
}

function legacyOrgan(
  input: Pick<
    FoliageNode,
    "id" | "position" | "rotation" | "scale" | "kind" | "entryId" | "sequence"
  >,
  parentBranchId: string,
): FoliageNode {
  return {
    ...input,
    parentBranchId,
    memoryRenderId: input.entryId
      ? seededRandom(`legacy-memory:${input.id}`)() * 0xffffffff
      : 0,
    birthSequence: input.sequence,
    axisProgress: 0.78,
    windWeight: 0.72,
  };
}

function createFoliage(
  branches: CubicBranch[],
  event: TreeGrowthEvent,
): FoliageNode | null {
  const kind = memoryKind(event.kind);
  if (!kind) return null;
  const random = seededRandom(`foliage:${event.seed}:${event.sequence}`);
  const branch = branches[1 + Math.floor(random() * (branches.length - 1))];
  const anchor = sampleCubic(branch, 0.58 + random() * 0.4);
  const angle = random() * TAU;
  return legacyOrgan(
    {
      id: event.id,
      position: add(anchor, [
        Math.cos(angle) * (0.12 + random() * 0.22),
        (random() - 0.15) * 0.24,
        Math.sin(angle) * (0.12 + random() * 0.22),
      ]),
      rotation: [random() * 0.7, angle, (random() - 0.5) * 0.9],
      scale:
        kind === "leaf"
          ? 0.72 + random() * 0.34
          : kind === "bud"
            ? 0.78 + random() * 0.2
            : 0.88 + random() * 0.28,
      kind,
      entryId: event.entryId,
      sequence: event.sequence,
    },
    branch.id,
  );
}

function createAmbientFoliage(
  rootSeed: string,
  branches: CubicBranch[],
): FoliageNode[] {
  const random = seededRandom(`ambient:${rootSeed}`);
  return Array.from({ length: 84 }, (_, index) => {
    const branch = branches[1 + Math.floor(random() * (branches.length - 1))];
    const position = sampleCubic(branch, 0.38 + random() * 0.61);
    const angle = random() * TAU;
    // Mature ambient dressing for v1 full rebuild — sakura-forward mix.
    const kind = ambientOrganKind("mature", random());
    return legacyOrgan(
      {
        id: `ambient-${index}`,
        position: add(position, [
          Math.cos(angle) * (0.18 + random() * 0.46),
          (random() - 0.25) * 0.48,
          Math.sin(angle) * (0.16 + random() * 0.42),
        ]),
        rotation: [random() * 0.75, angle, (random() - 0.5) * 0.8],
        scale:
          kind === "leaf"
            ? 0.52 + random() * 0.28
            : kind === "bud"
              ? 0.7 + random() * 0.22
              : 0.78 + random() * 0.32,
        kind,
        entryId: null,
        sequence: 0,
      },
      branch.id,
    );
  });
}

export function buildTreeTopologyV1(
  snapshot: TreeSnapshot,
  quality: QualityTier = "balanced",
): TreeTopology {
  const events = [...snapshot.events].sort(
    (left, right) => left.sequence - right.sequence,
  );
  const baseBranches = createBaseBranches(snapshot.rootSeed);
  const branches = [...baseBranches];
  const eventFoliage: FoliageNode[] = [];
  events.forEach((event) => {
    if (event.kind === "twig" || event.kind === "branch") {
      branches.push(createGrowthBranch(baseBranches, event));
    }
    const node = createFoliage(branches, event);
    if (node) eventFoliage.push(node);
  });
  return finalizeTopology({
    algorithmVersion: 1,
    stage: "mature",
    totalGrowthUnits: events.reduce(
      (total, event) => total + event.growthUnits,
      0,
    ),
    lastSequence: events.at(-1)?.sequence ?? 0,
    branches,
    foliage: [...createAmbientFoliage(snapshot.rootSeed, baseBranches), ...eventFoliage],
    quality,
  });
}
