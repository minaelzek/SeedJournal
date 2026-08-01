import type {
  GrowthKind,
  TreeGrowthEvent,
  TreeSnapshot,
  TreeStage,
} from "@/lib/contracts";
import { stageForGrowthUnits } from "@/features/growth/stages";
import type {
  BotanicalOrganKind,
  CubicBranch,
  FoliageNode,
  QualityTier,
  TreeRenderPackageV2,
  Vec3Tuple,
} from "../types";
import { ambientOrganKind } from "../art/sakuraOrganPolicy";
import { finalizeTopology } from "./buffers";
import {
  add,
  clamp,
  distance,
  dot,
  lerpVector,
  multiply,
  normalize,
  sampleCubic,
  seededRandom,
  subtract,
  TAU,
  xmur3,
} from "./math";

const SEED_POSITION: Vec3Tuple = [0, -2.72, 0];
const PRIMARY_SCAFFOLD_UNITS = [12, 18, 28, 40] as const;
const LEADER_EXTENSION_UNITS = [13, 24, 38] as const;
const CROWN_MASSES: readonly Vec3Tuple[] = [
  [-2.72, 1.72, 0.22],
  [0.05, 1.88, -0.18],
  [2.82, 1.78, 0.12],
  [-3.72, 1.08, -0.2],
  [3.78, 1.16, 0.24],
];
const CROWN_MASS_SEQUENCE = [0, 1, 2, 3, 1, 4, 0, 2] as const;

interface GrowthState {
  rootSeed: string;
  totalGrowthUnits: number;
  lastSequence: number;
  branches: CubicBranch[];
  foliage: FoliageNode[];
  childCounts: Map<string, number>;
  memoryByEntry: Map<string, FoliageNode>;
  usedMemoryRenderIds: Set<number>;
  trunkSegments: CubicBranch[];
  leaderTip: CubicBranch | null;
  crownMassTips: Array<CubicBranch | undefined>;
}

function seedOrgan(): FoliageNode {
  return {
    id: "v2-seed",
    parentBranchId: null,
    position: SEED_POSITION,
    rotation: [0.12, 0.34, -0.18],
    scale: 1,
    kind: "seed",
    entryId: null,
    memoryRenderId: 0,
    sequence: 0,
    birthSequence: 0,
    axisProgress: 0,
    windWeight: 0,
  };
}

export function treeStageForUnits(totalGrowthUnits: number): TreeStage {
  return stageForGrowthUnits(totalGrowthUnits);
}

function stageEnvelope(stage: TreeStage): {
  radiusX: number;
  radiusZ: number;
  minimumY: number;
  height: number;
  step: number;
} {
  switch (stage) {
    case "seed":
      return { radiusX: 0, radiusZ: 0, minimumY: -2.72, height: 0, step: 0 };
    case "sprout":
      return {
        radiusX: 0.62,
        radiusZ: 0.28,
        minimumY: -2.64,
        height: 2.2,
        step: 0.3,
      };
    case "sapling":
      return {
        radiusX: 2.15,
        radiusZ: 0.78,
        minimumY: -2.64,
        height: 4.05,
        step: 0.38,
      };
    case "young-tree":
      return {
        radiusX: 3.15,
        radiusZ: 1.28,
        minimumY: -2.64,
        height: 5.15,
        step: 0.44,
      };
    case "established":
      return {
        radiusX: 4,
        radiusZ: 1.64,
        minimumY: -2.64,
        height: 5.82,
        step: 0.46,
      };
    case "mature":
      return {
        radiusX: 4.25,
        radiusZ: 1.85,
        minimumY: -2.64,
        height: 6.15,
        step: 0.43,
      };
  }
}

function createState(rootSeed: string): GrowthState {
  return {
    rootSeed,
    totalGrowthUnits: 0,
    lastSequence: 0,
    branches: [],
    foliage: [seedOrgan()],
    childCounts: new Map(),
    memoryByEntry: new Map(),
    usedMemoryRenderIds: new Set(),
    trunkSegments: [],
    leaderTip: null,
    crownMassTips: Array.from({ length: CROWN_MASSES.length }),
  };
}

