import type {
  GrowthKind,
  TreeGrowthEvent,
  TreeSnapshot,
} from "@/lib/contracts";
import type {
  CubicBranch,
  FoliageNode,
  TreeTopology,
  Vec3Tuple,
} from "./types";

const TAU = Math.PI * 2;
const BASE_LIMBS = 5;

function xmur3(value: string): () => number {
  let hash = 1779033703 ^ value.length;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 3432918353);
    hash = (hash << 13) | (hash >>> 19);
  }
  return () => {
    hash = Math.imul(hash ^ (hash >>> 16), 2246822507);
    hash = Math.imul(hash ^ (hash >>> 13), 3266489909);
    return (hash ^= hash >>> 16) >>> 0;
  };
}

function mulberry32(seed: number): () => number {
  return () => {
    let value = (seed += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededRandom(seed: string | number): () => number {
  const seedFactory = xmur3(String(seed));
  return mulberry32(seedFactory());
}

function add(a: Vec3Tuple, b: Vec3Tuple): Vec3Tuple {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function multiply(vector: Vec3Tuple, value: number): Vec3Tuple {
  return [vector[0] * value, vector[1] * value, vector[2] * value];
}

function lerp(a: number, b: number, amount: number): number {
  return a + (b - a) * amount;
}

export function sampleCubic(
  branch: CubicBranch,
  amount: number,
): Vec3Tuple {
  const inverse = 1 - amount;
  const a = inverse * inverse * inverse;
  const b = 3 * inverse * inverse * amount;
  const c = 3 * inverse * amount * amount;
  const d = amount * amount * amount;
  return [
    a * branch.start[0] +
      b * branch.controlA[0] +
      c * branch.controlB[0] +
      d * branch.end[0],
    a * branch.start[1] +
      b * branch.controlA[1] +
      c * branch.controlB[1] +
      d * branch.end[1],
    a * branch.start[2] +
      b * branch.controlA[2] +
      c * branch.controlB[2] +
      d * branch.end[2],
  ];
}

function createBaseBranches(rootSeed: string): CubicBranch[] {
  const random = seededRandom(`base:${rootSeed}`);
  const branches: CubicBranch[] = [
    {
      id: "trunk",
      start: [0, -3.15, 0],
      controlA: [-0.22, -1.3, 0.12],
      controlB: [0.46, 0.55, -0.22],
      end: [0.18, 2.45, 0],
      radiusStart: 0.56,
      radiusEnd: 0.2,
    },
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
    branches.push({
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
    });
  }

  return branches;
}

function attachmentOnStableBase(
  baseBranches: CubicBranch[],
  event: TreeGrowthEvent,
): { branch: CubicBranch; position: Vec3Tuple; amount: number } {
  const random = seededRandom(`attachment:${event.seed}:${event.sequence}`);
  const branch = baseBranches[1 + Math.floor(random() * (baseBranches.length - 1))];
  const amount = 0.44 + random() * 0.52;
  return { branch, position: sampleCubic(branch, amount), amount };
}

function createGrowthBranch(
  baseBranches: CubicBranch[],
  event: TreeGrowthEvent,
): CubicBranch {
  const random = seededRandom(`branch:${event.seed}:${event.sequence}`);
  const attachment = attachmentOnStableBase(baseBranches, event);
  const outward = Math.sign(attachment.position[0] || random() - 0.5);
  const length = event.kind === "branch" ? 1.65 + random() * 0.65 : 0.82 + random() * 0.48;
  const direction: Vec3Tuple = [
    outward * (0.6 + random() * 0.4),
    0.45 + random() * 0.5,
    (random() - 0.5) * 0.82,
  ];
  const end = add(attachment.position, multiply(direction, length));
  return {
    id: `growth-${event.id}`,
    start: attachment.position,
    controlA: add(attachment.position, [
      direction[0] * length * 0.32,
      length * 0.18,
      direction[2] * length * 0.22,
    ]),
    controlB: add(attachment.position, [
      direction[0] * length * 0.68,
      length * 0.5,
      direction[2] * length * 0.72,
    ]),
    end,
    radiusStart: event.kind === "branch" ? 0.105 : 0.067,
    radiusEnd: 0.022,
  };
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

function createFoliage(
  branches: CubicBranch[],
  event: TreeGrowthEvent,
): FoliageNode | null {
  const kind = memoryKind(event.kind);
  if (!kind) return null;
  const random = seededRandom(`foliage:${event.seed}:${event.sequence}`);
  const branch = branches[1 + Math.floor(random() * (branches.length - 1))];
  const amount = 0.58 + random() * 0.4;
  const anchor = sampleCubic(branch, amount);
  const angle = random() * TAU;
  return {
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
  };
}

function createAmbientFoliage(
  rootSeed: string,
  branches: CubicBranch[],
): FoliageNode[] {
  const random = seededRandom(`ambient:${rootSeed}`);
  const result: FoliageNode[] = [];
  for (let index = 0; index < 84; index += 1) {
    const branch = branches[1 + Math.floor(random() * (branches.length - 1))];
    const amount = 0.38 + random() * 0.61;
    const position = sampleCubic(branch, amount);
    const angle = random() * TAU;
    result.push({
      id: `ambient-${index}`,
      position: add(position, [
        Math.cos(angle) * (0.18 + random() * 0.46),
        (random() - 0.25) * 0.48,
        Math.sin(angle) * (0.16 + random() * 0.42),
      ]),
      rotation: [random() * 0.75, angle, (random() - 0.5) * 0.8],
      scale: 0.62 + random() * 0.42,
      kind: random() > 0.6 ? "blossom" : "leaf",
      entryId: null,
      sequence: 0,
    });
  }
  return result;
}

export function buildTreeTopology(snapshot: TreeSnapshot): TreeTopology {
  if (snapshot.algorithmVersion !== 1) {
    throw new Error(`Unsupported tree algorithm version: ${snapshot.algorithmVersion}`);
  }

  const orderedEvents = [...snapshot.events].sort(
    (left, right) => left.sequence - right.sequence,
  );
  const baseBranches = createBaseBranches(snapshot.rootSeed);
  const branches = [...baseBranches];
  const eventFoliage: FoliageNode[] = [];
  orderedEvents.forEach((event) => {
    if (event.kind === "twig" || event.kind === "branch") {
      branches.push(createGrowthBranch(baseBranches, event));
    }
    const node = createFoliage(branches, event);
    if (node) eventFoliage.push(node);
  });
  const foliage = [
    ...createAmbientFoliage(snapshot.rootSeed, baseBranches),
    ...eventFoliage,
  ];

  return {
    algorithmVersion: 1,
    branches,
    foliage,
  };
}

export function topologyFingerprint(topology: TreeTopology): string {
  const normalized = JSON.stringify(topology, (_key, value) =>
    typeof value === "number" ? Number(value.toFixed(5)) : value,
  );
  const hash = xmur3(normalized)();
  return hash.toString(16).padStart(8, "0");
}

export function branchRadiusAt(branch: CubicBranch, amount: number): number {
  return lerp(branch.radiusStart, branch.radiusEnd, amount);
}