function isPrimaryScaffoldUnit(units: number): boolean {
  return PRIMARY_SCAFFOLD_UNITS.includes(
    units as (typeof PRIMARY_SCAFFOLD_UNITS)[number],
  );
}

function isLeaderExtensionUnit(units: number): boolean {
  return LEADER_EXTENSION_UNITS.includes(
    units as (typeof LEADER_EXTENSION_UNITS)[number],
  );
}

function crownMassIndex(units: number): number {
  return CROWN_MASS_SEQUENCE[
    (units - 48) % CROWN_MASS_SEQUENCE.length
  ];
}

function primaryScaffoldParent(
  state: GrowthState,
  units: number,
): CubicBranch | undefined {
  const scaffoldIndex = PRIMARY_SCAFFOLD_UNITS.indexOf(
    units as (typeof PRIMARY_SCAFFOLD_UNITS)[number],
  );
  if (scaffoldIndex < 0 || state.trunkSegments.length === 0) return undefined;
  const trunkIndex = [4, 6, 8, 9][scaffoldIndex];
  return state.trunkSegments[
    Math.min(trunkIndex, state.trunkSegments.length - 1)
  ];
}

function lineageFor(snapshot: TreeSnapshot): Record<string, string> {
  const candidate = (
    snapshot as TreeSnapshot & {
      memoryLineage?: Record<string, string>;
    }
  ).memoryLineage;
  return candidate ?? {};
}

function chooseMemoryRenderId(state: GrowthState, eventId: string): number {
  let renderId = xmur3(`memory-render:${eventId}`)() || 1;
  while (state.usedMemoryRenderIds.has(renderId)) {
    renderId = (renderId + 1) >>> 0 || 1;
  }
  state.usedMemoryRenderIds.add(renderId);
  return renderId;
}

function parentDirection(branch: CubicBranch): Vec3Tuple {
  return normalize(subtract(branch.end, branch.controlB));
}

function branchEndpoint(branch: CubicBranch): Vec3Tuple {
  return branch.end;
}

function attractionPoint(
  state: GrowthState,
  event: TreeGrowthEvent,
  unitOrdinal: number,
  parentMemory: FoliageNode | undefined,
): Vec3Tuple {
  const stage = treeStageForUnits(state.totalGrowthUnits + 1);
  const nextUnits = state.totalGrowthUnits + 1;
  const envelope = stageEnvelope(stage);
  const random = seededRandom(
    `v2:attraction:${state.rootSeed}:${event.seed}:${event.sequence}:${unitOrdinal}`,
  );
  if (parentMemory) {
    const angle = random() * TAU;
    return add(parentMemory.position, [
      Math.cos(angle) * (0.34 + random() * 0.28),
      0.16 + random() * 0.46,
      Math.sin(angle) * (0.18 + random() * 0.24),
    ]);
  }
  if (nextUnits <= 3) {
    const progress = clamp(nextUnits / 3, 0, 1);
    return [
      -0.06 - progress * 0.1 + (random() - 0.5) * 0.12,
      envelope.minimumY + 0.72 * progress,
      (random() - 0.5) * 0.08,
    ];
  }
  if (nextUnits <= 11) {
    const progress = clamp((nextUnits - 3) / 8, 0, 1);
    return [
      -0.12 + (random() - 0.5) * envelope.radiusX * (0.35 + progress * 0.35),
      envelope.minimumY + 0.68 + 1.45 * progress,
      (random() - 0.5) * envelope.radiusZ,
    ];
  }
  if (stage === "sapling") {
    if (isPrimaryScaffoldUnit(nextUnits)) {
      const scaffoldIndex = PRIMARY_SCAFFOLD_UNITS.indexOf(
        nextUnits as (typeof PRIMARY_SCAFFOLD_UNITS)[number],
      );
      const side = scaffoldIndex % 2 === 0 ? -1 : 1;
      return [
        side * envelope.radiusX * (0.66 + random() * 0.18),
        envelope.minimumY + 1.04 + scaffoldIndex * 0.36 + random() * 0.28,
        (random() - 0.5) * envelope.radiusZ * 1.3,
      ];
    }
    const progress = clamp((nextUnits - 12) / 35, 0, 1);
    const side = nextUnits % 2 === 0 ? -1 : 1;
    return [
      side * envelope.radiusX * (0.18 + random() * (0.34 + progress * 0.25)),
      envelope.minimumY + 1.35 + progress * 2.4 + random() * 0.38,
      (random() - 0.5) * envelope.radiusZ * 1.5,
    ];
  }

  // Bias the crown outward to preserve a deliberate central void and expose
  // primary architecture. Alternating phase prevents a mechanically balanced V.
  const massIndex = crownMassIndex(nextUnits);
  const mass = CROWN_MASSES[massIndex];
  const maturity = clamp((nextUnits - 48) / 144, 0, 1);
  return [
    mass[0] * (0.78 + maturity * 0.22) + (random() - 0.5) * 0.72,
    mass[1] + (random() - 0.5) * 0.82,
    mass[2] + (random() - 0.5) * envelope.radiusZ * 0.72,
  ];
}

function chooseParent(
  state: GrowthState,
  target: Vec3Tuple,
  parentMemory: FoliageNode | undefined,
  minimumOrder = 0,
): CubicBranch | null {
  if (state.branches.length === 0) return null;
  const candidates = parentMemory
    ? [...state.branches]
        .sort(
          (left, right) =>
            distance(left.end, parentMemory.position) -
            distance(right.end, parentMemory.position),
        )
        .slice(0, 8)
    : state.branches;
  let selected = candidates[0];
  let selectedScore = Number.POSITIVE_INFINITY;
  for (const branch of candidates) {
    if (branch.order < minimumOrder) continue;
    const children = state.childCounts.get(branch.id) ?? 0;
    if (children >= (branch.order === 0 ? 3 : 2)) continue;
    const toTarget = normalize(subtract(target, branch.end));
    const alignment = dot(parentDirection(branch), toTarget);
    const recency =
      (state.branches.length - state.branches.indexOf(branch)) * 0.012;
    const score =
      distance(branch.end, target) +
      branch.order * 0.2 +
      children * 0.52 +
      recency -
      alignment * 0.34;
    if (score < selectedScore) {
      selected = branch;
      selectedScore = score;
    }
  }
  return selected;
}

function constrainDirection(
  position: Vec3Tuple,
  direction: Vec3Tuple,
  stage: TreeStage,
): Vec3Tuple {
  const envelope = stageEnvelope(stage);
  const predicted = add(position, multiply(direction, envelope.step));
  let result = direction;
  if (Math.abs(predicted[0]) > envelope.radiusX) {
    result = normalize([direction[0] * -0.18, direction[1], direction[2]]);
  }
  if (Math.abs(predicted[2]) > envelope.radiusZ) {
    result = normalize([result[0], result[1], direction[2] * -0.22]);
  }
  if (predicted[1] > envelope.minimumY + envelope.height) {
    result = normalize([result[0], Math.min(0.1, result[1]), result[2]]);
  }
  return result;
}

function addGrowthSegment(
  state: GrowthState,
  event: TreeGrowthEvent,
  unitOrdinal: number,
  identifier: string,
  parentMemory: FoliageNode | undefined,
  options: {
    forcedParent?: CubicBranch;
    forcedTarget?: Vec3Tuple;
    forceLateral?: boolean;
    forceContinuation?: boolean;
    lengthScale?: number;
    minimumParentOrder?: number;
    directionalBias?: number;
  } = {},
): CubicBranch {
  const nextUnits = state.totalGrowthUnits + (event.growthUnits > 0 ? 1 : 0);
  const stage = treeStageForUnits(nextUnits);
  const envelope = stageEnvelope(stage);
  const random = seededRandom(
    `v2:segment:${state.rootSeed}:${event.seed}:${event.sequence}:${unitOrdinal}:${identifier}`,
  );
  const target =
    options.forcedTarget ??
    attractionPoint(state, event, unitOrdinal, parentMemory);
  const parent =
    options.forcedParent ??
    chooseParent(
      state,
      target,
      parentMemory,
      options.minimumParentOrder ?? 0,
    );
  const start = parent ? branchEndpoint(parent) : [0, -2.64, 0] as Vec3Tuple;
  const inertia = parent ? parentDirection(parent) : [-0.11, 0.99, 0.02] as Vec3Tuple;
  const lightSeeking: Vec3Tuple = [-0.05, 0.998, 0.02];
  const towardTarget = normalize(subtract(target, start));
  const forceScaffold =
    options.forceLateral === true ||
    (stage === "sapling" && isPrimaryScaffoldUnit(nextUnits));
  const lateralBranch =
    parent !== null &&
    options.forceContinuation !== true &&
    nextUnits > 11 &&
    (forceScaffold ||
      dot(inertia, towardTarget) < 0.76 ||
      (stage !== "sprout" &&
        (state.totalGrowthUnits + unitOrdinal) % 4 === 0));
  const order = parent ? parent.order + (lateralBranch ? 1 : 0) : 0;
  const droop = clamp(order * 0.065 + Math.abs(start[0]) * 0.012, 0, 0.22);
  const targetWeight =
    options.directionalBias ??
    (forceScaffold ? 0.68 : 0.36);
  const inertiaWeight =
    options.directionalBias === undefined
      ? forceScaffold
        ? 0.16
        : lateralBranch
          ? 0.34
          : 0.58
      : Math.max(0.12, 0.82 - targetWeight);
  let direction = normalize(
    add(
      add(
        multiply(inertia, inertiaWeight),
        multiply(towardTarget, targetWeight),
      ),
      add(
        multiply(lightSeeking, 0.14),
        [
          (random() - 0.5) * 0.12,
          -droop,
          (random() - 0.5) * 0.14,
        ],
      ),
    ),
  );
  direction = constrainDirection(start, direction, stage);
  const length =
    envelope.step *
    (0.88 + random() * 0.24) *
    (order >= 3 ? 0.78 : 1) *
    (forceScaffold ? 1.72 : 1) *
    (options.lengthScale ?? 1);
  const end = add(start, multiply(direction, length));
  const inheritedRadius = parent
    ? Math.max(parent.radiusEnd * (lateralBranch ? 0.88 : 0.97), 0.018)
    : stage === "sprout"
      ? 0.035
      : 0.095;
  const radiusStart = inheritedRadius;
  const radiusEnd = Math.max(0.012, radiusStart * (0.74 + random() * 0.08));
  const firstControlDirection = normalize(
    lerpVector(inertia, direction, lateralBranch ? 0.45 : 0.28),
  );
  const branch: CubicBranch = {
    id: identifier,
    parentId: parent?.id ?? null,
    order,
    start,
    controlA: add(start, multiply(firstControlDirection, length * 0.34)),
    controlB: add(end, multiply(direction, -length * 0.3)),
    end,
    radiusStart,
    radiusEnd,
    birthSequence: event.sequence,
    axisProgress: clamp(
      (end[1] - envelope.minimumY) / Math.max(envelope.height, 0.01),
      0,
      1,
    ),
    windWeight: clamp(order * 0.19 + radiusEnd < 0.035 ? 0.28 : 0.04, 0, 1),
    barkVariation: random(),
  };
  state.branches.push(branch);
  state.childCounts.set(branch.id, 0);
  if (parent) {
    state.childCounts.set(parent.id, (state.childCounts.get(parent.id) ?? 0) + 1);
  }
  return branch;
}

function supportCountForUnits(units: number): number {
  if (units < 12) return 0;
  if (units < 48) return units % 2 === 0 ? 1 : 0;
  if (units < 96) return 1;
  return 2;
}

function addSupportSubgrowth(
  state: GrowthState,
  event: TreeGrowthEvent,
  unitOrdinal: number,
  mainBranch: CubicBranch,
): CubicBranch[] {
  const units = state.totalGrowthUnits + 1;
  if (mainBranch.order === 0) return [];
  const count = supportCountForUnits(units);
  const result: CubicBranch[] = [];
  for (let index = 0; index < count; index += 1) {
    const random = seededRandom(
      `v2:support:${state.rootSeed}:${event.seed}:${event.sequence}:${unitOrdinal}:${index}`,
    );
    const side =
      Math.sign(mainBranch.end[0]) ||
      ((units + index) % 2 === 0 ? -1 : 1);
    const target: Vec3Tuple = add(mainBranch.end, [
      side * (0.34 + random() * 0.36) * (index === 0 ? 1 : -0.72),
      0.12 + random() * 0.3,
      (random() - 0.5) * 0.48,
    ]);
    result.push(
      addGrowthSegment(
        state,
        event,
        unitOrdinal,
        `v2-support-${event.sequence}-${unitOrdinal}-${index}`,
        undefined,
        {
          forcedParent: index === 0 ? mainBranch : result[index - 1],
          forcedTarget: target,
          forceLateral: true,
          lengthScale: 0.68,
        },
      ),
    );
  }
  return result;
}

function addAmbientOrgans(
  state: GrowthState,
  event: TreeGrowthEvent,
  unitOrdinal: number,
  branches: readonly CubicBranch[],
): void {
  const stage = treeStageForUnits(state.totalGrowthUnits + 1);
  const random = seededRandom(
    `v2:organs:${state.rootSeed}:${event.seed}:${event.sequence}:${unitOrdinal}`,
  );
  // Fuller crown than leaf-era, within mature organ budget (~700 ambient+memory).
  const count =
    stage === "sprout"
      ? state.totalGrowthUnits === 0
        ? 3
        : 2
      : stage === "sapling"
        ? 3
        : stage === "young-tree"
          ? 4
          : stage === "established"
            ? 4
            : 5;
  for (let index = 0; index < count; index += 1) {
    const branch = branches[index % branches.length];
    const angle = random() * TAU;
    // Species identity: sakura-forward ambient mix (not leaf-default).
    const stageKind: BotanicalOrganKind = ambientOrganKind(stage, random());
    // Place along the outer half of the branch for fuller crown volume.
    const axis = 0.52 + random() * 0.46;
    const [px, py, pz] = sampleCubic(branch, axis);
    const lateral = 0.04 + random() * (stageKind === "leaf" ? 0.07 : 0.11);
    state.foliage.push({
      id: `v2-organ-${event.sequence}-${unitOrdinal}-${index}`,
      parentBranchId: branch.id,
      position: [
        px + Math.cos(angle) * lateral,
        py + (random() - 0.28) * 0.1,
        pz + Math.sin(angle) * lateral,
      ],
      rotation: [
        -0.25 + random() * 0.68,
        angle,
        (random() - 0.5) * 0.85,
      ],
      scale:
        stageKind === "leaf"
          ? 0.48 + random() * 0.2
          : stageKind === "bud"
            ? 0.62 + random() * 0.18
            : 0.72 + random() * 0.22,
      kind: stageKind,
      entryId: null,
      memoryRenderId: 0,
      sequence: event.sequence,
      birthSequence: event.sequence,
      axisProgress: branch.axisProgress,
      windWeight: clamp(branch.windWeight + 0.18, 0, 1),
    });
  }
  if (stage === "sprout" && state.totalGrowthUnits === 0) {
    const rootBranch = branches[0];
    state.foliage.push({
      id: "v2-radicle",
      parentBranchId: rootBranch.id,
      position: [0.02, -2.82, 0],
      rotation: [0, 0, 0.18],
      scale: 0.72,
      kind: "radicle",
      entryId: null,
      memoryRenderId: 0,
      sequence: event.sequence,
      birthSequence: event.sequence,
      axisProgress: 0,
      windWeight: 0,
    });
  }
}

function memoryKind(kind: GrowthKind): BotanicalOrganKind | null {
  switch (kind) {
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

function addMemoryOrgan(
  state: GrowthState,
  event: TreeGrowthEvent,
  branch: CubicBranch | undefined,
  parentMemory: FoliageNode | undefined,
): void {
  const kind = memoryKind(event.kind);
  if (!kind || !event.entryId) return;
  const random = seededRandom(
    `v2:memory:${state.rootSeed}:${event.seed}:${event.sequence}`,
  );
  const anchor = branch?.end ?? parentMemory?.position ?? SEED_POSITION;
  const angle = random() * TAU;
  const organ: FoliageNode = {
    id: event.id,
    parentBranchId: branch?.id ?? parentMemory?.parentBranchId ?? null,
    position: add(anchor, [
      Math.cos(angle) * (0.06 + random() * 0.08),
      0.03 + random() * 0.09,
      Math.sin(angle) * (0.05 + random() * 0.07),
    ]),
    rotation: [random() * 0.6, angle, (random() - 0.5) * 0.65],
    scale:
      kind === "leaf"
        ? 0.74 + random() * 0.18
        : kind === "bud"
          ? 0.76 + random() * 0.15
          : 0.9 + random() * 0.18,
    kind,
    entryId: event.entryId,
    memoryRenderId: chooseMemoryRenderId(state, event.id),
    sequence: event.sequence,
    birthSequence: event.sequence,
    axisProgress: branch?.axisProgress ?? 0,
    windWeight: clamp((branch?.windWeight ?? 0) + 0.2, 0, 1),
  };
  state.foliage.push(organ);
  state.memoryByEntry.set(event.entryId, organ);
}

function applyEvent(
  state: GrowthState,
  event: TreeGrowthEvent,
  lineage: Record<string, string>,
): void {
  const parentEntryId = event.entryId ? lineage[event.entryId] : undefined;
  const parentMemory = parentEntryId
    ? state.memoryByEntry.get(parentEntryId)
    : undefined;
  let newestBranch: CubicBranch | undefined;
  const growthUnits = event.growthUnits;
  for (let ordinal = 0; ordinal < growthUnits; ordinal += 1) {
    const nextUnits = state.totalGrowthUnits + 1;
    const scaffoldParent = primaryScaffoldParent(state, nextUnits);
    const extendsLeader = isLeaderExtensionUnit(nextUnits);
    const massIndex = nextUnits >= 48 ? crownMassIndex(nextUnits) : -1;
    const existingMassTip =
      massIndex >= 0 ? state.crownMassTips[massIndex] : undefined;
    const forcedParent =
      scaffoldParent ??
      (extendsLeader ? (state.leaderTip ?? undefined) : undefined) ??
      existingMassTip ??
      (massIndex === 1 ? (state.leaderTip ?? undefined) : undefined);
    const forcedTarget = extendsLeader
      ? ([
          -0.06 + (nextUnits % 2) * 0.1,
          (forcedParent?.end[1] ?? -0.2) + 0.86,
          0,
        ] as Vec3Tuple)
      : undefined;
    newestBranch = addGrowthSegment(
      state,
      event,
      ordinal,
      `v2-unit-${event.sequence}-${ordinal}`,
      ordinal === 0 ? parentMemory : undefined,
      {
        forcedParent,
        forcedTarget,
        forceLateral: Boolean(scaffoldParent),
        forceContinuation: extendsLeader,
        minimumParentOrder: nextUnits > 12 ? 1 : 0,
        directionalBias: massIndex >= 0 ? 0.6 : undefined,
      },
    );
    if (nextUnits <= 11) {
      state.trunkSegments.push(newestBranch);
      state.leaderTip = newestBranch;
    } else if (extendsLeader) {
      state.leaderTip = newestBranch;
    }
    if (massIndex >= 0) state.crownMassTips[massIndex] = newestBranch;
    const supportBranches = addSupportSubgrowth(
      state,
      event,
      ordinal,
      newestBranch,
    );
    addAmbientOrgans(
      state,
      event,
      ordinal,
      [newestBranch, ...supportBranches],
    );
    state.totalGrowthUnits += 1;
  }
  if (growthUnits === 0 && (event.kind === "twig" || event.kind === "branch")) {
    newestBranch = addGrowthSegment(
      state,
      event,
      0,
      `v2-structural-${event.sequence}`,
      undefined,
    );
  }
  addMemoryOrgan(state, event, newestBranch, parentMemory);
  state.lastSequence = event.sequence;
}

function orderedEvents(events: readonly TreeGrowthEvent[]): TreeGrowthEvent[] {
  return [...events].sort((left, right) => left.sequence - right.sequence);
}

function assertContiguous(
  events: readonly TreeGrowthEvent[],
  previousSequence: number,
): void {
  let expected = previousSequence + 1;
  for (const event of events) {
    if (event.sequence !== expected) {
      throw new Error(
        `Non-contiguous growth history: expected sequence ${expected}, received ${event.sequence}`,
      );
    }
    expected += 1;
  }
}

function applyPipeRadii(
  branches: readonly CubicBranch[],
  totalGrowthUnits: number,
): CubicBranch[] {
  const indexById = new Map(
    branches.map((branch, index) => [branch.id, index]),
  );
  const children = branches.map(() => [] as number[]);
  branches.forEach((branch, index) => {
    if (!branch.parentId) return;
    const parentIndex = indexById.get(branch.parentId);
    if (parentIndex !== undefined) children[parentIndex].push(index);
  });
  const terminalLoad = new Float32Array(branches.length);
  for (let index = branches.length - 1; index >= 0; index -= 1) {
    terminalLoad[index] =
      children[index].length === 0
        ? 1
        : children[index].reduce(
            (sum, childIndex) => sum + terminalLoad[childIndex],
            0,
          );
  }
  const maturity = clamp(totalGrowthUnits / 192, 0.16, 1);
  const baseFloor =
    totalGrowthUnits >= 192
      ? 0.34
      : totalGrowthUnits >= 96
        ? 0.25 + ((totalGrowthUnits - 96) / 96) * 0.08
        : totalGrowthUnits >= 48
          ? 0.18 + ((totalGrowthUnits - 48) / 48) * 0.06
          : totalGrowthUnits >= 12
            ? 0.075 + ((totalGrowthUnits - 12) / 36) * 0.075
            : 0.035 + (totalGrowthUnits / 12) * 0.035;
  const scaffoldFloor =
    totalGrowthUnits >= 192
      ? 0.115
      : totalGrowthUnits >= 96
        ? 0.09 + ((totalGrowthUnits - 96) / 96) * 0.02
        : totalGrowthUnits >= 48
          ? 0.068 + ((totalGrowthUnits - 48) / 48) * 0.018
          : totalGrowthUnits >= 12
            ? 0.042 + ((totalGrowthUnits - 12) / 36) * 0.022
            : 0.026;
  const piped = branches.map((branch, index) => {
    const load = Math.max(1, terminalLoad[index]);
    const childLoad = Math.max(
      1,
      children[index].reduce(
        (sum, childIndex) => sum + terminalLoad[childIndex],
        0,
      ),
    );
    const orderFactor = Math.pow(0.78, branch.order);
    const pipeStart =
      0.026 +
      Math.sqrt(load) * 0.024 * maturity * orderFactor +
      (branch.parentId === null ? 0.07 * maturity : 0);
    const pipeEnd =
      0.014 +
      Math.sqrt(childLoad) * 0.014 * maturity * orderFactor;
    const parentIndex = branch.parentId
      ? indexById.get(branch.parentId)
      : undefined;
    const parent = parentIndex === undefined ? undefined : branches[parentIndex];
    const primaryScaffold = branch.order === 1 && parent?.order === 0;
    const trunkStartFloor =
      branch.order === 0
        ? baseFloor * clamp(0.92 - branch.axisProgress * 0.45, 0.42, 0.92)
        : 0;
    const trunkEndFloor =
      branch.order === 0
        ? baseFloor * clamp(0.66 - branch.axisProgress * 0.34, 0.28, 0.66)
        : 0;
    return {
      ...branch,
      radiusStart: clamp(
        Math.max(
          branch.radiusStart,
          pipeStart,
          branch.parentId === null ? baseFloor : 0,
          trunkStartFloor,
          primaryScaffold ? scaffoldFloor : 0,
        ),
        0.016,
        branch.parentId === null ? 0.48 : 0.31,
      ),
      radiusEnd: clamp(
        Math.max(
          branch.radiusEnd,
          Math.min(pipeEnd, pipeStart * 0.92),
          trunkEndFloor,
          primaryScaffold ? scaffoldFloor * 0.48 : 0,
        ),
        0.012,
        0.26,
      ),
    };
  });
  // A child begins with a slightly flared collar over its parent's terminal
  // ring. This prevents open annuli and detached-looking limbs in the swept
  // mesh while leaving every centerline unchanged.
  return piped.map((branch) => {
    if (!branch.parentId) return branch;
    const parentIndex = indexById.get(branch.parentId);
    const parent = parentIndex === undefined ? undefined : piped[parentIndex];
    return parent
      ? {
          ...branch,
          radiusStart: Math.max(branch.radiusStart, parent.radiusEnd * 1.06),
        }
      : branch;
  });
}

export class TreeEngineV2 {
  readonly rootSeed: string;
  readonly treeId: string;
  private readonly state: GrowthState;
  private readonly lineage: Record<string, string>;
  private quality: QualityTier;

  constructor(snapshot: TreeSnapshot, quality: QualityTier = "balanced") {
    this.rootSeed = snapshot.rootSeed;
    this.treeId = snapshot.treeId;
    this.state = createState(snapshot.rootSeed);
    this.lineage = lineageFor(snapshot);
    this.quality = quality;
    const events = orderedEvents(snapshot.events);
    if (events.length > 0) assertContiguous(events, 0);
    events.forEach((event) => applyEvent(this.state, event, this.lineage));
  }

  get lastSequence(): number {
    return this.state.lastSequence;
  }

  append(
    events: readonly TreeGrowthEvent[],
    memoryLineage?: Record<string, string>,
  ): TreeRenderPackageV2 {
    if (memoryLineage) Object.assign(this.lineage, memoryLineage);
    const ordered = orderedEvents(events);
    if (ordered.length > 0) assertContiguous(ordered, this.state.lastSequence);
    ordered.forEach((event) => applyEvent(this.state, event, this.lineage));
    return this.render();
  }

  setQuality(quality: QualityTier): TreeRenderPackageV2 {
    this.quality = quality;
    return this.render();
  }

  render(): TreeRenderPackageV2 {
    const renderedBranches = applyPipeRadii(
      this.state.branches,
      this.state.totalGrowthUnits,
    );
    return finalizeTopology({
      algorithmVersion: 2,
      stage: treeStageForUnits(this.state.totalGrowthUnits),
      totalGrowthUnits: this.state.totalGrowthUnits,
      lastSequence: this.state.lastSequence,
      branches: renderedBranches,
      foliage: [...this.state.foliage],
      quality: this.quality,
    }) as TreeRenderPackageV2;
  }
}

export function buildTreeTopologyV2(
  snapshot: TreeSnapshot,
  quality: QualityTier = "balanced",
): TreeRenderPackageV2 {
  return new TreeEngineV2(snapshot, quality).render();
}
